import type { ParserType, SourcePreset, SourceReaderType } from "@agent-log-search/shared"
import type {
  ParserType as PrismaParserType,
  SourcePreset as PrismaSourcePreset,
  SourceReaderType as PrismaSourceReaderType,
} from "@prisma/client"

export const SOURCE_PRESET_TO_PRISMA = {
  codex: "codex",
  "claude-code": "claude_code",
  "pi-agent": "pi_agent",
  opencode: "opencode",
  generic: "generic",
} as const satisfies Record<SourcePreset, PrismaSourcePreset>

export const PARSER_TYPE_TO_PRISMA = {
  "codex-jsonl": "codex_jsonl",
  "claude-jsonl": "claude_jsonl",
  "pi-jsonl": "pi_jsonl",
  "opencode-sqlite": "opencode_sqlite",
  "generic-jsonl": "generic_jsonl",
  "generic-json": "generic_json",
  "generic-markdown": "generic_markdown",
} as const satisfies Record<ParserType, PrismaParserType>

export const SOURCE_READER_TYPE_TO_PRISMA = {
  "file-glob": "file_glob",
  sqlite: "sqlite",
} as const satisfies Record<SourceReaderType, PrismaSourceReaderType>

export const PRISMA_SOURCE_PRESET_TO_API = {
  codex: "codex",
  claude_code: "claude-code",
  pi_agent: "pi-agent",
  opencode: "opencode",
  generic: "generic",
} as const satisfies Record<PrismaSourcePreset, SourcePreset>

export const PRISMA_PARSER_TYPE_TO_API = {
  codex_jsonl: "codex-jsonl",
  claude_jsonl: "claude-jsonl",
  pi_jsonl: "pi-jsonl",
  opencode_sqlite: "opencode-sqlite",
  generic_jsonl: "generic-jsonl",
  generic_json: "generic-json",
  generic_markdown: "generic-markdown",
} as const satisfies Record<PrismaParserType, ParserType>

export const PRISMA_SOURCE_READER_TYPE_TO_API = {
  file_glob: "file-glob",
  sqlite: "sqlite",
} as const satisfies Record<PrismaSourceReaderType, SourceReaderType>
