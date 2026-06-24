import type { AgentRole } from "@agent-log-search/shared"
import { ParseFailureError } from "./parser-errors.js"

export type JsonRecord = Readonly<Record<string, unknown>>

const FLATTEN_TEXT_KEYS = new Set(["text", "content", "output", "stdout", "stderr", "message"])
const MAX_FLATTEN_DEPTH = 8

export type FlattenTextResult = {
  readonly text: string
  readonly truncated: boolean
}

export function asRecord(value: unknown): JsonRecord | null {
  return isRecord(value) ? value : null
}

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

export function readPath(value: unknown, path: readonly string[]): unknown {
  let current: unknown = value
  for (const segment of path.slice(0, MAX_FLATTEN_DEPTH)) {
    if (!isRecord(current)) {
      return undefined
    }
    current = current[segment]
  }
  return current
}

export function readString(
  value: unknown,
  candidates: readonly (readonly string[])[],
): string | undefined {
  for (const path of candidates) {
    const candidate = readPath(value, path)
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate
    }
  }
  return undefined
}

export function readNumber(
  value: unknown,
  candidates: readonly (readonly string[])[],
): number | undefined {
  for (const path of candidates) {
    const candidate = readPath(value, path)
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate
    }
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      const parsed = Number(candidate)
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
  }
  return undefined
}

export function readArray(
  value: unknown,
  candidates: readonly (readonly string[])[],
): unknown[] | undefined {
  for (const path of candidates) {
    const candidate = readPath(value, path)
    if (Array.isArray(candidate)) {
      return candidate
    }
  }
  return undefined
}

export function flattenTextBlocks(value: unknown, maxChars: number): FlattenTextResult | undefined {
  const chunks: string[] = []
  const state = { remaining: Math.max(0, maxChars), truncated: false }
  collectFlattenedText(value, chunks, state, 0, undefined)
  const text = chunks.join("\n").trim()
  if (text.length === 0 && !state.truncated) {
    return undefined
  }
  return { text, truncated: state.truncated }
}

export function readOptionalString(record: JsonRecord, field: string): string | null {
  const value = readValue(record, field)
  if (typeof value === "string" && value.length > 0) {
    return value
  }
  return null
}

function collectFlattenedText(
  value: unknown,
  chunks: string[],
  state: { remaining: number; truncated: boolean },
  depth: number,
  key: string | undefined,
): void {
  if (state.remaining <= 0) {
    state.truncated = true
    return
  }
  if (depth > MAX_FLATTEN_DEPTH) {
    state.truncated = true
    return
  }
  if (typeof value === "string") {
    if (key !== undefined && !FLATTEN_TEXT_KEYS.has(key)) {
      return
    }
    pushFlattenedText(value, chunks, state)
    return
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectFlattenedText(entry, chunks, state, depth + 1, undefined)
    }
    return
  }
  if (!isRecord(value)) {
    return
  }
  for (const [field, child] of Object.entries(value)) {
    if (!FLATTEN_TEXT_KEYS.has(field)) {
      continue
    }
    collectFlattenedText(child, chunks, state, depth + 1, field)
  }
}

function pushFlattenedText(
  value: string,
  chunks: string[],
  state: { remaining: number; truncated: boolean },
): void {
  if (value.length <= state.remaining) {
    chunks.push(value)
    state.remaining -= value.length
    return
  }
  chunks.push(value.slice(0, state.remaining))
  state.remaining = 0
  state.truncated = true
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
    case "developer":
      return "system"
    case "user":
    case "assistant":
    case "tool":
      return value
    case "toolResult":
    case "tool_result":
    case "tool-use-result":
    case "toolUseResult":
      return "tool"
    default:
      return "unknown"
  }
}
