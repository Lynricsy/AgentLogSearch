import { Test } from "@nestjs/testing"
import { PrismaService } from "../database/prisma.service.js"
import {
  DatabaseEmbeddingDimensionMismatchError,
  EmbeddingDimensionMismatchError,
  MockEmbeddingProvider,
} from "./embedding-provider.js"
import { EmbeddingSqlStore } from "./embedding-sql.js"
import {
  FakeEmbeddingPrisma,
  FakeEmbeddingProvider,
  FakeEmbeddingSqlStore,
} from "./embedding-test-fakes.js"
import { EmbeddingsService } from "./embeddings.service.js"

describe("EmbeddingsService", () => {
  it("rejects provider and database dimension mismatches during startup", async () => {
    // Given
    const badProviderService = await createService({
      provider: new FakeEmbeddingProvider(128),
      store: new FakeEmbeddingSqlStore(),
    })
    const badDatabaseService = await createService({
      provider: new FakeEmbeddingProvider(1024),
      store: new FakeEmbeddingSqlStore(512),
    })

    // When / Then
    await expect(badProviderService.onModuleInit()).rejects.toBeInstanceOf(
      EmbeddingDimensionMismatchError,
    )
    await expect(badDatabaseService.onModuleInit()).rejects.toBeInstanceOf(
      DatabaseEmbeddingDimensionMismatchError,
    )
  })

  it("transitions a process job from queued to completed and marks chunks ready", async () => {
    // Given
    const prisma = new FakeEmbeddingPrisma()
    const store = new FakeEmbeddingSqlStore()
    prisma.addSource(1n)
    store.addChunk({ id: 10n, sourceId: 1n, status: "pending", text: "hello" })
    const service = await createService({ prisma, store })

    // When
    const result = await service.process(1n)

    // Then
    expect(result).toEqual(
      expect.objectContaining({
        requestedBy: "process",
        status: "completed",
        totalChunks: 1,
        processedChunks: 1,
        failedChunks: 0,
      }),
    )
    expect(store.chunkStatus(10n)).toBe("ready")
    expect(store.chunkModel(10n)).toBe("fake-1024")
    expect(prisma.latestJob().startedAt).toBeInstanceOf(Date)
    expect(prisma.latestJob().finishedAt).toBeInstanceOf(Date)
  })

  it("retries failed chunks on process and records provider failures per chunk", async () => {
    // Given
    const store = new FakeEmbeddingSqlStore()
    store.addChunk({ id: 20n, sourceId: 1n, status: "failed", text: "retry succeeds" })
    store.addChunk({ id: 21n, sourceId: 1n, status: "pending", text: "please fail" })
    const service = await createService({
      store,
      provider: new FakeEmbeddingProvider(1024, "fail"),
    })

    // When
    const result = await service.process(null)

    // Then
    expect(result.processedChunks).toBe(1)
    expect(result.failedChunks).toBe(1)
    expect(result.errorMessage).toContain("provider failed")
    expect(store.chunkStatus(20n)).toBe("ready")
    expect(store.chunkStatus(21n)).toBe("failed")
    expect(store.chunkError(21n)).toContain("provider failed")
  })

  it("resets only target source chunks during rebuild", async () => {
    // Given
    const store = new FakeEmbeddingSqlStore()
    const prisma = new FakeEmbeddingPrisma()
    prisma.addSource(1n)
    store.addChunk({ id: 30n, sourceId: 1n, status: "ready", text: "target" })
    store.addChunk({ id: 31n, sourceId: 1n, status: "failed", text: "target failed" })
    store.addChunk({ id: 40n, sourceId: 2n, status: "ready", text: "other" })
    const service = await createService({ prisma, store })

    // When
    const result = await service.rebuild(1n)

    // Then
    expect(result).toEqual(
      expect.objectContaining({
        requestedBy: "rebuild",
        status: "completed",
        totalChunks: 2,
        processedChunks: 0,
      }),
    )
    expect(store.chunkStatus(30n)).toBe("pending")
    expect(store.chunkStatus(31n)).toBe("pending")
    expect(store.chunkStatus(40n)).toBe("ready")
  })
})

async function createService({
  prisma = new FakeEmbeddingPrisma(),
  provider = new FakeEmbeddingProvider(1024),
  store = new FakeEmbeddingSqlStore(),
}: {
  readonly prisma?: FakeEmbeddingPrisma
  readonly provider?: FakeEmbeddingProvider
  readonly store?: FakeEmbeddingSqlStore
} = {}): Promise<EmbeddingsService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      EmbeddingsService,
      { provide: PrismaService, useValue: prisma },
      { provide: EmbeddingSqlStore, useValue: store },
      { provide: MockEmbeddingProvider, useValue: provider },
    ],
  }).compile()
  return moduleRef.get(EmbeddingsService)
}
