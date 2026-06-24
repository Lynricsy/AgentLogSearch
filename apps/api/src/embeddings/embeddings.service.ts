import { Injectable, NotFoundException, type OnModuleInit } from "@nestjs/common"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { PrismaService } from "../database/prisma.service.js"
import { EmbeddingSourceNotFoundError, summarizeEmbeddingError } from "./embedding-errors.js"
import {
  assertEmbeddingDimension,
  assertProviderDimension,
  DatabaseEmbeddingDimensionMismatchError,
  EMBEDDING_DIMENSION,
  type EmbeddingProvider,
} from "./embedding-provider.js"
import { type EmbeddingJobSummary, toEmbeddingJobSummary } from "./embedding-records.js"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { EmbeddingSqlStore } from "./embedding-sql.js"

const PROCESS_BATCH_SIZE = 16

type ProcessJobRequester = "process" | "scheduler" | "manual"
type JobRequester = ProcessJobRequester | "rebuild"

@Injectable()
export class EmbeddingsService implements OnModuleInit {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly store: EmbeddingSqlStore,
    private readonly provider: EmbeddingProvider,
  ) {}

  public async onModuleInit(): Promise<void> {
    assertProviderDimension(this.provider)
    const dbDimension = await this.store.readDbVectorDimension()
    if (dbDimension !== EMBEDDING_DIMENSION) {
      throw new DatabaseEmbeddingDimensionMismatchError(EMBEDDING_DIMENSION, dbDimension)
    }
  }

  public async process(
    sourceId: bigint | null,
    requestedBy: ProcessJobRequester = "process",
  ): Promise<EmbeddingJobSummary> {
    await this.ensureSourceExists(sourceId)
    const job = await this.createJob(requestedBy, sourceId, 0)
    return this.runProcessJob(job.id, sourceId)
  }

  public async rebuild(sourceId: bigint | null): Promise<EmbeddingJobSummary> {
    await this.ensureSourceExists(sourceId)
    const totalChunks = await this.store.countRebuildableChunks(sourceId)
    const job = await this.createJob("rebuild", sourceId, totalChunks)
    await this.store.resetChunksForRebuild(sourceId)
    return this.completeJob(job.id, totalChunks, 0, 0, null)
  }

  private async runProcessJob(
    jobId: bigint,
    sourceId: bigint | null,
  ): Promise<EmbeddingJobSummary> {
    await this.markJobRunning(jobId)
    let processedChunks = 0
    let failedChunks = 0
    let errorMessage: string | null = null

    try {
      const chunks = await this.store.claimBatch(sourceId, PROCESS_BATCH_SIZE)
      const totalChunks = chunks.length
      for (const chunk of chunks) {
        try {
          const vector = await this.provider.embed(chunk.chunkText)
          assertEmbeddingDimension(vector.length)
          await this.store.markReady(chunk.id, vector, this.provider.model)
          processedChunks += 1
        } catch (error) {
          failedChunks += 1
          const message = summarizeEmbeddingError(error)
          errorMessage ??= message
          await this.store.markFailed(chunk.id, message)
        }
      }
      return this.completeJob(jobId, totalChunks, processedChunks, failedChunks, errorMessage)
    } catch (error) {
      return this.failJob(
        jobId,
        processedChunks + failedChunks,
        processedChunks,
        failedChunks,
        summarizeEmbeddingError(error),
      )
    }
  }

  private async createJob(
    requestedBy: JobRequester,
    sourceId: bigint | null,
    totalChunks: number,
  ): Promise<{ readonly id: bigint }> {
    return this.prisma.embeddingJob.create({
      data: {
        sourceId,
        requestedBy,
        status: "queued",
        totalChunks,
        processedChunks: 0,
        failedChunks: 0,
        errorMessage: null,
        startedAt: null,
        finishedAt: null,
      },
      select: { id: true },
    })
  }

  private async markJobRunning(jobId: bigint): Promise<void> {
    await this.prisma.embeddingJob.update({
      where: { id: jobId },
      data: { status: "running", startedAt: new Date(), errorMessage: null },
    })
  }

  private async completeJob(
    jobId: bigint,
    totalChunks: number,
    processedChunks: number,
    failedChunks: number,
    errorMessage: string | null,
  ): Promise<EmbeddingJobSummary> {
    const record = await this.prisma.embeddingJob.update({
      where: { id: jobId },
      data: {
        status: "completed",
        totalChunks,
        processedChunks,
        failedChunks,
        errorMessage,
        finishedAt: new Date(),
      },
    })
    return toEmbeddingJobSummary(record)
  }

  private async failJob(
    jobId: bigint,
    totalChunks: number,
    processedChunks: number,
    failedChunks: number,
    errorMessage: string,
  ): Promise<EmbeddingJobSummary> {
    const record = await this.prisma.embeddingJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        totalChunks,
        processedChunks,
        failedChunks,
        errorMessage,
        finishedAt: new Date(),
      },
    })
    return toEmbeddingJobSummary(record)
  }

  private async ensureSourceExists(sourceId: bigint | null): Promise<void> {
    if (sourceId === null) {
      return
    }
    const source = await this.prisma.agentSource.findUnique({ where: { id: sourceId } })
    if (source === null) {
      throw new NotFoundException({
        error: {
          code: "source_not_found",
          message: new EmbeddingSourceNotFoundError(sourceId).message,
        },
      })
    }
  }
}
