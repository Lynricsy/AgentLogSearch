import { DatabaseSync } from "node:sqlite"
import { parseJsonValue } from "./json-parse.js"
import type { AgentHistoryParser, ParseResult, ParserSource } from "./parser-types.js"
import { readOptionalString, readRole, readValue, requireRecord } from "./record-access.js"
import { buildSession, latestCreatedAt, type MessageDraft } from "./session-builder.js"
import { requireSqliteSource } from "./source-guards.js"

type OpenCodeSessionRow = {
  readonly id: string
  readonly cwd: string
  readonly title: string
  readonly model: string
  readonly createdAt: string
}

export class OpenCodeSqliteParser implements AgentHistoryParser {
  public readonly parserType = "opencode-sqlite"

  public async parse(source: ParserSource): Promise<ParseResult> {
    const sqliteSource = requireSqliteSource(source, this.parserType)
    const database = new DatabaseSync(sqliteSource.databasePath, { readOnly: true })
    try {
      const sessions = readSessions(database, sqliteSource.filePath).map((session) => {
        const messages = readMessages(database, sqliteSource.filePath, session.id)
        return buildSession({
          parserType: this.parserType,
          sourcePath: sqliteSource.filePath,
          threadId: session.id,
          cwd: session.cwd,
          title: session.title,
          model: session.model,
          startedAt: session.createdAt,
          updatedAt: latestCreatedAt(messages),
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
      }
    })
}

function readMessages(
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

class InvalidSqliteRowError extends Error {
  public readonly name = "InvalidSqliteRowError"

  public constructor(
    public readonly filePath: string,
    public readonly field: string,
  ) {
    super(`Invalid SQLite row field: ${field}`)
  }
}
