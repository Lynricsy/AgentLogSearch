import { isRecord, readValue } from "./record-access.js"

export function normalizeContent(value: unknown): string {
  const normalized = normalizeValue(value)
  return sanitizeText(normalized).trim()
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

function sanitizeText(value: string): string {
  let result = ""
  for (const character of replaceLoneSurrogates(value)) {
    if (!isDiscardedControlCharacter(character)) {
      result += character
    }
  }
  return result
}

function replaceLoneSurrogates(value: string): string {
  let result = ""
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        result += value[index]
        result += value[index + 1]
        index += 1
      } else {
        result += "\ufffd"
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      result += "\ufffd"
    } else {
      result += value[index]
    }
  }
  return result
}

function isDiscardedControlCharacter(value: string): boolean {
  const code = value.codePointAt(0)
  if (code === undefined) {
    return false
  }
  return code === 0x7f || (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d)
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
