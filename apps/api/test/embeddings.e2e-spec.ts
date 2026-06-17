import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import { EmbeddingStatus } from "@prisma/client"
import request from "supertest"
import { AppModule } from "../src/app.module"
import { configureApp } from "../src/bootstrap"
import { PgService } from "../src/database/pg.service"
import { PrismaService } from "../src/database/prisma.service"

type SeededSource = {
  readonly sourceId: bigint
  readonly sessionId: bigint
  readonly chunkId: bigint
}

type ChunkVectorRow = {
  readonly id: string
  readonly embedding_status: string
  readonly embedding_model: string | null
  readonly has_embedding: boolean
}

describe("Embeddings API", () => {
  let app: INestApplication
  let pg: PgService
  let prisma: PrismaService
  const sourceIds: bigint[] = []

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    configureApp(app)
    await app.init()
    pg = app.get(PgService)
    prisma = app.get(PrismaService)
  })

  afterEach(async () => {
    await prisma.embeddingJob.deleteMany({ where: { sourceId: { in: sourceIds } } })
    await prisma.agentSource.deleteMany({ where: { id: { in: sourceIds } } })
    sourceIds.length = 0
  })

  afterAll(async () => {
    await app.close()
  })

  it("processes pending chunks and rebuilds one source without changing other sources", async () => {
    // Given
    const target = await seedSourceWithChunk("target", EmbeddingStatus.pending)
    const other = await seedSourceWithChunk("other", EmbeddingStatus.pending)

    // When
    const processResponse = await request(app.getHttpServer())
      .post("/api/embeddings/process")
      .send({ sourceId: target.sourceId.toString() })

    // Then
    expect(processResponse.status).toBe(201)
    expect(processResponse.body).toEqual(
      expect.objectContaining({
        requestedBy: "process",
        status: "completed",
        sourceId: target.sourceId.toString(),
        totalChunks: 1,
        processedChunks: 1,
        failedChunks: 0,
      }),
    )
    await expectChunkReady(target.chunkId)
    const otherProcessResponse = await request(app.getHttpServer())
      .post("/api/embeddings/process")
      .send({ sourceId: other.sourceId.toString() })
    expect(otherProcessResponse.status).toBe(201)
    await expectChunkReady(other.chunkId)
    const targetFailedChunkId = await seedAdditionalChunk(target, 1, EmbeddingStatus.failed)

    // When
    const rebuildResponse = await request(app.getHttpServer())
      .post("/api/embeddings/rebuild")
      .send({ sourceId: target.sourceId.toString() })

    // Then
    expect(rebuildResponse.status).toBe(201)
    expect(rebuildResponse.body).toEqual(
      expect.objectContaining({
        requestedBy: "rebuild",
        status: "completed",
        sourceId: target.sourceId.toString(),
        totalChunks: 2,
        processedChunks: 0,
      }),
    )
    expect(await chunkStatus(target.chunkId)).toBe("pending")
    expect(await chunkStatus(targetFailedChunkId)).toBe("pending")
    expect(await chunkHasEmbedding(target.chunkId)).toBe(false)
    expect(await chunkStatus(other.chunkId)).toBe("ready")
    expect(await chunkHasEmbedding(other.chunkId)).toBe(true)

    // When
    const reprocessResponse = await request(app.getHttpServer())
      .post("/api/embeddings/process")
      .send({ sourceId: target.sourceId.toString() })

    // Then
    expect(reprocessResponse.status).toBe(201)
    expect(reprocessResponse.body).toEqual(
      expect.objectContaining({
        requestedBy: "process",
        status: "completed",
        processedChunks: 2,
      }),
    )
    await expectChunkReady(target.chunkId)
    await expectChunkReady(targetFailedChunkId)
    expect(await chunkStatus(other.chunkId)).toBe("ready")
  })

  async function seedSourceWithChunk(
    label: string,
    status: EmbeddingStatus,
  ): Promise<SeededSource> {
    const source = await prisma.agentSource.create({
      data: {
        name: `T14 ${label} ${Date.now()}`,
        sourcePreset: "generic",
        parserType: "generic_jsonl",
        readerType: "file_glob",
        rootPath: "/tmp",
        fileGlob: "*.jsonl",
        resumeTemplate: "cd {quoted cwd}",
      },
    })
    sourceIds.push(source.id)
    const session = await prisma.agentSession.create({
      data: {
        sourceId: source.id,
        agentName: "generic",
        externalThreadId: `t14-${label}-${source.id.toString()}`,
        cwd: "/workspace",
        messageCount: 1,
      },
    })
    const chunk = await prisma.agentChunk.create({
      data: {
        sourceId: source.id,
        sessionId: session.id,
        chunkIndex: 0,
        startMessageSeq: 0,
        endMessageSeq: 0,
        agentName: "generic",
        externalThreadId: session.externalThreadId,
        cwd: "/workspace",
        chunkText: `Agent: generic\nCWD: /workspace\nThread: ${session.externalThreadId}\n\nUser: ${label}`,
        embeddingStatus: status,
      },
    })
    return { sourceId: source.id, sessionId: session.id, chunkId: chunk.id }
  }

  async function seedAdditionalChunk(
    source: SeededSource,
    chunkIndex: number,
    status: EmbeddingStatus,
  ): Promise<bigint> {
    const chunk = await prisma.agentChunk.create({
      data: {
        sourceId: source.sourceId,
        sessionId: source.sessionId,
        chunkIndex,
        startMessageSeq: chunkIndex,
        endMessageSeq: chunkIndex,
        agentName: "generic",
        externalThreadId: `t14-extra-${source.sourceId.toString()}-${chunkIndex.toString()}`,
        cwd: "/workspace",
        chunkText: `Agent: generic\nCWD: /workspace\nThread: extra\n\nUser: failed ${chunkIndex.toString()}`,
        embeddingStatus: status,
        embeddingError: status === EmbeddingStatus.failed ? "previous failure" : null,
      },
    })
    return chunk.id
  }

  async function expectChunkReady(chunkId: bigint): Promise<void> {
    const row = await readChunkVectorRow(chunkId)
    expect(row).toEqual(
      expect.objectContaining({
        embedding_status: "ready",
        embedding_model: "mock-1024",
        has_embedding: true,
      }),
    )
  }

  async function chunkStatus(chunkId: bigint): Promise<string> {
    return (await readChunkVectorRow(chunkId)).embedding_status
  }

  async function chunkHasEmbedding(chunkId: bigint): Promise<boolean> {
    return (await readChunkVectorRow(chunkId)).has_embedding
  }

  async function readChunkVectorRow(chunkId: bigint): Promise<ChunkVectorRow> {
    const result = await pg.query<ChunkVectorRow>(
      `
        SELECT id::text, embedding_status, embedding_model, embedding IS NOT NULL AS has_embedding
        FROM agent_chunk
        WHERE id = $1
      `,
      [chunkId],
    )
    const row = result.rows[0]
    if (row === undefined) {
      throw new MissingChunkAssertionError(chunkId)
    }
    return row
  }
})

class MissingChunkAssertionError extends Error {
  public readonly name = "MissingChunkAssertionError"

  public constructor(public readonly chunkId: bigint) {
    super(`Missing chunk ${chunkId.toString()}`)
  }
}
