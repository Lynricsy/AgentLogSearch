import type { ParseIssue } from "./parser-types.js"
import { type JsonRecord, requireRecord } from "./record-access.js"

const OVERSIZED_JSONL_LINE_CHARS = 1_000_000

export type JsonlRecord = {
  readonly lineNumber: number
  readonly rawLine: string
  readonly value: unknown
}

export type JsonlRecordObject = {
  readonly line: number
  readonly record: JsonRecord
}

export function parseJsonlRecords(
  content: string,
  filePath: string,
): {
  readonly records: readonly JsonlRecordObject[]
  readonly warnings: readonly ParseIssue[]
} {
  const records: JsonlRecordObject[] = []
  const warnings: ParseIssue[] = []
  const lines = content.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? ""
    const lineNumber = index + 1
    if (rawLine.trim().length === 0) {
      continue
    }
    if (rawLine.length > OVERSIZED_JSONL_LINE_CHARS) {
      warnings.push({
        code: "oversized_jsonl_line",
        filePath,
        line: lineNumber,
        message: `Oversized JSONL line at line ${lineNumber.toString()}`,
      })
    }
    try {
      const value: unknown = JSON.parse(rawLine)
      records.push({
        line: lineNumber,
        record: requireRecord(value, filePath, `line ${lineNumber.toString()}`),
      })
    } catch (error) {
      if (error instanceof SyntaxError) {
        warnings.push({
          code: "invalid_json",
          filePath,
          line: lineNumber,
          message: `Invalid JSON at line ${lineNumber.toString()}`,
        })
        continue
      }
      throw error
    }
  }
  return { records, warnings }
}
