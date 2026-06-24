import type {
  AgentRole,
  ParserType,
  ScanJobStatus,
  SourcePreset,
  SourcePresetMetadata,
  SourceReaderType,
} from "@agent-log-search/shared"

const AGENT_NAME_LABELS: Readonly<Record<string, string>> = {
  claude: "Claude",
  "claude-code": "Claude Code",
  codex: "Codex",
  "codex-cli": "Codex CLI",
  generic: "通用",
  opencode: "OpenCode",
  pi: "Pi Agent",
  "pi-agent": "Pi Agent",
}

const PARSER_TYPE_LABELS: Readonly<Record<ParserType, string>> = {
  "claude-jsonl": "Claude JSONL",
  "codex-jsonl": "Codex JSONL",
  "generic-json": "通用 JSON",
  "generic-jsonl": "通用 JSONL",
  "generic-markdown": "通用 Markdown",
  "opencode-sqlite": "OpenCode SQLite",
  "pi-jsonl": "Pi Agent JSONL",
}

const SOURCE_PRESET_LABELS: Readonly<Record<SourcePreset, string>> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  generic: "通用",
  opencode: "OpenCode",
  "pi-agent": "Pi Agent",
}

const SOURCE_READER_TYPE_LABELS: Readonly<Record<SourceReaderType, string>> = {
  "file-glob": "文件匹配",
  sqlite: "SQLite 数据库",
}

const SCAN_JOB_STATUS_LABELS: Readonly<Record<ScanJobStatus, string>> = {
  completed: "已完成",
  failed: "失败",
  queued: "排队中",
  running: "扫描中",
}

const MESSAGE_ROLE_LABELS: Readonly<Record<AgentRole, string>> = {
  assistant: "助手",
  system: "系统",
  tool: "工具",
  unknown: "未知",
  user: "用户",
}

const INTERNAL_NAME_PATTERN =
  /\b(?:live|local|localhost|history|tool[_\s-]*result|filtered|filter(?:ed)?|retained|without[_\s-]*tools?|demo[_\s-]*agent|readme|smoke)\b/gi
const ISO_TIMESTAMP_PATTERN = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/g
const LONG_NUMBER_PATTERN = /\b\d{10,}\b/g

export function formatAgentName(value: string): string {
  return AGENT_NAME_LABELS[value.toLocaleLowerCase("en-US")] ?? value
}

export function formatDisplayName(value: string | null | undefined, fallback: string): string {
  if (value === null || value === undefined) return fallback
  const cleaned = value
    .replace(INTERNAL_NAME_PATTERN, " ")
    .replace(ISO_TIMESTAMP_PATTERN, " ")
    .replace(LONG_NUMBER_PATTERN, " ")
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  return cleaned.length > 0 ? cleaned : fallback
}

export function formatMessageRole(role: AgentRole): string {
  return MESSAGE_ROLE_LABELS[role]
}

export function formatParserType(parserType: ParserType | string): string {
  return PARSER_TYPE_LABELS[parserType as ParserType] ?? parserType
}

export function formatScanJobStatus(status: ScanJobStatus): string {
  return SCAN_JOB_STATUS_LABELS[status]
}

export function formatSourcePreset(sourcePreset: SourcePreset | string): string {
  return SOURCE_PRESET_LABELS[sourcePreset as SourcePreset] ?? sourcePreset
}

export function formatSourcePresetMetadataLabel(preset: SourcePresetMetadata): string {
  if (preset.id === "generic-jsonl") return "通用 JSONL"
  if (preset.id === "generic-json") return "通用 JSON"
  if (preset.id === "generic-markdown") return "通用 Markdown"
  return preset.label
}

export function formatSourceReaderType(readerType: SourceReaderType): string {
  return SOURCE_READER_TYPE_LABELS[readerType]
}
