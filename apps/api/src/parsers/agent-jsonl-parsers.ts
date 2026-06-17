import type { ParserType } from "@agent-log-search/shared"
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

type AgentJsonlConfig = {
  readonly parserType: ParserType
  readonly sessionKindField: "type" | "event"
  readonly sessionKindValue: string
  readonly threadField: "threadId" | "sessionId"
}

export class CodexJsonlParser implements AgentHistoryParser {
  public readonly parserType = "codex-jsonl"

  public async parse(source: ParserSource): Promise<ParseResult> {
    return parseAgentJsonl(source, {
      parserType: this.parserType,
      sessionKindField: "type",
      sessionKindValue: "session",
      threadField: "threadId",
    })
  }
}

export class ClaudeJsonlParser implements AgentHistoryParser {
  public readonly parserType = "claude-jsonl"

  public async parse(source: ParserSource): Promise<ParseResult> {
    return parseAgentJsonl(source, {
      parserType: this.parserType,
      sessionKindField: "type",
      sessionKindValue: "summary",
      threadField: "sessionId",
    })
  }
}

export class PiJsonlParser implements AgentHistoryParser {
  public readonly parserType = "pi-jsonl"

  public async parse(source: ParserSource): Promise<ParseResult> {
    return parseAgentJsonl(source, {
      parserType: this.parserType,
      sessionKindField: "event",
      sessionKindValue: "session",
      threadField: "threadId",
    })
  }
}

function parseAgentJsonl(source: ParserSource, config: AgentJsonlConfig): ParseResult {
  const textSource = requireTextSource(source, config.parserType)
  const records = parseJsonlRecords(textSource.content, textSource.filePath)
  const sessionRecord = records.find(
    (entry) => readValue(entry.record, config.sessionKindField) === config.sessionKindValue,
  )
  const draft = buildAgentDraft(config, textSource.filePath, records, sessionRecord?.record ?? null)
  const built = buildSession(draft)
  return { sessions: [built.session], warnings: built.warnings, errors: [] }
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
    threadId: readThreadId(sessionRecord, records, config.threadField),
    cwd: readSessionString("cwd", sessionRecord, records),
    title: readOptionalFromSession("title", sessionRecord),
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
    role: nestedRole ?? role,
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
  field: string,
): string | null {
  return readOptionalFromSession(field, sessionRecord) ?? readSessionString(field, null, records)
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

function isMessageRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isString(value: string | null): value is string {
  return value !== null
}
