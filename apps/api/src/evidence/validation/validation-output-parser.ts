import type { CommandFamily, TestSummary } from "../evidence-types.js"
import { parseGoTestOutput } from "./go-test-output-parser.js"
import { parseJestOutput } from "./jest-output-parser.js"
import { parsePytestOutput } from "./pytest-output-parser.js"
import { parseVitestOutput } from "./vitest-output-parser.js"

export type ValidationOutputInput = {
  readonly commandFamily?: CommandFamily | undefined
  readonly normalizedCommand?: string | undefined
  readonly output: string
  readonly exitCode?: number | undefined
}

export interface ValidationOutputParser {
  readonly id: string
  supports(input: ValidationOutputInput): boolean
  parse(input: ValidationOutputInput): TestSummary | null
}

export type ParsedCountLine = {
  total?: number | undefined
  passed?: number | undefined
  failed?: number | undefined
  skipped?: number | undefined
  pending?: number | undefined
  todo?: number | undefined
  error?: number | undefined
  errors?: number | undefined
}

const PARSERS: readonly ValidationOutputParser[] = [
  {
    id: "jest",
    supports: (input) =>
      /Test Suites:|Tests:/.test(input.output) ||
      /\b(jest|npm test|pnpm test|yarn test|bun test)\b/.test(input.normalizedCommand ?? ""),
    parse: parseJestOutput,
  },
  {
    id: "vitest",
    supports: (input) =>
      /Test Files\s+/.test(input.output) || /\bvitest\b/.test(input.normalizedCommand ?? ""),
    parse: parseVitestOutput,
  },
  {
    id: "pytest",
    supports: (input) =>
      /\d+\s+(?:passed|failed|skipped|xfailed|xpassed|errors?)\s+in\s+[\d.]+s/i.test(
        input.output,
      ) || /\bpytest\b/.test(input.normalizedCommand ?? ""),
    parse: parsePytestOutput,
  },
  {
    id: "go-test",
    supports: (input) =>
      /^(?:ok|FAIL)\s+[^\s]+/m.test(input.output) ||
      /^--- FAIL:\s+/m.test(input.output) ||
      /\bgo\s+test\b/.test(input.normalizedCommand ?? ""),
    parse: parseGoTestOutput,
  },
]

export function parseValidationOutput(input: ValidationOutputInput): TestSummary | null {
  if (input.commandFamily !== "test") {
    return null
  }
  for (const parser of PARSERS) {
    if (!parser.supports(input)) {
      continue
    }
    const summary = parser.parse(input)
    if (summary !== null) {
      return summary
    }
  }
  return parseGenericCounts(input)
}

export function parseStatusCounts(line: string): Partial<TestSummary> {
  const counts: ParsedCountLine = {}
  const pattern = /(\d+)\s+(passed|failed|skipped|todo|pending|errors?|tests?|suites?)/gi
  for (const match of line.matchAll(pattern)) {
    const rawCount = match[1]
    const label = match[2]?.toLocaleLowerCase("en-US")
    if (rawCount === undefined || label === undefined) {
      continue
    }
    const count = Number(rawCount)
    if (!Number.isSafeInteger(count)) {
      continue
    }
    addCount(counts, label, count)
  }
  return countsToSummary(counts)
}

export function parseNamedCounts(line: string): ParsedCountLine {
  const counts: ParsedCountLine = {}
  for (const match of line.matchAll(/(\d+)\s+([A-Za-z]+)/g)) {
    const count = Number(match[1] ?? "")
    const label = match[2]?.toLocaleLowerCase("en-US")
    if (Number.isSafeInteger(count) && label !== undefined) {
      addCount(counts, label, count)
    }
  }
  const total = /\((\d+)\)/.exec(line)?.[1] ?? /\b(\d+)\s+total\b/i.exec(line)?.[1]
  if (total !== undefined) {
    const parsed = Number(total)
    if (Number.isSafeInteger(parsed)) counts.total = parsed
  }
  return counts
}

export function statusFromSummary(input: {
  readonly exitCode?: number | undefined
  readonly failed?: number | undefined
  readonly passed?: number | undefined
}): "succeeded" | "failed" | "unknown" {
  if ((input.failed ?? 0) > 0) return "failed"
  if (input.exitCode !== undefined && input.exitCode !== 0) return "failed"
  if ((input.passed ?? 0) > 0 && input.exitCode === 0) return "succeeded"
  if (input.exitCode === 0) return "succeeded"
  return "unknown"
}

function parseGenericCounts(input: ValidationOutputInput): TestSummary | null {
  let passed = 0
  let failed = 0
  let skipped = 0
  let todo = 0
  for (const line of input.output.split(/\r?\n/)) {
    const counts = parseStatusCounts(line)
    passed += counts.passed ?? 0
    failed += counts.failed ?? 0
    skipped += counts.skipped ?? 0
    todo += counts.todo ?? 0
  }
  const total = passed + failed + skipped
  if (total === 0) {
    return null
  }
  return {
    framework: "generic",
    status: statusFromSummary({
      exitCode: input.exitCode,
      failed,
      passed,
    }),
    reasonCodes: [],
    testCount: total,
    passed,
    failed,
    skipped,
    todo,
    failedFiles: [],
    failedTests: [],
  }
}

function countsToSummary(counts: Readonly<ParsedCountLine>): Partial<TestSummary> {
  return {
    failed: (counts.failed ?? 0) + (counts.error ?? 0) + (counts.errors ?? 0),
    passed: counts.passed ?? 0,
    skipped: (counts.skipped ?? 0) + (counts.pending ?? 0),
    todo: counts.todo ?? 0,
  }
}

function addCount(counts: ParsedCountLine, label: string, count: number): void {
  switch (label) {
    case "total":
      counts.total = (counts.total ?? 0) + count
      break
    case "passed":
      counts.passed = (counts.passed ?? 0) + count
      break
    case "failed":
      counts.failed = (counts.failed ?? 0) + count
      break
    case "skipped":
      counts.skipped = (counts.skipped ?? 0) + count
      break
    case "pending":
      counts.pending = (counts.pending ?? 0) + count
      break
    case "todo":
      counts.todo = (counts.todo ?? 0) + count
      break
    case "error":
      counts.error = (counts.error ?? 0) + count
      break
    case "errors":
      counts.errors = (counts.errors ?? 0) + count
      break
    default:
      break
  }
}
