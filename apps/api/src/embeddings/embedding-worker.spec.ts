import type { PrismaService } from "../database/prisma.service.js"
import type { EmbeddingJobSummary } from "./embedding-records.js"
import type { EmbeddingSqlStore } from "./embedding-sql.js"
import {
  FakeEmbeddingPrisma,
  FakeEmbeddingProvider,
  FakeEmbeddingSqlStore,
} from "./embedding-test-fakes.js"
import {
  DEFAULT_EMBEDDING_WORKER_INTERVAL_MS,
  DEFAULT_EMBEDDING_WORKER_STALE_PROCESSING_MS,
  EmbeddingWorker,
  readEmbeddingWorkerConfig,
} from "./embedding-worker.js"
import { EmbeddingsService } from "./embeddings.service.js"

describe("EmbeddingWorker", () => {
  it("does not create a job when no chunks are pending", async () => {
    // Given
    const prisma = new FakeEmbeddingPrisma()
    const store = new FakeEmbeddingSqlStore()
    const service = createService({ prisma, store })
    const worker = new EmbeddingWorker(service, store as unknown as EmbeddingSqlStore, {
      enabled: true,
      intervalMs: 1000,
      sourceId: null,
      staleProcessingMs: 60_000,
    })

    // When
    await worker.tick()

    // Then
    expect(() => prisma.latestJob()).toThrow("Missing fake embedding job")
  })

  it("processes pending chunks as scheduler work", async () => {
    // Given
    const prisma = new FakeEmbeddingPrisma()
    const store = new FakeEmbeddingSqlStore()
    store.addChunk({ id: 10n, sourceId: 1n, status: "pending", text: "hello" })
    const service = createService({ prisma, store })
    const worker = new EmbeddingWorker(service, store as unknown as EmbeddingSqlStore, {
      enabled: true,
      intervalMs: 1000,
      sourceId: null,
      staleProcessingMs: 60_000,
    })

    // When
    await worker.tick()

    // Then
    expect(store.chunkStatus(10n)).toBe("ready")
    expect(prisma.latestJob().requestedBy).toBe("scheduler")
  })

  it("resets stale processing chunks before checking for work", async () => {
    // Given
    const prisma = new FakeEmbeddingPrisma()
    const store = new FakeEmbeddingSqlStore()
    store.addChunk({ id: 20n, sourceId: 1n, status: "pending", text: "stale" })
    store.markChunkStaleProcessing(20n)
    const service = createService({ prisma, store })
    const worker = new EmbeddingWorker(service, store as unknown as EmbeddingSqlStore, {
      enabled: true,
      intervalMs: 1000,
      sourceId: null,
      staleProcessingMs: 60_000,
    })

    // When
    await worker.tick()

    // Then
    expect(store.chunkStatus(20n)).toBe("ready")
    expect(prisma.latestJob().requestedBy).toBe("scheduler")
  })

  it("keeps ticking after a failed scheduled batch", async () => {
    // Given
    jest.useFakeTimers()
    const process = jest
      .fn<Promise<EmbeddingJobSummary>, [bigint | null, "scheduler"]>()
      .mockRejectedValueOnce(new Error("provider unavailable"))
      .mockResolvedValue({
        id: "1",
        sourceId: null,
        status: "completed",
        requestedBy: "scheduler",
        totalChunks: 1,
        processedChunks: 1,
        failedChunks: 0,
        errorMessage: null,
        createdAt: "2026-06-21T00:00:00.000Z",
        startedAt: "2026-06-21T00:00:00.000Z",
        finishedAt: "2026-06-21T00:00:01.000Z",
      })
    const service = { process } as unknown as EmbeddingsService
    const store = {
      countProcessableChunks: jest.fn<Promise<number>, [bigint | null]>().mockResolvedValue(1),
      resetStaleProcessingChunks: jest
        .fn<Promise<number>, [bigint | null, number]>()
        .mockResolvedValue(0),
    } as unknown as EmbeddingSqlStore
    const worker = new EmbeddingWorker(service, store, {
      enabled: true,
      intervalMs: 1000,
      sourceId: null,
      staleProcessingMs: 60_000,
    })

    // When
    worker.onModuleInit()
    await Promise.resolve()
    await jest.advanceTimersByTimeAsync(1000)
    worker.onModuleDestroy()
    jest.useRealTimers()

    // Then
    expect(process).toHaveBeenCalledTimes(2)
  })
})

describe("readEmbeddingWorkerConfig", () => {
  it("defaults to enabled outside test and disabled in test", () => {
    expect(readEmbeddingWorkerConfig({ NODE_ENV: "production" }).enabled).toBe(true)
    expect(readEmbeddingWorkerConfig({ NODE_ENV: "test" }).enabled).toBe(false)
  })

  it("parses optional overrides", () => {
    expect(
      readEmbeddingWorkerConfig({
        EMBEDDING_WORKER_ENABLED: "true",
        EMBEDDING_WORKER_INTERVAL_MS: "2500",
        EMBEDDING_WORKER_SOURCE_ID: "42",
        EMBEDDING_WORKER_STALE_PROCESSING_MS: "30000",
        NODE_ENV: "test",
      }),
    ).toEqual({
      enabled: true,
      intervalMs: 2500,
      sourceId: 42n,
      staleProcessingMs: 30_000,
    })
  })

  it("falls back for invalid numeric values", () => {
    expect(
      readEmbeddingWorkerConfig({
        EMBEDDING_WORKER_INTERVAL_MS: "0",
        EMBEDDING_WORKER_SOURCE_ID: "-1",
        EMBEDDING_WORKER_STALE_PROCESSING_MS: "nope",
        NODE_ENV: "production",
      }),
    ).toEqual({
      enabled: true,
      intervalMs: DEFAULT_EMBEDDING_WORKER_INTERVAL_MS,
      sourceId: null,
      staleProcessingMs: DEFAULT_EMBEDDING_WORKER_STALE_PROCESSING_MS,
    })
  })
})

function createService({
  prisma = new FakeEmbeddingPrisma(),
  provider = new FakeEmbeddingProvider(1024),
  store = new FakeEmbeddingSqlStore(),
}: {
  readonly prisma?: FakeEmbeddingPrisma
  readonly provider?: FakeEmbeddingProvider
  readonly store?: FakeEmbeddingSqlStore
} = {}): EmbeddingsService {
  return new EmbeddingsService(
    prisma as unknown as PrismaService,
    store as unknown as EmbeddingSqlStore,
    provider,
  )
}
