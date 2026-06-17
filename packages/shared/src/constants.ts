import { z } from "zod"

export const SOURCE_PRESETS = ["codex", "claude-code", "pi-agent", "opencode", "generic"] as const

export const PARSER_TYPES = [
  "codex-jsonl",
  "claude-jsonl",
  "pi-jsonl",
  "opencode-sqlite",
  "generic-jsonl",
  "generic-json",
  "generic-markdown",
] as const

export const SOURCE_READER_TYPES = ["file-glob", "sqlite"] as const

export const EMBEDDING_STATUSES = ["pending", "processing", "ready", "failed"] as const

export const PARSE_STATUSES = ["PENDING", "PROCESSING", "READY", "FAILED"] as const

export const SCAN_JOB_STATUSES = ["queued", "running", "completed", "failed"] as const

export const EMBEDDING_JOB_STATUSES = ["queued", "running", "completed", "failed"] as const

export const EMBEDDING_JOB_REQUESTERS = ["process", "rebuild", "scheduler", "manual"] as const

export const sourcePresetSchema = z.enum(SOURCE_PRESETS)
export const parserTypeSchema = z.enum(PARSER_TYPES)
export const sourceReaderTypeSchema = z.enum(SOURCE_READER_TYPES)
export const embeddingStatusSchema = z.enum(EMBEDDING_STATUSES)
export const parseStatusSchema = z.enum(PARSE_STATUSES)
export const scanJobStatusSchema = z.enum(SCAN_JOB_STATUSES)
export const embeddingJobStatusSchema = z.enum(EMBEDDING_JOB_STATUSES)
export const embeddingJobRequesterSchema = z.enum(EMBEDDING_JOB_REQUESTERS)

export type SourcePreset = z.infer<typeof sourcePresetSchema>
export type ParserType = z.infer<typeof parserTypeSchema>
export type SourceReaderType = z.infer<typeof sourceReaderTypeSchema>
export type EmbeddingStatus = z.infer<typeof embeddingStatusSchema>
export type ParseStatus = z.infer<typeof parseStatusSchema>
export type ScanJobStatus = z.infer<typeof scanJobStatusSchema>
export type EmbeddingJobStatus = z.infer<typeof embeddingJobStatusSchema>
export type EmbeddingJobRequester = z.infer<typeof embeddingJobRequesterSchema>
