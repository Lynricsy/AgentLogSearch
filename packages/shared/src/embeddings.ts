import { z } from "zod"
import { embeddingJobRequesterSchema, embeddingJobStatusSchema } from "./constants.js"

const bigintIdSchema = z.string().trim().regex(/^\d+$/, "id must be an unsigned integer string")

export const embeddingJobRequestSchema = z
  .object({
    sourceId: bigintIdSchema.optional(),
  })
  .default({})

export const embeddingJobSummarySchema = z.object({
  id: bigintIdSchema,
  sourceId: bigintIdSchema.nullable(),
  status: embeddingJobStatusSchema,
  requestedBy: embeddingJobRequesterSchema,
  totalChunks: z.number().int().min(0),
  processedChunks: z.number().int().min(0),
  failedChunks: z.number().int().min(0),
  errorMessage: z.string().nullable(),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
})

export type EmbeddingJobRequest = z.infer<typeof embeddingJobRequestSchema>
export type EmbeddingJobSummary = z.infer<typeof embeddingJobSummarySchema>
