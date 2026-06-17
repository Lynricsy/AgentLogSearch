import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import type { AgentJsonlFixture, FixtureRole } from "./fixture-metadata.js"
import { REQUIRED_ROLES } from "./fixture-metadata.js"

export type JsonRecord = Readonly<Record<string, unknown>>

const SAMPLE_DATA_ROOT = resolve(process.cwd(), "../../sample-data")

export async function readFixtureText(relativePath: string): Promise<string> {
  return readFile(fixturePath(relativePath), "utf8")
}

export function fixturePath(relativePath: string): string {
  return resolve(SAMPLE_DATA_ROOT, relativePath)
}

export async function readJsonLines(relativePath: string): Promise<readonly JsonRecord[]> {
  const raw = await readFixtureText(relativePath)
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0)
  expect(lines.length).toBeGreaterThan(0)
  return lines.map((line, index) =>
    requireRecord(parseJson(line, `${relativePath}:${index + 1}`), `${relativePath}:${index + 1}`),
  )
}

export function parseJson(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw)
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new FixtureValidationError(`${label} is not valid JSON: ${error.message}`)
    }
    throw error
  }
}

export function validateAgentJsonlFixture(
  fixture: AgentJsonlFixture,
  records: readonly JsonRecord[],
): string {
  expect(records.length).toBeGreaterThanOrEqual(4)
  const roles = collectRoles(records)
  expect(roles).toEqual(REQUIRED_ROLES)
  expect(records.some((record) => record[fixture.threadField] === fixture.threadId)).toBe(true)
  expect(records.some((record) => readValue(record, "cwd") === fixture.cwd)).toBe(true)
  expect(hasAgentModel(records, fixture.model)).toBe(true)
  expect(hasResumeCommand(records, fixture)).toBe(true)
  expect(records.some((record) => hasNonTextContent(record))).toBe(true)
  return `${fixture.relativePath}:${records.length}`
}

export function validateGenericSession(record: JsonRecord | undefined, label: string): string {
  const session = requireRecord(record, label)
  const threadId = readString(session, "threadId", label)
  expect(readString(session, "cwd", label)).toBe("/workspace/synthetic-generic")
  expect(readString(session, "title", label)).toContain("Synthetic Generic")
  const messages = readRecordArray(session, "messages", label)
  expect(collectRoles(messages)).toEqual(REQUIRED_ROLES)
  expect(messages.some((message) => typeof readValue(message, "content") === "string")).toBe(true)
  expect(messages.some((message) => hasNonTextValue(readValue(message, "content")))).toBe(true)
  return `${threadId}:${messages.length}`
}

export function validateDemoSession(record: JsonRecord | undefined, label: string): string {
  const session = requireRecord(record, label)
  const threadId = readString(session, "threadId", label)
  const messages = readRecordArray(session, "messages", label)
  expect(threadId).toBe("abc123")
  expect(readString(session, "cwd", label)).toBe("/workspace/clisearch-demo")
  expect(
    messages.some((message) => {
      const content = readValue(message, "content")
      return typeof content === "string" && content.includes("登录接口返回 500")
    }),
  ).toBe(true)
  return `${threadId}:${messages.length}`
}

export function validateOpenCodeSqlite(databasePath: string): string {
  const database = new DatabaseSync(databasePath, { readOnly: true })
  try {
    expect(readSqliteNumber(database, "SELECT COUNT(*) AS count FROM sessions", "count")).toBe(1)
    expect(readSqliteNumber(database, "SELECT COUNT(*) AS count FROM messages", "count")).toBe(3)
    expect(readSqliteRoles(database)).toEqual(REQUIRED_ROLES)
    const session = requireRecord(
      database
        .prepare("SELECT id, cwd, model, resume_command FROM sessions WHERE id = ?")
        .get("opencode-thread-synthetic-001"),
      "opencode session",
    )
    const threadId = readString(session, "id", "opencode session")
    const cwd = readString(session, "cwd", "opencode session")
    expect(readString(session, "model", "opencode session")).toBe("opencode-synthetic-model")
    expect(readString(session, "resume_command", "opencode session")).toContain(threadId)
    return `${threadId}:${cwd}:${readSqliteNumber(database, "SELECT COUNT(*) AS count FROM messages", "count")}`
  } finally {
    database.close()
  }
}

export function collectRoles(records: readonly JsonRecord[]): readonly FixtureRole[] {
  const roles = records.map((record) => readRole(record)).filter((role) => role !== null)
  return REQUIRED_ROLES.filter((expectedRole) => roles.includes(expectedRole))
}

export function requireRecord(value: unknown, label: string): JsonRecord {
  if (isRecord(value)) {
    return value
  }
  throw new FixtureValidationError(`${label} is not a JSON object`)
}

function hasAgentModel(records: readonly JsonRecord[], model: string): boolean {
  return records.some(
    (record) => readValue(record, "model") === model || nestedModel(record) === model,
  )
}

function hasResumeCommand(records: readonly JsonRecord[], fixture: AgentJsonlFixture): boolean {
  const expected = `cd ${fixture.cwd} && ${fixture.resumeCommandFragment}`
  return records.some((record) => readValue(record, "resumeCommand") === expected)
}

function readRole(record: JsonRecord): FixtureRole | null {
  const role = readValue(record, "role")
  if (isFixtureRole(role)) {
    return role
  }
  const message = readValue(record, "message")
  if (isRecord(message)) {
    const messageRole = readValue(message, "role")
    if (isFixtureRole(messageRole)) {
      return messageRole
    }
  }
  const type = readValue(record, "type")
  if (type === "user" || type === "assistant") {
    return type
  }
  if (type === "tool_result") {
    return "tool"
  }
  return null
}

function nestedModel(record: JsonRecord): string | null {
  const message = readValue(record, "message")
  const model = isRecord(message) ? readValue(message, "model") : null
  if (typeof model === "string") {
    return model
  }
  return null
}

function hasNonTextContent(record: JsonRecord): boolean {
  if (hasNonTextValue(readValue(record, "content"))) {
    return true
  }
  const message = readValue(record, "message")
  return isRecord(message) && hasNonTextValue(readValue(message, "content"))
}

function hasNonTextValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => {
      if (isRecord(entry)) {
        return readValue(entry, "type") !== "text"
      }
      return typeof entry !== "string"
    })
  }
  return isRecord(value)
}

function readSqliteNumber(database: DatabaseSync, sql: string, field: string): number {
  const record = requireRecord(database.prepare(sql).get(), sql)
  const value = record[field]
  if (typeof value === "number") {
    return value
  }
  throw new FixtureValidationError(`${sql} did not return numeric field ${field}`)
}

function readSqliteRoles(database: DatabaseSync): readonly FixtureRole[] {
  const rows = database.prepare("SELECT role FROM messages ORDER BY sequence").all()
  return rows.map((row) => {
    const role = readValue(requireRecord(row, "opencode message role"), "role")
    if (isFixtureRole(role)) {
      return role
    }
    throw new FixtureValidationError("OpenCode message row has an unsupported role")
  })
}

function readString(record: JsonRecord, field: string, label: string): string {
  const value = readValue(record, field)
  if (typeof value === "string" && value.length > 0) {
    return value
  }
  throw new FixtureValidationError(`${label} is missing string field ${field}`)
}

function readRecordArray(record: JsonRecord, field: string, label: string): readonly JsonRecord[] {
  const value = readValue(record, field)
  if (Array.isArray(value)) {
    return value.map((entry, index) => requireRecord(entry, `${label}.${field}[${index}]`))
  }
  throw new FixtureValidationError(`${label} is missing record array field ${field}`)
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readValue(record: JsonRecord, field: string): unknown {
  return record[field]
}

function isFixtureRole(value: unknown): value is FixtureRole {
  return value === "user" || value === "assistant" || value === "tool"
}

class FixtureValidationError extends Error {
  public readonly name = "FixtureValidationError"
}
