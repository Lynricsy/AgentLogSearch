import { resolve } from "node:path"
import {
  type ParserType,
  SOURCE_PRESET_DEFAULTS,
  type SourcePreset,
  type SourceReaderType,
} from "@agent-log-search/shared"
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
      createSource("Generic JSON", "generic-json", "generic", {
        ...SOURCE_PRESET_DEFAULTS.generic,
        fileGlob: "*.json",
        parserType: "generic-json",
      }),
      createSource("Generic Markdown", "generic-markdown", "generic", {
        ...SOURCE_PRESET_DEFAULTS.generic,
        fileGlob: "*.md",
        parserType: "generic-markdown",
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
      records: expect.arrayContaining(
        created.map((source) =>
          expect.objectContaining({ sourceId: source.id, status: "completed" }),
        ),
      ),
    })
    await expectImportedCounts(sourceIds)
    await expectImportedChunks(sourceIds)
    await expectImportedSession({
      chunkSnippet: "extract threadId, cwd, title, roles, and content from JSON.",
      messageSnippet: "extract threadId, cwd, title, roles, and content from JSON.",
      modelName: "generic-json-synthetic",
      sourceId: BigInt(created[1]?.id ?? "0"),
      threadId: "generic-json-thread-synthetic-001",
      title: "Synthetic Generic JSON Session",
    })
    await expectImportedSession({
      chunkSnippet: "Markdown fixtures expose threadId, cwd, title, role, and content fields.",
      messageSnippet: "Markdown fixtures expose threadId, cwd, title, role, and content fields.",
      modelName: "generic-markdown-synthetic",
      sourceId: BigInt(created[2]?.id ?? "0"),
      threadId: "generic-md-thread-synthetic-001",
      title: "Synthetic Generic Markdown Session",
    })
  })

  async function createSource(
    label: string,
    parserType: ParserType,
    fixtureDir: string,
    defaults: {
      readonly fileGlob: string
      readonly parserType: ParserType
      readonly readerType: SourceReaderType
      readonly resumeTemplate: string
      readonly rootPath: string
      readonly sourcePreset: SourcePreset
    },
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
    expect(sessions).toBe(7)
    expect(messages).toBe(14)
  }

  async function expectImportedChunks(ids: readonly bigint[]): Promise<void> {
    const [chunks, pendingChunk] = await Promise.all([
      prisma.agentChunk.count({ where: { sourceId: { in: ids } } }),
      prisma.agentChunk.findFirst({
        where: { sourceId: { in: ids }, embeddingStatus: EmbeddingStatus.pending },
        orderBy: [{ sourceId: "asc" }, { chunkIndex: "asc" }],
      }),
    ])
    expect(chunks).toBeGreaterThanOrEqual(7)
    expect(pendingChunk).not.toBeNull()
    expect(pendingChunk?.embeddingStatus).toBe(EmbeddingStatus.pending)
    expect(pendingChunk?.startMessageSeq).not.toBeNull()
    expect(pendingChunk?.endMessageSeq).not.toBeNull()
    expect(pendingChunk?.chunkText).toContain("Agent:")
    expect(pendingChunk?.chunkText).toContain("CWD:")
    expect(pendingChunk?.chunkText).toContain("Thread:")
  }

  async function expectImportedSession(input: {
    readonly chunkSnippet: string
    readonly messageSnippet: string
    readonly modelName: string
    readonly sourceId: bigint
    readonly threadId: string
    readonly title: string
  }): Promise<void> {
    const session = await prisma.agentSession.findFirst({
      where: { externalThreadId: input.threadId, sourceId: input.sourceId },
      include: {
        chunks: { orderBy: { chunkIndex: "asc" } },
        messages: { orderBy: { seqNo: "asc" } },
      },
    })

    expect(session).not.toBeNull()
    expect(session?.title).toBe(input.title)
    expect(session?.cwd).toBe("/workspace/synthetic-generic")
    expect(session?.modelName).toBe(input.modelName)
    expect(session?.messageCount).toBe(2)
    expect(session?.resumeCommand).toBe("cd '/workspace/synthetic-generic'")
    expect(session?.messages.map((message) => message.role)).toEqual(["user", "assistant"])
    expect(
      session?.messages.some((message) => message.content.includes(input.messageSnippet)),
    ).toBe(true)
    expect(
      session?.chunks.some(
        (chunk) =>
          chunk.chunkText.includes(`Thread: ${input.threadId}`) &&
          chunk.chunkText.includes("CWD: /workspace/synthetic-generic") &&
          chunk.chunkText.includes(input.chunkSnippet),
      ),
    ).toBe(true)
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
