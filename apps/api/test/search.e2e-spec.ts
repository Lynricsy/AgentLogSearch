import { resolve } from "node:path"
import { SOURCE_PRESET_DEFAULTS } from "@agent-log-search/shared"
import { HttpStatus, type INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import { Pool, type PoolClient } from "pg"
import request from "supertest"
import { AppModule } from "../src/app.module"
import { configureApp } from "../src/bootstrap"
import { PrismaService } from "../src/database/prisma.service"

const E2E_DATABASE_LOCK_ID = "160160016"
const E2E_SOURCE_PREFIXES = ["T11 ", "T12 ", "T14 ", "T15 "] as const

describe("Semantic Search API", () => {
  let app: INestApplication
  let prisma: PrismaService
  let lockPool: Pool
  let lockClient: PoolClient | null = null
  const sourceIds: bigint[] = []

  beforeAll(async () => {
    lockPool = new Pool({ connectionString: process.env.DATABASE_URL })
    lockClient = await lockPool.connect()
    await lockClient.query("SELECT pg_advisory_lock($1::bigint)", [E2E_DATABASE_LOCK_ID])

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    configureApp(app)
    await app.init()
    prisma = app.get(PrismaService)
    await deleteE2eSources()
  })

  beforeEach(async () => {
    if (prisma === undefined) {
      return
    }
    await deleteE2eSources()
  })

  afterEach(async () => {
    if (prisma === undefined) {
      return
    }
    await deleteE2eSources()
    sourceIds.length = 0
  })

  afterAll(async () => {
    try {
      if (app !== undefined) {
        await app.close()
      }
    } finally {
      if (lockClient !== null) {
        await lockClient.query("SELECT pg_advisory_unlock($1::bigint)", [E2E_DATABASE_LOCK_ID])
        lockClient.release()
      }
      if (lockPool !== undefined) {
        await lockPool.end()
      }
    }
  })

  it("returns empty records when no ready chunks are searchable", async () => {
    // Given
    const sourceId = await createDemoSource()
    const scanResponse = await request(app.getHttpServer())
      .post(`/api/scan/run/${sourceId.toString()}`)
      .send()
    expect(scanResponse.status).toBe(201)

    // When
    const response = await request(app.getHttpServer())
      .post("/api/search/semantic")
      .send({ query: "之前修过登录接口 500 的那次" })

    // Then
    expect(response.status).toBe(HttpStatus.OK)
    expect(response.body).toEqual({ records: [] })
  })

  it("finds the login 500 demo session and returns session detail", async () => {
    // Given
    const sourceId = await createDemoSource()
    const scanResponse = await request(app.getHttpServer())
      .post(`/api/scan/run/${sourceId.toString()}`)
      .send()
    expect(scanResponse.status).toBe(201)
    await processAllEmbeddings(sourceId)

    // When
    const searchResponse = await request(app.getHttpServer())
      .post("/api/search/semantic")
      .send({ query: "之前修过登录接口 500 的那次", topK: 20, sessionLimit: 5 })

    // Then
    expect(searchResponse.status).toBe(HttpStatus.OK)
    const target = searchResponse.body.records.find(
      (record: { readonly threadId?: string }) => record.threadId === "abc123",
    )
    expect(target).toEqual(
      expect.objectContaining({
        threadId: "abc123",
        resumeCommand: expect.stringContaining("abc123"),
        matchedChunks: expect.arrayContaining([
          expect.objectContaining({ snippet: expect.stringContaining("登录接口返回 500") }),
        ]),
      }),
    )

    // When
    const detailResponse = await request(app.getHttpServer()).get(
      `/api/sessions/${target.sessionId}`,
    )

    // Then
    expect(detailResponse.status).toBe(200)
    expect(detailResponse.body).toEqual(
      expect.objectContaining({
        id: target.sessionId,
        externalThreadId: "abc123",
        resumeCommand: expect.stringContaining("abc123"),
        messages: expect.arrayContaining([
          expect.objectContaining({ content: expect.stringContaining("登录接口返回 500") }),
        ]),
      }),
    )
  })

  async function createDemoSource(): Promise<bigint> {
    const response = await request(app.getHttpServer())
      .post("/api/sources")
      .send({
        ...SOURCE_PRESET_DEFAULTS.generic,
        name: `T15 Demo ${Date.now()}`,
        parserType: "generic-jsonl",
        rootPath: resolve(process.cwd(), "../../sample-data/demo-agent"),
        fileGlob: "*.jsonl",
        resumeTemplate: "cd {quoted cwd} && codex resume {quoted threadId}",
      })
    expect(response.status).toBe(201)
    const sourceId = BigInt(response.body.id)
    sourceIds.push(sourceId)
    return sourceId
  }

  async function deleteE2eSources(): Promise<void> {
    const sources = await prisma.agentSource.findMany({
      select: { id: true },
      where: {
        OR: E2E_SOURCE_PREFIXES.map((prefix) => ({ name: { startsWith: prefix } })),
      },
    })
    if (sources.length === 0) {
      return
    }
    const ids = sources.map((source) => source.id)
    await prisma.scanJob.deleteMany({ where: { sourceId: { in: ids } } })
    await prisma.embeddingJob.deleteMany({ where: { sourceId: { in: ids } } })
    await prisma.agentSource.deleteMany({ where: { id: { in: ids } } })
  }

  async function processAllEmbeddings(sourceId: bigint): Promise<void> {
    for (let remaining = true; remaining; ) {
      const response = await request(app.getHttpServer())
        .post("/api/embeddings/process")
        .send({ sourceId: sourceId.toString() })
      expect(response.status).toBe(201)
      remaining = response.body.processedChunks > 0
    }
  }
})
