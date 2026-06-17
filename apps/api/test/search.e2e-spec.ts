import { resolve } from "node:path"
import { SOURCE_PRESET_DEFAULTS } from "@agent-log-search/shared"
import { HttpStatus, type INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { AppModule } from "../src/app.module"
import { configureApp } from "../src/bootstrap"
import { PrismaService } from "../src/database/prisma.service"

describe("Semantic Search API", () => {
  let app: INestApplication
  let prisma: PrismaService
  const sourceIds: bigint[] = []

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    configureApp(app)
    await app.init()
    prisma = app.get(PrismaService)
  })

  beforeEach(async () => {
    await deleteT15SearchSources()
  })

  afterEach(async () => {
    await deleteT15SearchSources()
    sourceIds.length = 0
  })

  afterAll(async () => {
    await app.close()
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
    await processAllEmbeddings()

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

  async function deleteT15SearchSources(): Promise<void> {
    const sources = await prisma.agentSource.findMany({
      select: { id: true },
      where: { name: { startsWith: "T15 " } },
    })
    if (sources.length === 0) {
      return
    }
    const ids = sources.map((source) => source.id)
    await prisma.embeddingJob.deleteMany({ where: { sourceId: { in: ids } } })
    await prisma.agentSource.deleteMany({ where: { id: { in: ids } } })
  }

  async function processAllEmbeddings(): Promise<void> {
    for (let remaining = true; remaining; ) {
      const response = await request(app.getHttpServer()).post("/api/embeddings/process").send()
      expect(response.status).toBe(201)
      remaining = response.body.processedChunks > 0
    }
  }
})
