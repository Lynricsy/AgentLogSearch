import {
  mapRecordValue,
  readBigIntLike,
  readDate,
  readNullableBigIntLike,
  readNullableDate,
  readNullableString,
  readNumber,
  readString,
} from "../scan-jobs/record-readers.js"

type EmbeddingJobRecord = Readonly<Record<string, unknown>>
type EmbeddingJobStatus = "queued" | "running" | "completed" | "failed"
type EmbeddingJobRequester = "process" | "rebuild" | "scheduler" | "manual"

export type EmbeddingJobSummary = {
  readonly id: string
  readonly sourceId: string | null
  readonly status: EmbeddingJobStatus
  readonly requestedBy: EmbeddingJobRequester
  readonly totalChunks: number
  readonly processedChunks: number
  readonly failedChunks: number
  readonly errorMessage: string | null
  readonly createdAt: string
  readonly startedAt: string | null
  readonly finishedAt: string | null
}

const PRISMA_EMBEDDING_JOB_STATUS_TO_API = {
  queued: "queued",
  running: "running",
  completed: "completed",
  failed: "failed",
} as const satisfies Record<string, EmbeddingJobStatus>

const PRISMA_EMBEDDING_JOB_REQUESTER_TO_API = {
  process: "process",
  rebuild: "rebuild",
  scheduler: "scheduler",
  manual: "manual",
} as const satisfies Record<string, EmbeddingJobRequester>

export function toEmbeddingJobSummary(record: EmbeddingJobRecord): EmbeddingJobSummary {
  return {
    id: readBigIntLike(record, "id"),
    sourceId: readNullableBigIntLike(record, "sourceId"),
    status: mapRecordValue(
      PRISMA_EMBEDDING_JOB_STATUS_TO_API,
      readString(record, "status"),
      "status",
    ),
    requestedBy: mapRecordValue(
      PRISMA_EMBEDDING_JOB_REQUESTER_TO_API,
      readString(record, "requestedBy"),
      "requestedBy",
    ),
    totalChunks: readNumber(record, "totalChunks"),
    processedChunks: readNumber(record, "processedChunks"),
    failedChunks: readNumber(record, "failedChunks"),
    errorMessage: readNullableString(record, "errorMessage"),
    createdAt: readDate(record, "createdAt"),
    startedAt: readNullableDate(record, "startedAt"),
    finishedAt: readNullableDate(record, "finishedAt"),
  }
}
