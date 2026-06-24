import { SecretRedactor } from "../redaction/secret-redactor.js"

export type EvidenceExcerptInput = {
  readonly output: string
  readonly maxChars: number
}

const SIGNAL_PATTERNS = [
  /\b(?:FAIL|ERROR|Error|Exception|TS\d{4})\b/,
  /^Test Files\s+/,
  /^Tests?\s*:/,
  /^Tests\s+/,
  /^Test Suites:/,
  /exited with code|exit code:|Exit status:/i,
] as const

export function buildEvidenceExcerpt(input: EvidenceExcerptInput): {
  readonly excerpt: string | null
  readonly warnings: readonly string[]
} {
  const redactor = new SecretRedactor()
  const lines = redactor.redact(input.output).text.split(/\r?\n/)
  if (lines.length === 0 || lines.every((line) => line.trim().length === 0)) {
    return { excerpt: null, warnings: [] }
  }
  const signalIndexes = signalLineIndexes(lines)
  const warnings: string[] = []
  const selected =
    signalIndexes.length > 0 ? windowedLines(lines, signalIndexes) : fallbackLines(lines, warnings)
  const body = trimToMaxChars(selected.slice(0, 80).join("\n"), input.maxChars)
  const excerpt = redactor.redact(`[tool output excerpt; redacted; truncated]\n${body}`).text
  return { excerpt, warnings }
}

function signalLineIndexes(lines: readonly string[]): readonly number[] {
  const indexes: number[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ""
    if (SIGNAL_PATTERNS.some((pattern) => pattern.test(line))) {
      indexes.push(index)
    }
  }
  return indexes
}

function windowedLines(lines: readonly string[], indexes: readonly number[]): readonly string[] {
  const included = new Set<number>()
  for (const index of indexes) {
    for (let offset = -2; offset <= 2; offset += 1) {
      const target = index + offset
      if (target >= 0 && target < lines.length) {
        included.add(target)
      }
    }
  }
  return [...included].sort((a, b) => a - b).map((index) => lines[index] ?? "")
}

function fallbackLines(lines: readonly string[], warnings: string[]): readonly string[] {
  warnings.push("EXCERPT_NO_SIGNAL_MATCH")
  const first = lines[0] ?? ""
  return [first, ...lines.slice(-10)]
}

function trimToMaxChars(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : value.slice(0, Math.max(0, maxChars))
}
