import type { EmbeddingProvider, EmbeddingVector } from "./embedding-provider.js"
import type { ChunkForEmbedding } from "./embedding-sql.js"

type FakeEmbeddingJob = {
  readonly id: bigint
  readonly sourceId: bigint | null
  readonly requestedBy: "process" | "rebuild" | "scheduler" | "manual"
  status: "queued" | "running" | "completed" | "failed"
  totalChunks: number
  processedChunks: number
  failedChunks: number
  errorMessage: string | null
  readonly createdAt: Date
  startedAt: Date | null
  finishedAt: Date | null
}

type FakeChunk = ChunkForEmbedding & {
  readonly sourceId: bigint
  status: "pending" | "processing" | "ready" | "failed"
  staleProcessing: boolean
  embedding: EmbeddingVector | null
  model: string | null
  error: string | null
}

export class FakeEmbeddingProvider implements EmbeddingProvider {
  public readonly model = "fake-1024"
  public calls = 0

  public constructor(
    public readonly dimension: number,
    private readonly failOnText: string | null = null,
  ) {}

  public async embed(text: string): Promise<EmbeddingVector> {
    this.calls += 1
    if (this.failOnText !== null && text.includes(this.failOnText)) {
      throw new FakeEmbeddingProviderError(text)
    }
    return Array.from({ length: this.dimension }, (_, index) => (index + 1) / this.dimension)
  }
}

export class FakeEmbeddingProviderError extends Error {
  public readonly name = "FakeEmbeddingProviderError"

  public constructor(public readonly text: string) {
    super(`provider failed for ${text}`)
  }
}

export class FakeEmbeddingSqlStore {
  private chunks: FakeChunk[] = []

  public constructor(private readonly dbDimension = 1024) {}

  public addChunk(input: {
    readonly id: bigint
    readonly sourceId: bigint
    readonly text: string
    readonly status: "pending" | "ready" | "failed"
  }): void {
    this.chunks = [
      ...this.chunks,
      {
        id: input.id,
        sourceId: input.sourceId,
        chunkText: input.text,
        status: input.status,
        staleProcessing: false,
        embedding: input.status === "ready" ? [1] : null,
        model: input.status === "ready" ? "old" : null,
        error: input.status === "failed" ? "old error" : null,
      },
    ]
  }

  public async readDbVectorDimension(): Promise<number> {
    return this.dbDimension
  }

  public async countProcessableChunks(sourceId: bigint | null): Promise<number> {
    return this.filterChunks(sourceId).filter(
      (chunk) => chunk.status === "pending" || chunk.status === "failed",
    ).length
  }

  public async countRebuildableChunks(sourceId: bigint | null): Promise<number> {
    return this.filterChunks(sourceId).filter(
      (chunk) => chunk.status === "ready" || chunk.status === "failed",
    ).length
  }

  public async resetChunksForRebuild(sourceId: bigint | null): Promise<number> {
    const chunks = this.filterChunks(sourceId).filter(
      (chunk) => chunk.status === "ready" || chunk.status === "failed",
    )
    for (const chunk of chunks) {
      chunk.status = "pending"
      chunk.embedding = null
      chunk.model = null
      chunk.error = null
    }
    return chunks.length
  }

  public async resetStaleProcessingChunks(
    sourceId: bigint | null,
    _olderThanMs: number,
  ): Promise<number> {
    const chunks = this.filterChunks(sourceId).filter(
      (chunk) => chunk.status === "processing" && chunk.staleProcessing,
    )
    for (const chunk of chunks) {
      chunk.status = "pending"
      chunk.staleProcessing = false
      chunk.error = "reset stale processing chunk"
    }
    return chunks.length
  }

  public async claimBatch(
    sourceId: bigint | null,
    batchSize: number,
  ): Promise<readonly ChunkForEmbedding[]> {
    const chunks = this.filterChunks(sourceId)
      .filter((chunk) => chunk.status === "pending" || chunk.status === "failed")
      .slice(0, batchSize)
    for (const chunk of chunks) {
      chunk.status = "processing"
      chunk.staleProcessing = false
      chunk.error = null
    }
    return chunks.map((chunk) => ({ id: chunk.id, chunkText: chunk.chunkText }))
  }

  public async markReady(chunkId: bigint, vector: EmbeddingVector, model: string): Promise<void> {
    const chunk = this.findChunk(chunkId)
    chunk.status = "ready"
    chunk.embedding = vector
    chunk.model = model
    chunk.error = null
  }

  public async markFailed(chunkId: bigint, error: string): Promise<void> {
    const chunk = this.findChunk(chunkId)
    chunk.status = "failed"
    chunk.error = error
  }

  public chunkStatus(id: bigint): "pending" | "processing" | "ready" | "failed" {
    return this.findChunk(id).status
  }

  public chunkModel(id: bigint): string | null {
    return this.findChunk(id).model
  }

  public chunkError(id: bigint): string | null {
    return this.findChunk(id).error
  }

  public markChunkStaleProcessing(id: bigint): void {
    const chunk = this.findChunk(id)
    chunk.status = "processing"
    chunk.staleProcessing = true
  }

  private filterChunks(sourceId: bigint | null): readonly FakeChunk[] {
    return sourceId === null
      ? this.chunks
      : this.chunks.filter((chunk) => chunk.sourceId === sourceId)
  }

  private findChunk(id: bigint): FakeChunk {
    const chunk = this.chunks.find((value) => value.id === id)
    if (chunk === undefined) {
      throw new MissingFakeChunkError(id)
    }
    return chunk
  }
}

export class MissingFakeChunkError extends Error {
  public readonly name = "MissingFakeChunkError"

  public constructor(public readonly id: bigint) {
    super(`Missing fake chunk ${id.toString()}`)
  }
}

export class FakeEmbeddingPrisma {
  public readonly agentSource = {
    findUnique: async ({ where }: { readonly where: { readonly id: bigint } }) =>
      this.sourceIds.has(where.id) ? { id: where.id } : null,
  }

  public readonly embeddingJob = {
    create: async ({ data }: { readonly data: Omit<FakeEmbeddingJob, "id" | "createdAt"> }) => {
      const job: FakeEmbeddingJob = {
        id: this.nextId(),
        createdAt: new Date("2026-06-17T00:00:00.000Z"),
        ...data,
      }
      this.jobs = [...this.jobs, job]
      return { id: job.id }
    },
    update: async ({
      data,
      where,
    }: {
      readonly data: Partial<FakeEmbeddingJob>
      readonly where: { readonly id: bigint }
    }) => {
      const job = this.findJob(where.id)
      Object.assign(job, data)
      return job
    },
  }

  private id = 1n
  private jobs: FakeEmbeddingJob[] = []
  private sourceIds = new Set<bigint>()

  public addSource(id: bigint): void {
    this.sourceIds.add(id)
  }

  public latestJob(): FakeEmbeddingJob {
    const job = this.jobs.at(-1)
    if (job === undefined) {
      throw new MissingFakeJobError()
    }
    return job
  }

  private nextId(): bigint {
    const value = this.id
    this.id += 1n
    return value
  }

  private findJob(id: bigint): FakeEmbeddingJob {
    const job = this.jobs.find((value) => value.id === id)
    if (job === undefined) {
      throw new MissingFakeJobError()
    }
    return job
  }
}

export class MissingFakeJobError extends Error {
  public readonly name = "MissingFakeJobError"

  public constructor() {
    super("Missing fake embedding job")
  }
}
