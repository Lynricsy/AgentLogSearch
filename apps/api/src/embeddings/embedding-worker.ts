import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common"
import { Injectable, Logger } from "@nestjs/common"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { EmbeddingSqlStore } from "./embedding-sql.js"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { EmbeddingsService } from "./embeddings.service.js"

export type EmbeddingWorkerConfig = {
  readonly enabled: boolean
  readonly intervalMs: number
  readonly sourceId: bigint | null
  readonly staleProcessingMs: number
}

export const DEFAULT_EMBEDDING_WORKER_INTERVAL_MS = 5_000
export const DEFAULT_EMBEDDING_WORKER_STALE_PROCESSING_MS = 15 * 60_000

@Injectable()
export class EmbeddingWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmbeddingWorker.name)
  private interval: NodeJS.Timeout | null = null
  private tickRunning = false

  public constructor(
    private readonly embeddings: EmbeddingsService,
    private readonly store: EmbeddingSqlStore,
    private readonly config: EmbeddingWorkerConfig = readEmbeddingWorkerConfig(),
  ) {}

  public onModuleInit(): void {
    if (!this.config.enabled) {
      return
    }
    this.interval = setInterval(() => {
      void this.tick()
    }, this.config.intervalMs)
    void this.tick()
  }

  public onModuleDestroy(): void {
    if (this.interval !== null) {
      clearInterval(this.interval)
      this.interval = null
    }
  }

  public async tick(): Promise<void> {
    if (this.tickRunning) {
      return
    }
    this.tickRunning = true
    try {
      const resetCount = await this.store.resetStaleProcessingChunks(
        this.config.sourceId,
        this.config.staleProcessingMs,
      )
      if (resetCount > 0) {
        this.logger.warn(`Reset ${resetCount.toString()} stale processing embedding chunks`)
      }

      const pendingCount = await this.store.countProcessableChunks(this.config.sourceId)
      if (pendingCount === 0) {
        return
      }

      const summary = await this.embeddings.process(this.config.sourceId, "scheduler")
      if (summary.totalChunks > 0) {
        this.logger.log(
          `Processed ${summary.processedChunks.toString()}/${summary.totalChunks.toString()} embedding chunks; ${pendingCount.toString()} were processable before the batch`,
        )
      }
    } catch (error) {
      this.logger.error(
        "Scheduled embedding process failed",
        error instanceof Error ? error.stack : undefined,
      )
    } finally {
      this.tickRunning = false
    }
  }
}

export function readEmbeddingWorkerConfig(
  env: NodeJS.ProcessEnv = process.env,
): EmbeddingWorkerConfig {
  const {
    EMBEDDING_WORKER_ENABLED,
    EMBEDDING_WORKER_INTERVAL_MS,
    EMBEDDING_WORKER_SOURCE_ID,
    EMBEDDING_WORKER_STALE_PROCESSING_MS,
    NODE_ENV,
  } = env
  return {
    enabled: readBoolean(EMBEDDING_WORKER_ENABLED, NODE_ENV !== "test"),
    intervalMs: readPositiveInteger(
      EMBEDDING_WORKER_INTERVAL_MS,
      DEFAULT_EMBEDDING_WORKER_INTERVAL_MS,
    ),
    sourceId: readOptionalBigInt(EMBEDDING_WORKER_SOURCE_ID),
    staleProcessingMs: readPositiveInteger(
      EMBEDDING_WORKER_STALE_PROCESSING_MS,
      DEFAULT_EMBEDDING_WORKER_STALE_PROCESSING_MS,
    ),
  }
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") {
    return fallback
  }
  return value === "true" || value === "1" || value === "yes" || value === "on"
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback
  }
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback
  }
  return parsed
}

function readOptionalBigInt(value: string | undefined): bigint | null {
  if (value === undefined || value.trim() === "") {
    return null
  }
  try {
    const parsed = BigInt(value)
    return parsed > 0n ? parsed : null
  } catch {
    return null
  }
}
