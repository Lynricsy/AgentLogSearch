import { resolve } from "node:path"
import { SOURCE_PRESET_DEFAULTS } from "@agent-log-search/shared"
import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import { EmbeddingStatus } from "@prisma/client"
import { Pool, type PoolClient } from "pg"
import request from "supertest"
import { AppModule } from "../src/app.module"
import { configureApp } from "../src/bootstrap"
import { PrismaService } from "../src/database/prisma.service"

const E2E_DATABASE_LOCK_ID = "160160016"
const E2E_SOURCE_PREFIXES = ["T11 ", "T12 ", "T14 ", "T15 "] as const

describe("Scan Run API", () => {
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

  afterEach(async () => {
    if (prisma === undefined) {
      return
    }
    await prisma.agentSource.deleteMany({ where: { id: { in: sourceIds } } })
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

  it("imports sessions and messages from sample-data sources", async () => {
    // Given
    const created = await Promise.all([
      createSource("Demo", "generic-jsonl", "generic", {
        ...SOURCE_PRESET_DEFAULTS.generic,
        fileGlob: "*.jsonl",
      }),
      createSource("Codex", "codex-jsonl", "codex", SOURCE_PRESET_DEFAULTS.codex),
      createSource("Claude", "claude-jsonl", "claude", SOURCE_PRESET_DEFAULTS["claude-code"]),
      createSource("Pi", "pi-jsonl", "pi-agent", SOURCE_PRESET_DEFAULTS["pi-agent"]),
      createSource("OpenCode", "opencode-sqlite", "opencode", SOURCE_PRESET_DEFAULTS.opencode),
    ])
    sourceIds.push(...created.map((source) => BigInt(source.id)))

    // When
    const response = await request(app.getHttpServer()).post("/api/scan/run").send()

    // Then
    expect(response.status).toBe(201)
    expect(response.body).toEqual({
      records: expect.arrayContaining([
        expect.objectContaining({ sourceId: created[0]?.id, status: "completed" }),
        expect.objectContaining({ sourceId: created[1]?.id, status: "completed" }),
        expect.objectContaining({ sourceId: created[2]?.id, status: "completed" }),
        expect.objectContaining({ sourceId: created[3]?.id, status: "completed" }),
        expect.objectContaining({ sourceId: created[4]?.id, status: "completed" }),
      ]),
    })
    await expectImportedCounts(sourceIds)
    await expectImportedChunks(sourceIds)
  })

  async function createSource(
    label: string,
    parserType: string,
    fixtureDir: string,
    defaults: typeof SOURCE_PRESET_DEFAULTS.generic,
  ): Promise<{ readonly id: string }> {
    const response = await request(app.getHttpServer())
      .post("/api/sources")
      .send({
        ...defaults,
        name: `T11 ${label} ${Date.now()}`,
        parserType,
        rootPath: resolve(process.cwd(), "../../sample-data", fixtureDir),
      })
    expect(response.status).toBe(201)
    return response.body
  }

  async function expectImportedCounts(ids: readonly bigint[]): Promise<void> {
    const [sessions, messages] = await Promise.all([
      prisma.agentSession.count({ where: { sourceId: { in: ids } } }),
      prisma.agentMessage.count({
        where: { session: { sourceId: { in: ids } } },
      }),
    ])
    expect(sessions).toBeGreaterThanOrEqual(5)
    expect(messages).toBeGreaterThanOrEqual(15)
  }

  async function expectImportedChunks(ids: readonly bigint[]): Promise<void> {
    const [chunks, pendingChunk] = await Promise.all([
      prisma.agentChunk.count({ where: { sourceId: { in: ids } } }),
      prisma.agentChunk.findFirst({
        where: { sourceId: { in: ids }, embeddingStatus: EmbeddingStatus.pending },
        orderBy: [{ sourceId: "asc" }, { chunkIndex: "asc" }],
      }),
    ])
    expect(chunks).toBeGreaterThan(0)
    expect(pendingChunk).not.toBeNull()
    expect(pendingChunk?.embeddingStatus).toBe(EmbeddingStatus.pending)
    expect(pendingChunk?.startMessageSeq).not.toBeNull()
    expect(pendingChunk?.endMessageSeq).not.toBeNull()
    expect(pendingChunk?.chunkText).toContain("Agent:")
    expect(pendingChunk?.chunkText).toContain("CWD:")
    expect(pendingChunk?.chunkText).toContain("Thread:")
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
})
