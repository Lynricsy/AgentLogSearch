import { z } from "zod"
import {
  type ParserType,
  parserTypeSchema,
  type SourcePreset,
  type SourceReaderType,
  sourcePresetSchema,
  sourceReaderTypeSchema,
} from "./constants.js"

export const SOURCE_SCAN_DEFAULTS = {
  scanIntervalSeconds: 300,
  maxFileSizeBytes: 5_242_880,
  maxFilesPerScan: 1_000,
  followSymlinks: false,
} as const

const rootPathSchema = z
  .string()
  .min(1)
  .refine(
    (value) => value === "~" || value.startsWith("/") || value.startsWith("~/"),
    "rootPath must be absolute or home-relative",
  )

export const SOURCE_PRESET_DEFAULTS = {
  codex: {
    sourcePreset: "codex",
    parserType: "codex-jsonl",
    readerType: "file-glob",
    rootPath: "~/.codex/sessions",
    fileGlob: "**/*.jsonl",
    resumeTemplate: "cd {quoted cwd} && codex resume {quoted threadId}",
  },
  "claude-code": {
    sourcePreset: "claude-code",
    parserType: "claude-jsonl",
    readerType: "file-glob",
    rootPath: "~/.claude/projects",
    fileGlob: "**/*.jsonl",
    resumeTemplate: "cd {quoted cwd} && claude --resume {quoted threadId}",
  },
  "pi-agent": {
    sourcePreset: "pi-agent",
    parserType: "pi-jsonl",
    readerType: "file-glob",
    rootPath: "~/.pi/agent/sessions",
    fileGlob: "**/*.jsonl",
    resumeTemplate: "cd {quoted cwd} && pi --session {quoted threadId}",
  },
  opencode: {
    sourcePreset: "opencode",
    parserType: "opencode-sqlite",
    readerType: "sqlite",
    rootPath: "~/.local/share/opencode",
    fileGlob: "opencode.db",
    resumeTemplate: "cd {quoted cwd} && opencode --session {quoted threadId}",
  },
  generic: {
    sourcePreset: "generic",
    parserType: "generic-jsonl",
    readerType: "file-glob",
    rootPath: "~/agent-log-search/history",
    fileGlob: "**/*.{jsonl,json,md}",
    resumeTemplate: "cd {quoted cwd}",
  },
} as const satisfies Record<
  SourcePreset,
  {
    readonly sourcePreset: SourcePreset
    readonly parserType: ParserType
    readonly readerType: SourceReaderType
    readonly rootPath: string
    readonly fileGlob: string
    readonly resumeTemplate: string
  }
>

const sourceRequestFieldSchemas = {
  name: z.string().min(1).max(100),
  sourcePreset: sourcePresetSchema,
  parserType: parserTypeSchema,
  readerType: sourceReaderTypeSchema,
  rootPath: rootPathSchema,
  fileGlob: z.string().min(1).max(200),
  resumeTemplate: z.string().min(1),
  enabled: z.boolean(),
  scanIntervalSeconds: z.number().int().min(60).max(86_400),
  maxFileSizeBytes: z.number().int().min(1).max(104_857_600),
  maxFilesPerScan: z.number().int().min(1).max(100_000),
  followSymlinks: z.boolean(),
} as const

export const createSourceRequestSchema = z.object({
  ...sourceRequestFieldSchemas,
  fileGlob: sourceRequestFieldSchemas.fileGlob.default("**/*"),
  enabled: sourceRequestFieldSchemas.enabled.default(true),
  scanIntervalSeconds: sourceRequestFieldSchemas.scanIntervalSeconds.default(
    SOURCE_SCAN_DEFAULTS.scanIntervalSeconds,
  ),
  maxFileSizeBytes: sourceRequestFieldSchemas.maxFileSizeBytes.default(
    SOURCE_SCAN_DEFAULTS.maxFileSizeBytes,
  ),
  maxFilesPerScan: sourceRequestFieldSchemas.maxFilesPerScan.default(
    SOURCE_SCAN_DEFAULTS.maxFilesPerScan,
  ),
  followSymlinks: sourceRequestFieldSchemas.followSymlinks.default(
    SOURCE_SCAN_DEFAULTS.followSymlinks,
  ),
})

export const updateSourceRequestSchema = z
  .object(sourceRequestFieldSchemas)
  .partial()
  .refine((value) => Object.keys(value).length > 0, "at least one source field must be provided")

export const agentSourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  sourcePreset: sourcePresetSchema,
  parserType: parserTypeSchema,
  readerType: sourceReaderTypeSchema,
  rootPath: rootPathSchema,
  fileGlob: z.string().min(1).max(200),
  resumeTemplate: z.string().min(1),
  enabled: z.boolean(),
  scanIntervalSeconds: z.number().int().min(60).max(86_400),
  lastScanAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const SOURCE_PRESET_METADATA_IDS = [
  "codex",
  "claude-code",
  "pi-agent",
  "opencode",
  "generic-jsonl",
  "generic-json",
  "generic-markdown",
] as const

export const sourcePresetMetadataIdSchema = z.enum(SOURCE_PRESET_METADATA_IDS)

export const sourcePresetMetadataSchema = z.object({
  id: sourcePresetMetadataIdSchema,
  label: z.string().min(1),
  sourcePreset: sourcePresetSchema,
  parserType: parserTypeSchema,
  readerType: sourceReaderTypeSchema,
  rootPath: rootPathSchema,
  fileGlob: z.string().min(1).max(200),
  resumeTemplate: z.string().min(1),
})

export const SOURCE_PRESET_METADATA = [
  {
    id: "codex",
    label: "Codex CLI",
    ...SOURCE_PRESET_DEFAULTS.codex,
  },
  {
    id: "claude-code",
    label: "Claude Code",
    ...SOURCE_PRESET_DEFAULTS["claude-code"],
  },
  {
    id: "pi-agent",
    label: "Pi Agent",
    ...SOURCE_PRESET_DEFAULTS["pi-agent"],
  },
  {
    id: "opencode",
    label: "OpenCode",
    ...SOURCE_PRESET_DEFAULTS.opencode,
  },
  {
    id: "generic-jsonl",
    label: "Generic JSONL",
    ...SOURCE_PRESET_DEFAULTS.generic,
    fileGlob: "**/*.jsonl",
    parserType: "generic-jsonl",
  },
  {
    id: "generic-json",
    label: "Generic JSON",
    ...SOURCE_PRESET_DEFAULTS.generic,
    fileGlob: "**/*.json",
    parserType: "generic-json",
  },
  {
    id: "generic-markdown",
    label: "Generic Markdown",
    ...SOURCE_PRESET_DEFAULTS.generic,
    fileGlob: "**/*.md",
    parserType: "generic-markdown",
  },
] as const satisfies readonly SourcePresetMetadata[]

export type SourcePresetDefaults = typeof SOURCE_PRESET_DEFAULTS
export type CreateSourceRequest = z.infer<typeof createSourceRequestSchema>
export type UpdateSourceRequest = z.infer<typeof updateSourceRequestSchema>
export type AgentSource = z.infer<typeof agentSourceSchema>
export type SourcePresetMetadata = z.infer<typeof sourcePresetMetadataSchema>
export type SourcePresetMetadataId = z.infer<typeof sourcePresetMetadataIdSchema>
