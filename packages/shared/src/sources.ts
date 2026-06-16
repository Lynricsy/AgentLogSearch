import { z } from "zod"
import {
  parserTypeSchema,
  type SourcePreset,
  sourcePresetSchema,
  sourceReaderTypeSchema,
} from "./constants"

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
    (value) => value.startsWith("/") || value.startsWith("~/"),
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
    readonly parserType: string
    readonly readerType: string
    readonly rootPath: string
    readonly fileGlob: string
    readonly resumeTemplate: string
  }
>

export const createSourceRequestSchema = z.object({
  name: z.string().min(1).max(100),
  sourcePreset: sourcePresetSchema,
  parserType: parserTypeSchema,
  readerType: sourceReaderTypeSchema,
  rootPath: rootPathSchema,
  fileGlob: z.string().min(1).max(200).default("**/*"),
  resumeTemplate: z.string().min(1),
  enabled: z.boolean().default(true),
  scanIntervalSeconds: z
    .number()
    .int()
    .min(60)
    .max(86_400)
    .default(SOURCE_SCAN_DEFAULTS.scanIntervalSeconds),
  maxFileSizeBytes: z
    .number()
    .int()
    .min(1)
    .max(104_857_600)
    .default(SOURCE_SCAN_DEFAULTS.maxFileSizeBytes),
  maxFilesPerScan: z
    .number()
    .int()
    .min(1)
    .max(100_000)
    .default(SOURCE_SCAN_DEFAULTS.maxFilesPerScan),
  followSymlinks: z.boolean().default(SOURCE_SCAN_DEFAULTS.followSymlinks),
})

export const agentSourceSchema = createSourceRequestSchema.extend({
  id: z.string().min(1),
  lastScanAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type SourcePresetDefaults = typeof SOURCE_PRESET_DEFAULTS
export type CreateSourceRequest = z.infer<typeof createSourceRequestSchema>
export type AgentSource = z.infer<typeof agentSourceSchema>
