import type { ParserType } from "@agent-log-search/shared"
import { normalizeContent } from "./content-normalizer.js"
import { type JsonLineRecord, parseJsonlRecords } from "./json-parse.js"
import type { AgentHistoryParser, ParseResult, ParserSource } from "./parser-types.js"
import { type JsonRecord, readOptionalString, readRole, readValue } from "./record-access.js"
import {
  buildSession,
  latestCreatedAt,
  type MessageDraft,
  type SessionDraft,
} from "./session-builder.js"
import { requireTextSource } from "./source-guards.js"

const MAX_CODEX_TOOL_ARGUMENT_CHARS = 600
const MAX_CODEX_TOOL_FIELD_CHARS = 300
const MAX_CODEX_PATCH_FILES = 20
const MAX_DERIVED_TITLE_CHARS = 80
const SYNTHETIC_USER_CONTEXT_PREFIXES = [
  "# AGENTS.md instructions",
  "<command-message>",
  "<environment_context>",
  "<ide_opened_file>",
  "<local-command-stdout>",
  "<system-reminder>",
  "<turn_aborted>",
  "The user interrupted the previous turn",
] as const

type AgentJsonlConfig = {
  readonly parserType: ParserType
  readonly sessionKindFields: readonly ("type" | "event")[]
  readonly sessionKindValue: string
  readonly threadFields: readonly string[]
}

export class CodexJsonlParser implements AgentHistoryParser {
  public readonly parserType = "codex-jsonl"

  public async parse(source: ParserSource): Promise<ParseResult> {
    return parseCodexJsonl(source, this.parserType)
  }
}

export class ClaudeJsonlParser implements AgentHistoryParser {
  public readonly parserType = "claude-jsonl"

  public async parse(source: ParserSource): Promise<ParseResult> {
    return parseAgentJsonl(source, {
      parserType: this.parserType,
      sessionKindFields: ["type"],
      sessionKindValue: "summary",
      threadFields: ["sessionId"],
    })
  }
}

export class PiJsonlParser implements AgentHistoryParser {
  public readonly parserType = "pi-jsonl"

  public async parse(source: ParserSource): Promise<ParseResult> {
    return parseAgentJsonl(source, {
      parserType: this.parserType,
      sessionKindFields: ["type", "event"],
      sessionKindValue: "session",
      threadFields: ["id", "threadId"],
    })
  }
}

function parseAgentJsonl(source: ParserSource, config: AgentJsonlConfig): ParseResult {
  const textSource = requireTextSource(source, config.parserType)
  const records = parseJsonlRecords(textSource.content, textSource.filePath)
  const sessionRecord = records.find((entry) => isSessionRecord(entry.record, config))
  const draft = buildAgentDraft(config, textSource.filePath, records, sessionRecord?.record ?? null)
  const built = buildSession(draft)
  return { sessions: [built.session], warnings: built.warnings, errors: [] }
}

function parseCodexJsonl(source: ParserSource, parserType: ParserType): ParseResult {
  const textSource = requireTextSource(source, parserType)
  const records = parseJsonlRecords(textSource.content, textSource.filePath)
  if (!isCodexRollout(records)) {
    return parseAgentJsonl(source, {
      parserType,
      sessionKindFields: ["type"],
      sessionKindValue: "session",
      threadFields: ["threadId"],
    })
  }

  const draft = buildCodexRolloutDraft(parserType, textSource.filePath, records)
  const built = buildSession(draft)
  return { sessions: [built.session], warnings: built.warnings, errors: [] }
}

function isCodexRollout(records: readonly JsonLineRecord[]): boolean {
  return records.some(
    (entry) =>
      readValue(entry.record, "type") === "session_meta" && readPayload(entry.record) !== null,
  )
}

function isSessionRecord(record: JsonRecord, config: AgentJsonlConfig): boolean {
  return config.sessionKindFields.some(
    (field) => readValue(record, field) === config.sessionKindValue,
  )
}

function buildCodexRolloutDraft(
  parserType: ParserType,
  filePath: string,
  records: readonly JsonLineRecord[],
): SessionDraft {
  const sessionPayload =
    readPayload(
      records.find((entry) => readValue(entry.record, "type") === "session_meta")?.record,
    ) ?? null
  const hasResponseItemMessages = records.some((entry) => {
    const payload = readPayload(entry.record)
    return (
      readOptionalString(entry.record, "type") === "response_item" &&
      payload !== null &&
      readOptionalString(payload, "type") === "message"
    )
  })
  const messages = records
    .map((entry) => toCodexRolloutMessageDraft(entry, hasResponseItemMessages))
    .filter((message) => message !== null)

  return {
    parserType,
    sourcePath: filePath,
    threadId: readOptionalFromSession("id", sessionPayload),
    cwd: readOptionalFromSession("cwd", sessionPayload),
    title: readNativeTitleFromRecord(sessionPayload) ?? deriveTitleFromMessages(messages),
    model:
      readOptionalFromSession("model", sessionPayload) ??
      readOptionalFromSession("model_provider", sessionPayload),
    startedAt:
      readOptionalFromSession("timestamp", sessionPayload) ??
      records.map((entry) => readOptionalString(entry.record, "timestamp")).find(isString) ??
      null,
    updatedAt: latestCreatedAt(messages),
    messages,
  }
}

function toCodexRolloutMessageDraft(
  entry: JsonLineRecord,
  hasResponseItemMessages: boolean,
): MessageDraft | null {
  const payload = readPayload(entry.record)
  if (payload === null) {
    return null
  }

  const recordType = readOptionalString(entry.record, "type")
  const payloadType = readOptionalString(payload, "type")
  const createdAt =
    readOptionalString(entry.record, "timestamp") ?? readOptionalString(payload, "timestamp")

  switch (payloadType) {
    case "message":
      return codexMessageDraft(payload, readValue(payload, "content"), createdAt, entry.line)
    case "user_message":
      if (hasResponseItemMessages) {
        return null
      }
      if (recordType !== "event_msg") {
        return null
      }
      return codexMessageDraft(
        payload,
        firstDefined(readValue(payload, "message"), readValue(payload, "content")),
        createdAt,
        entry.line,
        "user",
      )
    case "agent_message":
      if (hasResponseItemMessages) {
        return null
      }
      if (recordType !== "event_msg") {
        return null
      }
      return codexMessageDraft(
        payload,
        firstDefined(
          readValue(payload, "message"),
          readValue(payload, "text"),
          readValue(payload, "content"),
        ),
        createdAt,
        entry.line,
        "assistant",
      )
    case "agent_reasoning":
    case "reasoning":
      return null
    case "function_call":
    case "custom_tool_call":
    case "tool_search_call":
    case "mcp_tool_call_begin":
      return codexMessageDraft(
        payload,
        codexToolCallContent(payload),
        createdAt,
        entry.line,
        "assistant",
      )
    case "mcp_tool_call_end":
    case "exec_command_begin":
    case "exec_command_end":
    case "patch_apply_begin":
    case "patch_apply_end":
      return null
    case "function_call_output":
    case "custom_tool_call_output":
    case "tool_search_output":
      return codexMessageDraft(payload, payload, createdAt, entry.line, "tool")
    default:
      return null
  }
}

function codexMessageDraft(
  payload: JsonRecord,
  content: unknown,
  createdAt: string | null,
  line: number,
  forcedRole?: MessageDraft["role"],
): MessageDraft | null {
  if (content === undefined) {
    return null
  }
  const role = forcedRole ?? readRole(readValue(payload, "role"))
  if (role === "system") {
    return null
  }
  if (role === "user" && isSyntheticCodexUserContext(content)) {
    return null
  }
  return {
    role,
    content,
    model: readOptionalString(payload, "model"),
    createdAt,
    line,
  }
}

function codexToolCallContent(payload: JsonRecord): JsonRecord {
  const name = readOptionalString(payload, "name") ?? readOptionalString(payload, "tool")
  return compactRecord({
    tool_call: name,
    call_id: readOptionalString(payload, "call_id"),
    status: readOptionalString(payload, "status"),
    execution: readOptionalString(payload, "execution"),
    arguments: summarizeCodexToolValue(name, readValue(payload, "arguments")),
    input: summarizeCodexToolValue(name, readValue(payload, "input")),
  })
}

function readPayload(record: JsonRecord | undefined): JsonRecord | null {
  return record === undefined ? null : readPayloadRecord(record, "payload")
}

function readPayloadRecord(record: JsonRecord, field: string): JsonRecord | null {
  const value = readValue(record, field)
  return isMessageRecord(value) ? value : null
}

function firstDefined(...values: readonly unknown[]): unknown {
  return values.find((value) => value !== undefined)
}

function compactRecord(record: Record<string, unknown>): JsonRecord {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined))
}

function isSyntheticCodexUserContext(content: unknown): boolean {
  const normalized = normalizeContent(content)
  return isSyntheticUserContextText(normalized)
}

function summarizeCodexToolValue(toolName: string | null, value: unknown): unknown {
  if (value === undefined || value === null) {
    return undefined
  }
  if (toolName === "exec_command" || toolName === "shell_command") {
    return summarizeCommandValue(value)
  }
  if (toolName === "apply_patch") {
    return summarizePatchValue(value)
  }
  return compactToolValue(value)
}

function summarizeCommandValue(value: unknown): JsonRecord {
  const record = readJsonRecord(value)
  if (record !== null) {
    return compactRecord({
      cmd: compactToolValue(readValue(record, "cmd") ?? readValue(record, "command")),
      workdir: compactToolValue(readValue(record, "workdir") ?? readValue(record, "cwd")),
    })
  }
  return compactRecord({ cmd: compactToolValue(value) })
}

function summarizePatchValue(value: unknown): JsonRecord {
  const text = typeof value === "string" ? value : normalizeContent(value)
  const files = [...text.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gmu)]
    .map((match) => match[1])
    .filter(isDefinedString)
    .slice(0, MAX_CODEX_PATCH_FILES)
  return compactRecord({
    files: files.length > 0 ? files : undefined,
    preview: files.length === 0 ? truncateText(text, MAX_CODEX_TOOL_ARGUMENT_CHARS) : undefined,
  })
}

function compactToolValue(value: unknown): unknown {
  if (typeof value === "string") {
    const record = readJsonRecord(value)
    return record === null
      ? truncateText(value, MAX_CODEX_TOOL_ARGUMENT_CHARS)
      : compactJsonRecord(record)
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => compactToolValue(entry))
      .filter((entry) => entry !== undefined)
      .slice(0, MAX_CODEX_PATCH_FILES)
  }
  if (isMessageRecord(value)) {
    return compactJsonRecord(value)
  }
  return value
}

function compactJsonRecord(record: JsonRecord): JsonRecord {
  return Object.fromEntries(
    Object.entries(record)
      .map(([field, value]) => [field, compactJsonField(value)] as const)
      .filter(([, value]) => value !== undefined),
  )
}

function compactJsonField(value: unknown): unknown {
  if (typeof value === "string") {
    return truncateText(value, MAX_CODEX_TOOL_FIELD_CHARS)
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return value
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => compactJsonField(entry))
      .filter((entry) => entry !== undefined)
      .slice(0, MAX_CODEX_PATCH_FILES)
  }
  if (isMessageRecord(value)) {
    return compactJsonRecord(value)
  }
  return undefined
}

function readJsonRecord(value: unknown): JsonRecord | null {
  if (isMessageRecord(value)) {
    return value
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(value)
    return isMessageRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function truncateText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`
}

function deriveTitleFromMessages(messages: readonly MessageDraft[]): string | null {
  for (const message of messages) {
    if (message.role !== "user") {
      continue
    }
    const title = titleFromUserContent(message.content)
    if (title !== null) {
      return title
    }
  }
  return null
}

function titleFromUserContent(content: unknown): string | null {
  const normalized = normalizeContent(content)
  const promptText = extractPromptText(normalized)
  if (promptText === null) {
    return null
  }
  const firstLine = promptText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(isTitleLineCandidate)
  return firstLine === undefined ? null : truncateTitle(firstLine)
}

function extractPromptText(value: string): string | null {
  const trimmed = value.trim()
  if (isSyntheticUserContextText(trimmed)) {
    return null
  }
  if (!trimmed.startsWith("# Context from my IDE setup:")) {
    return trimmed
  }

  const requestMarker = /^## My request(?: for [^:\n]+)?:\s*$/gim
  let marker: RegExpExecArray | null = null
  for (
    let match = requestMarker.exec(trimmed);
    match !== null;
    match = requestMarker.exec(trimmed)
  ) {
    marker = match
  }
  if (marker === null) {
    return null
  }
  return trimmed.slice(marker.index + marker[0].length).trim() || null
}

function isSyntheticUserContextText(value: string): boolean {
  return SYNTHETIC_USER_CONTEXT_PREFIXES.some((prefix) => value.startsWith(prefix))
}

function isTitleLineCandidate(line: string): boolean {
  return (
    line.length > 0 &&
    !line.startsWith("```") &&
    !line.startsWith("- ") &&
    !line.startsWith("# Files mentioned by the user:")
  )
}

function truncateTitle(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim()
  return normalized.length <= MAX_DERIVED_TITLE_CHARS
    ? normalized
    : `${normalized.slice(0, MAX_DERIVED_TITLE_CHARS)}...`
}

function buildAgentDraft(
  config: AgentJsonlConfig,
  filePath: string,
  records: readonly JsonLineRecord[],
  sessionRecord: JsonRecord | null,
): SessionDraft {
  const messages = records
    .filter((entry) => entry.record !== sessionRecord)
    .map((entry) => toMessageDraft(entry.record, entry.line))
    .filter((message) => message !== null)

  return {
    parserType: config.parserType,
    sourcePath: filePath,
    threadId: readThreadId(sessionRecord, records, config.threadFields),
    cwd: readSessionString("cwd", sessionRecord, records),
    title: readAgentTitle(config.parserType, sessionRecord, records, messages),
    model: readSessionString("model", sessionRecord, records),
    startedAt: readOptionalFromSession("createdAt", sessionRecord),
    updatedAt: latestCreatedAt(messages),
    messages,
  }
}

function toMessageDraft(record: JsonRecord, line: number): MessageDraft | null {
  const nestedMessage = readValue(record, "message")
  const messageRecord = typeof nestedMessage === "object" ? nestedMessage : record
  const role = readRole(readValue(record, "role") ?? readValue(record, "type"))
  const nestedRole = readRoleFromNestedMessage(nestedMessage)
  const content = readNestedContent(nestedMessage) ?? readValue(record, "content")
  if (content === undefined) {
    return null
  }
  return {
    role: readRoleFromContent(content) ?? nestedRole ?? role,
    content,
    model:
      readOptionalString(record, "model") ??
      (isMessageRecord(messageRecord) ? readOptionalString(messageRecord, "model") : null),
    createdAt: readOptionalString(record, "createdAt"),
    line,
  }
}

function readThreadId(
  sessionRecord: JsonRecord | null,
  records: readonly JsonLineRecord[],
  fields: readonly string[],
): string | null {
  for (const field of fields) {
    const threadId = readOptionalFromSession(field, sessionRecord)
    if (threadId !== null) {
      return threadId
    }
  }
  for (const field of fields) {
    const threadId = readSessionString(field, null, records)
    if (threadId !== null) {
      return threadId
    }
  }
  return null
}

function readSessionString(
  field: string,
  sessionRecord: JsonRecord | null,
  records: readonly JsonLineRecord[],
): string | null {
  return (
    readOptionalFromSession(field, sessionRecord) ??
    records.map((entry) => readOptionalString(entry.record, field)).find(isString) ??
    null
  )
}

function readAgentTitle(
  parserType: ParserType,
  sessionRecord: JsonRecord | null,
  records: readonly JsonLineRecord[],
  messages: readonly MessageDraft[],
): string | null {
  return (
    readNativeTitleFromRecord(sessionRecord) ??
    (parserType === "claude-jsonl" ? readRecordString("slug", records) : null) ??
    deriveTitleFromMessages(messages)
  )
}

function readNativeTitleFromRecord(record: JsonRecord | null): string | null {
  if (record === null) {
    return null
  }
  return (
    normalizeTitle(readOptionalString(record, "title")) ??
    normalizeTitle(readOptionalString(record, "summary")) ??
    normalizeTitle(readOptionalString(record, "name"))
  )
}

function readRecordString(field: string, records: readonly JsonLineRecord[]): string | null {
  for (const entry of records) {
    const normalized = normalizeTitle(readOptionalString(entry.record, field))
    if (normalized !== null) {
      return normalized
    }
  }
  return null
}

function normalizeTitle(value: string | null): string | null {
  if (value === null) {
    return null
  }
  const normalized = value.replace(/\s+/g, " ").trim()
  if (normalized.length === 0 || normalized.toLocaleLowerCase("en-US") === "auto") {
    return null
  }
  return normalized
}

function readOptionalFromSession(field: string, sessionRecord: JsonRecord | null): string | null {
  return sessionRecord === null ? null : readOptionalString(sessionRecord, field)
}

function readRoleFromNestedMessage(value: unknown): MessageDraft["role"] | null {
  if (!isMessageRecord(value)) {
    return null
  }
  return readRole(readValue(value, "role"))
}

function readNestedContent(value: unknown): unknown {
  return isMessageRecord(value) ? readValue(value, "content") : undefined
}

function readRoleFromContent(value: unknown): MessageDraft["role"] | null {
  if (!Array.isArray(value)) {
    return null
  }
  if (value.some((entry) => isMessageRecord(entry) && readValue(entry, "type") === "tool_result")) {
    return "tool"
  }
  return null
}

function isMessageRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isString(value: string | null): value is string {
  return value !== null
}

function isDefinedString(value: string | undefined): value is string {
  return value !== undefined
}
