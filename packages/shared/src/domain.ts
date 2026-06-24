import { z } from "zod"
import { embeddingStatusSchema, parseStatusSchema, scanJobStatusSchema } from "./constants.js"

export const agentRoleSchema = z.enum(["system", "user", "assistant", "tool", "unknown"])

export const agentMessagePartKindSchema = z.enum([
  "assistant_response",
  "metadata",
  "text",
  "thinking",
  "tool_call",
  "unknown",
])

export const agentMessagePartSchema = z.object({
  kind: agentMessagePartKindSchema,
  label: z.string().min(1),
  text: z.string(),
})

export const historyFileSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  filePath: z.string().min(1),
  fileHash: z.string().nullable(),
  fileSize: z.number().int().min(0),
  modifiedAt: z.string().datetime().nullable(),
  lastScannedAt: z.string().datetime().nullable(),
  parseStatus: parseStatusSchema,
  errorMessage: z.string().nullable(),
})

export const scanJobSourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  sourcePreset: z.string().min(1),
  parserType: z.string().min(1),
})

export const agentSessionSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  historyFileId: z.string().min(1).nullable(),
  agentName: z.string().min(1),
  externalThreadId: z.string().min(1),
  cwd: z.string().nullable(),
  title: z.string().nullable(),
  resumeCommand: z.string().nullable(),
  messageCount: z.number().int().min(0),
  lastMessageAt: z.string().datetime().nullable(),
  startedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime().nullable(),
})

export const agentMessageSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  role: agentRoleSchema,
  content: z.string(),
  model: z.string().nullable(),
  seqNo: z.number().int().min(0),
  createdAt: z.string().datetime().nullable(),
  parts: z.readonly(z.array(agentMessagePartSchema)).optional(),
})

export const agentSessionDetailSchema = agentSessionSchema.extend({
  messages: z.array(agentMessageSchema),
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
  source: scanJobSourceSchema.nullable(),
  status: scanJobStatusSchema,
  filesDiscovered: z.number().int().min(0),
  filesParsed: z.number().int().min(0),
  filesFailed: z.number().int().min(0),
  sessionsImported: z.number().int().min(0),
  messagesImported: z.number().int().min(0),
  chunksCreated: z.number().int().min(0),
  errorMessage: z.string().nullable(),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
})

export const scanJobsResponseSchema = z.object({
  records: z.array(scanJobSchema),
  pagination: z.object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    totalItems: z.number().int().min(0),
    totalPages: z.number().int().min(0),
  }),
})

export const scanRunRecordSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1).nullable(),
  status: scanJobStatusSchema,
  filesDiscovered: z.number().int().min(0),
  filesParsed: z.number().int().min(0),
  filesFailed: z.number().int().min(0),
  sessionsImported: z.number().int().min(0),
  messagesImported: z.number().int().min(0),
  chunksCreated: z.number().int().min(0),
  errorMessage: z.string().nullable(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
})

export const scanRunResponseSchema = z.object({
  records: z.array(scanRunRecordSchema),
})

export type AgentRole = z.infer<typeof agentRoleSchema>
export type AgentMessagePartKind = z.infer<typeof agentMessagePartKindSchema>
export type AgentMessagePart = z.infer<typeof agentMessagePartSchema>
export type HistoryFile = z.infer<typeof historyFileSchema>
export type AgentSession = z.infer<typeof agentSessionSchema>
export type AgentMessage = z.infer<typeof agentMessageSchema>
export type AgentSessionDetail = z.infer<typeof agentSessionDetailSchema>
export type AgentChunk = z.infer<typeof agentChunkSchema>
export type ScanJobSource = z.infer<typeof scanJobSourceSchema>
export type ScanJob = z.infer<typeof scanJobSchema>
export type ScanJobsResponse = z.infer<typeof scanJobsResponseSchema>
export type ScanRunRecord = z.infer<typeof scanRunRecordSchema>
export type ScanRunResponse = z.infer<typeof scanRunResponseSchema>
