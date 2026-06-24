import { DatabaseSync } from "node:sqlite"
import { parseJsonValue } from "./json-parse.js"
import type { AgentHistoryParser, ParseResult, ParserSource } from "./parser-types.js"
import {
  isRecord,
  readOptionalString,
  readRole,
  readValue,
  requireRecord,
} from "./record-access.js"
import { buildSession, latestCreatedAt, type MessageDraft } from "./session-builder.js"
import { requireSqliteSource } from "./source-guards.js"

type OpenCodeSessionRow = {
  readonly id: string
  readonly cwd: string | null
  readonly title: string | null
  readonly model: string | null
  readonly createdAt: string | null
  readonly updatedAt: string | null
}

type CurrentOpenCodeMessageRow = {
  readonly id: string
  readonly data: Readonly<Record<string, unknown>>
  readonly createdAt: string | null
}

type CurrentOpenCodePartRow = {
  readonly messageId: string
  readonly data: Readonly<Record<string, unknown>>
}

export class OpenCodeSqliteParser implements AgentHistoryParser {
  public readonly parserType = "opencode-sqlite"

  public async parse(source: ParserSource): Promise<ParseResult> {
    const sqliteSource = requireSqliteSource(source, this.parserType)
    const database = new DatabaseSync(sqliteSource.databasePath, { readOnly: true })
    try {
      const sessions = readSessions(database, sqliteSource.filePath).map((session) => {
        const messages = readMessages(database, sqliteSource.filePath, session.id, session.model)
        return buildSession({
          parserType: this.parserType,
          sourcePath: sqliteSource.filePath,
          threadId: session.id,
          cwd: session.cwd,
          title: session.title,
          model: session.model,
          startedAt: session.createdAt,
          updatedAt: session.updatedAt ?? latestCreatedAt(messages),
          messages,
        })
      })
      return {
        sessions: sessions.map((entry) => entry.session),
        warnings: sessions.flatMap((entry) => entry.warnings),
        errors: [],
      }
    } finally {
      database.close()
    }
  }
}

function readSessions(database: DatabaseSync, filePath: string): readonly OpenCodeSessionRow[] {
  if (tableExists(database, "sessions")) {
    return readLegacySessions(database, filePath)
  }
  return readCurrentSessions(database, filePath)
}

function readMessages(
  database: DatabaseSync,
  filePath: string,
  sessionId: string,
  sessionModel: string | null,
): readonly MessageDraft[] {
  if (tableExists(database, "messages")) {
    return readLegacyMessages(database, filePath, sessionId)
  }
  return readCurrentMessages(database, filePath, sessionId, sessionModel)
}

function tableExists(database: DatabaseSync, tableName: string): boolean {
  return (
    database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName) !== undefined
  )
}

function readLegacySessions(
  database: DatabaseSync,
  filePath: string,
): readonly OpenCodeSessionRow[] {
  return database
    .prepare("SELECT id, cwd, title, model, created_at AS createdAt FROM sessions ORDER BY id")
    .all()
    .map((row) => {
      const record = requireRecord(row, filePath, "OpenCode session row")
      return {
        id: requireString(record, "id", filePath),
        cwd: requireString(record, "cwd", filePath),
        title: requireString(record, "title", filePath),
        model: requireString(record, "model", filePath),
        createdAt: requireString(record, "createdAt", filePath),
        updatedAt: null,
      }
    })
}

function readCurrentSessions(
  database: DatabaseSync,
  filePath: string,
): readonly OpenCodeSessionRow[] {
  return database
    .prepare(
      `SELECT id, directory AS cwd, title, model, time_created AS createdAt, time_updated AS updatedAt
       FROM session ORDER BY time_created, id`,
    )
    .all()
    .map((row) => {
      const record = requireRecord(row, filePath, "OpenCode session row")
      return {
        id: requireString(record, "id", filePath),
        cwd: readOptionalRowString(record, "cwd"),
        title: readOptionalRowString(record, "title"),
        model: readOptionalRowString(record, "model"),
        createdAt: readSqliteTimestamp(record, "createdAt"),
        updatedAt: readSqliteTimestamp(record, "updatedAt"),
      }
    })
}

function readLegacyMessages(
  database: DatabaseSync,
  filePath: string,
  sessionId: string,
): readonly MessageDraft[] {
  return database
    .prepare(
      `SELECT role, content, content_type AS contentType, model, created_at AS createdAt
       FROM messages WHERE session_id = ? ORDER BY sequence`,
    )
    .all(sessionId)
    .map((row) => {
      const record = requireRecord(row, filePath, "OpenCode message row")
      return {
        role: readRole(readValue(record, "role")),
        content: readContent(record, filePath),
        model: readOptionalString(record, "model"),
        createdAt: requireString(record, "createdAt", filePath),
        line: null,
      }
    })
}

function readCurrentMessages(
  database: DatabaseSync,
  filePath: string,
  sessionId: string,
  sessionModel: string | null,
): readonly MessageDraft[] {
  const partsByMessageId = groupPartsByMessageId(readCurrentParts(database, filePath, sessionId))
  return database
    .prepare(
      `SELECT id, data, time_created AS createdAt
       FROM message WHERE session_id = ? ORDER BY time_created, id`,
    )
    .all(sessionId)
    .map((row) => readCurrentMessageRow(row, filePath))
    .map((message) =>
      toCurrentMessageDraft(message, partsByMessageId.get(message.id) ?? [], sessionModel),
    )
    .filter((message) => message !== null)
}

function readCurrentParts(
  database: DatabaseSync,
  filePath: string,
  sessionId: string,
): readonly CurrentOpenCodePartRow[] {
  return database
    .prepare(
      `SELECT message_id AS messageId, data
       FROM part WHERE session_id = ? ORDER BY time_created, id`,
    )
    .all(sessionId)
    .map((row) => {
      const record = requireRecord(row, filePath, "OpenCode part row")
      const data = parseJsonValue(requireString(record, "data", filePath), filePath, null)
      return {
        messageId: requireString(record, "messageId", filePath),
        data: requireRecord(data, filePath, "OpenCode part data"),
      }
    })
}

function readCurrentMessageRow(row: unknown, filePath: string): CurrentOpenCodeMessageRow {
  const record = requireRecord(row, filePath, "OpenCode message row")
  const data = parseJsonValue(requireString(record, "data", filePath), filePath, null)
  return {
    id: requireString(record, "id", filePath),
    data: requireRecord(data, filePath, "OpenCode message data"),
    createdAt: readSqliteTimestamp(record, "createdAt"),
  }
}

function toCurrentMessageDraft(
  message: CurrentOpenCodeMessageRow,
  parts: readonly CurrentOpenCodePartRow[],
  sessionModel: string | null,
): MessageDraft | null {
  const role = readRole(readValue(message.data, "role"))
  const content = currentMessageContent(parts, role)
  if (content.length === 0) {
    return null
  }
  return {
    role,
    content,
    model: readCurrentMessageModel(message.data) ?? sessionModel,
    createdAt: message.createdAt,
    line: null,
  }
}

function currentMessageContent(
  parts: readonly CurrentOpenCodePartRow[],
  role: MessageDraft["role"],
): readonly unknown[] {
  const content: unknown[] = []
  for (const part of parts) {
    const type = readOptionalString(part.data, "type")
    if (type === "text" || type === "reasoning") {
      const text = readValue(part.data, "text")
      if (text !== undefined) {
        content.push(text)
      }
      continue
    }
    if (type === "tool" && role === "assistant") {
      const toolCall = readOpenCodeToolCall(part.data)
      if (toolCall !== null) {
        content.push(toolCall)
      }
    }
  }
  return content
}

function readOpenCodeToolCall(
  part: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> | null {
  const state = readRecordField(part, "state")
  const input = state === null ? undefined : readValue(state, "input")
  const tool = readOptionalString(part, "tool")
  if (tool === null && input === undefined) {
    return null
  }
  return compactRecord({
    tool_call: tool,
    call_id: readOptionalString(part, "callID"),
    status: state === null ? null : readOptionalString(state, "status"),
    input,
  })
}

function readCurrentMessageModel(record: Readonly<Record<string, unknown>>): string | null {
  const modelRecord = readRecordField(record, "model")
  return (
    readOptionalString(record, "modelID") ??
    (modelRecord === null ? null : readOptionalString(modelRecord, "modelID"))
  )
}

function groupPartsByMessageId(
  parts: readonly CurrentOpenCodePartRow[],
): ReadonlyMap<string, readonly CurrentOpenCodePartRow[]> {
  const grouped = new Map<string, CurrentOpenCodePartRow[]>()
  for (const part of parts) {
    const entries = grouped.get(part.messageId) ?? []
    entries.push(part)
    grouped.set(part.messageId, entries)
  }
  return grouped
}

function readContent(record: Readonly<Record<string, unknown>>, filePath: string): unknown {
  const content = requireString(record, "content", filePath)
  const contentType = requireString(record, "contentType", filePath)
  return contentType === "application/json" ? parseJsonValue(content, filePath, null) : content
}

function requireString(
  record: Readonly<Record<string, unknown>>,
  field: string,
  filePath: string,
): string {
  const value = record[field]
  if (typeof value === "string") {
    return value
  }
  throw new InvalidSqliteRowError(filePath, field)
}

function readOptionalRowString(
  record: Readonly<Record<string, unknown>>,
  field: string,
): string | null {
  const value = record[field]
  return typeof value === "string" && value.length > 0 ? value : null
}

function readSqliteTimestamp(
  record: Readonly<Record<string, unknown>>,
  field: string,
): string | null {
  const value = record[field]
  if (typeof value === "string" && value.length > 0) {
    return value
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value < 10_000_000_000 ? value * 1000 : value
    return new Date(millis).toISOString()
  }
  return null
}

function readRecordField(
  record: Readonly<Record<string, unknown>>,
  field: string,
): Readonly<Record<string, unknown>> | null {
  const value = record[field]
  return isRecord(value) ? value : null
}

function compactRecord(record: Record<string, unknown>): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(record).filter(
      ([, value]) => value !== undefined && value !== null && value !== "",
    ),
  )
}

class InvalidSqliteRowError extends Error {
  public readonly name = "InvalidSqliteRowError"

  public constructor(
    public readonly filePath: string,
    public readonly field: string,
  ) {
    super(`Invalid SQLite row field: ${field}`)
  }
}
