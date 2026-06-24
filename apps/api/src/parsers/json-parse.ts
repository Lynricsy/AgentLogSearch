import { parseJsonlRecords as parseJsonlRecordResult } from "./jsonl-reader.js"
import { ParseFailureError } from "./parser-errors.js"
import { type JsonRecord, requireRecord } from "./record-access.js"

export type JsonLineRecord = {
  readonly record: JsonRecord
  readonly line: number
}

export function parseJsonValue(raw: string, filePath: string, line: number | null): unknown {
  try {
    return JSON.parse(raw)
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ParseFailureError({
        code: "invalid_json",
        filePath,
        line,
        message: line === null ? "Invalid JSON document" : `Invalid JSON at line ${line}`,
        cause: error,
      })
    }
    throw error
  }
}

export function parseJsonRecord(raw: string, filePath: string): JsonRecord {
  return requireRecord(parseJsonValue(raw, filePath, null), filePath, "JSON document")
}

export function parseJsonlRecords(raw: string, filePath: string): readonly JsonLineRecord[] {
  const result = parseJsonlRecordResult(raw, filePath)
  const invalidJson = result.warnings.find((warning) => warning.code === "invalid_json")
  if (invalidJson !== undefined) {
    throw new ParseFailureError({
      code: "invalid_json",
      filePath,
      line: invalidJson.line,
      message: invalidJson.message,
    })
  }
  return result.records
}
