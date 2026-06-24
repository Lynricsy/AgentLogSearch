import { z } from "zod"
import { agentRoleSchema } from "./domain.js"

const bigintIdSchema = z.string().trim().regex(/^\d+$/, "id must be an unsigned integer string")

export const TRACE_EVENT_KINDS = [
  "USER_MESSAGE",
  "ASSISTANT_MESSAGE",
  "TOOL_EXECUTION",
  "SYSTEM",
] as const

export const OPERATION_KINDS = [
  "NONE",
  "SHELL",
  "FILE_READ",
  "FILE_WRITE",
  "FILE_PATCH",
  "FILE_DELETE",
  "SEARCH",
  "TEST",
  "BUILD",
  "TYPECHECK",
  "LINT",
  "GIT",
  "PACKAGE_CHANGE",
  "OTHER",
] as const

export const EVIDENCE_QUALITIES = ["EXACT", "PARSED", "INFERRED", "UNKNOWN"] as const

export const traceEventKindSchema = z.enum(TRACE_EVENT_KINDS)
export const operationKindSchema = z.enum(OPERATION_KINDS)
export const evidenceQualitySchema = z.enum(EVIDENCE_QUALITIES)

export const evidenceRawPointerSchema = z
  .object({
    filePath: z.string().min(1).max(1_000).optional(),
    line: z.number().int().min(1).optional(),
    messageIndex: z.number().int().min(0).optional(),
    jsonPointer: z.string().max(500).optional(),
  })
  .strict()

export const evidenceEventSummarySchema = z.object({
  id: bigintIdSchema,
  sessionId: bigintIdSchema,
  sourceEventKey: z.string().min(1).max(200),
  seqNo: z.number().int().min(0),
  subSeqNo: z.number().int().min(0),
  eventKind: traceEventKindSchema,
  operationKind: operationKindSchema,
  role: agentRoleSchema.nullable().optional(),
  occurredAt: z.string().datetime().nullable(),
  callId: z.string().max(200).nullable(),
  toolName: z.string().max(100).nullable(),
  pairingQuality: evidenceQualitySchema,
  redactedExcerpt: z.string().nullable(),
  pathTokens: z.array(z.string().min(1)).max(100),
  errorSignatures: z.array(z.string().min(1)).max(20),
  errorCodes: z.array(z.string().min(1)).max(20),
  commandFamilies: z.array(z.string().min(1)).max(20),
  rawPointer: evidenceRawPointerSchema.nullable().optional(),
  rawContentSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .nullable(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/i),
  extractorVersion: z.string().min(1).max(80),
})

export type TraceEventKind = z.infer<typeof traceEventKindSchema>
export type OperationKind = z.infer<typeof operationKindSchema>
export type EvidenceQuality = z.infer<typeof evidenceQualitySchema>
export type EvidenceRawPointer = z.infer<typeof evidenceRawPointerSchema>
export type EvidenceEventSummary = z.infer<typeof evidenceEventSummarySchema>
