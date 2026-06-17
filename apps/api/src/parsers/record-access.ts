import type { AgentRole } from "@agent-log-search/shared"
import { ParseFailureError } from "./parser-errors.js"

export type JsonRecord = Readonly<Record<string, unknown>>

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function requireRecord(value: unknown, filePath: string, label: string): JsonRecord {
  if (isRecord(value)) {
    return value
  }
  throw new ParseFailureError({
    code: "invalid_shape",
    filePath,
    line: null,
    message: `${label} is not a JSON object`,
  })
}

export function readValue(record: JsonRecord, field: string): unknown {
  return record[field]
}

export function readOptionalString(record: JsonRecord, field: string): string | null {
  const value = readValue(record, field)
  if (typeof value === "string" && value.length > 0) {
    return value
  }
  return null
}

export function readRecordArray(
  record: JsonRecord,
  field: string,
  filePath: string,
): readonly JsonRecord[] {
  const value = readValue(record, field)
  if (Array.isArray(value)) {
    return value.map((entry, index) => requireRecord(entry, filePath, `${field}[${index}]`))
  }
  throw new ParseFailureError({
    code: "invalid_shape",
    filePath,
    line: null,
    message: `${field} is not a JSON object array`,
  })
}

export function readRole(value: unknown): AgentRole {
  switch (value) {
    case "system":
    case "user":
    case "assistant":
    case "tool":
      return value
    default:
      return "unknown"
  }
}
