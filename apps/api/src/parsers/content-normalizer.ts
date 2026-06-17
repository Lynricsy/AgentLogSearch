import { isRecord, readValue } from "./record-access.js"

export function normalizeContent(value: unknown): string {
  const normalized = normalizeValue(value)
  return normalized.trim()
}

function normalizeValue(value: unknown): string {
  if (typeof value === "string") {
    return value
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return value.toString()
  }
  if (value === null || value === undefined) {
    return ""
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeValue(entry))
      .filter(hasText)
      .join("\n")
  }
  if (isRecord(value)) {
    return normalizeRecord(value)
  }
  return ""
}

function normalizeRecord(record: Readonly<Record<string, unknown>>): string {
  const directText = firstString(record, ["text", "content", "output", "stdout", "stderr"])
  const nestedParts = readValue(record, "parts")
  const nestedValue = readValue(record, "value")
  const nestedInput = readValue(record, "input")
  const nestedArguments = readValue(record, "arguments")
  const nestedOutput = readValue(record, "output")
  const nestedToolCall = readValue(record, "toolCall")

  return [
    directText,
    normalizeValue(nestedParts),
    normalizeValue(nestedValue),
    normalizeValue(nestedInput),
    normalizeValue(nestedArguments),
    normalizeValue(nestedOutput),
    normalizeValue(nestedToolCall),
    fallbackRecordText(record),
  ]
    .filter(hasText)
    .join("\n")
}

function firstString(
  record: Readonly<Record<string, unknown>>,
  fields: readonly string[],
): string | null {
  for (const field of fields) {
    const value = record[field]
    if (typeof value === "string" && value.trim().length > 0) {
      return value
    }
  }
  return null
}

function fallbackRecordText(record: Readonly<Record<string, unknown>>): string {
  return Object.entries(record)
    .filter(([field]) => !IGNORED_FALLBACK_FIELDS.has(field))
    .map(([field, value]) => `${field}=${normalizePrimitive(value)}`)
    .filter(hasText)
    .join("\n")
}

function normalizePrimitive(value: unknown): string {
  if (typeof value === "string") {
    return value
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return value.toString()
  }
  return ""
}

function hasText(value: string | null): value is string {
  return value !== null && value.trim().length > 0
}

const IGNORED_FALLBACK_FIELDS = new Set([
  "type",
  "kind",
  "role",
  "mediaType",
  "media_type",
  "data",
  "source",
])
