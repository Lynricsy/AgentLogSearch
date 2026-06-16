import { z } from "zod"
import { embeddingStatusSchema, scanJobStatusSchema } from "./constants.js"

export const agentRoleSchema = z.enum(["system", "user", "assistant", "tool", "unknown"])

export const historyFileSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  filePath: z.string().min(1),
  fileHash: z.string().nullable(),
  fileSize: z.number().int().min(0),
  modifiedAt: z.string().datetime().nullable(),
  lastScannedAt: z.string().datetime().nullable(),
  parseStatus: scanJobStatusSchema.or(z.literal("pending")),
  errorMessage: z.string().nullable(),
})

export const agentSessionSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  historyFileId: z.string().min(1).nullable(),
  agentName: z.string().min(1),
  externalThreadId: z.string().min(1),
  cwd: z.string().nullable(),
  title: z.string().nullable(),
  startedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime().nullable(),
})

export const agentMessageSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  role: agentRoleSchema,
  content: z.string(),
  model: z.string().nullable(),
  sequence: z.number().int().min(0),
  createdAt: z.string().datetime().nullable(),
})

export const agentChunkSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  sourceId: z.string().min(1),
  text: z.string().min(1),
  messageStartSequence: z.number().int().min(0),
  messageEndSequence: z.number().int().min(0),
  embeddingStatus: embeddingStatusSchema,
  tokenEstimate: z.number().int().min(0),
})

export const scanJobSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1).nullable(),
  status: scanJobStatusSchema,
  filesDiscovered: z.number().int().min(0),
  filesParsed: z.number().int().min(0),
  filesFailed: z.number().int().min(0),
  errorMessage: z.string().nullable(),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
})

export type AgentRole = z.infer<typeof agentRoleSchema>
export type HistoryFile = z.infer<typeof historyFileSchema>
export type AgentSession = z.infer<typeof agentSessionSchema>
export type AgentMessage = z.infer<typeof agentMessageSchema>
export type AgentChunk = z.infer<typeof agentChunkSchema>
export type ScanJob = z.infer<typeof scanJobSchema>
