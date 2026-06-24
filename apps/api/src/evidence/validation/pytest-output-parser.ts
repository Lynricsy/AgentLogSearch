import type { TestSummary } from "../evidence-types.js"
import { statusFromSummary, type ValidationOutputInput } from "./validation-output-parser.js"

type PytestCounts = {
  readonly passed: number
  readonly failed: number
  readonly skipped: number
  readonly xfailed: number
  readonly xpassed: number
  readonly errors: number
}

const SUMMARY_LINE_PATTERN =
  /(?:^|=+\s*)(?:(?<counts>\d+\s+(?:passed|failed|skipped|xfailed|xpassed|errors?)(?:,\s*\d+\s+(?:passed|failed|skipped|xfailed|xpassed|errors?))*)\s+in\s+[\d.]+s)(?:\s*=+)?$/i

export function parsePytestOutput(input: ValidationOutputInput): TestSummary | null {
  const lines = input.output.split(/\r?\n/)
  const summaryLine = [...lines].reverse().find((line) => SUMMARY_LINE_PATTERN.test(line.trim()))
  if (summaryLine === undefined) {
    return null
  }
  const counts = parsePytestCounts(summaryLine)
  const failed = counts.failed + counts.errors + counts.xpassed
  const passed = counts.passed
  return {
    failed,
    failedFiles: failedFiles(lines),
    failedTests: failedTests(lines),
    framework: "pytest",
    passed,
    reasonCodes: conflictReasons(input.exitCode, failed, passed),
    skipped: counts.skipped + counts.xfailed,
    status: statusFromSummary({ exitCode: input.exitCode, failed, passed }),
    testCount: passed + failed + counts.skipped + counts.xfailed,
    todo: 0,
  }
}

function parsePytestCounts(line: string): PytestCounts {
  const counts = {
    errors: 0,
    failed: 0,
    passed: 0,
    skipped: 0,
    xfailed: 0,
    xpassed: 0,
  }
  for (const match of line.matchAll(/(\d+)\s+(passed|failed|skipped|xfailed|xpassed|errors?)/gi)) {
    const count = Number(match[1] ?? "")
    const label = normalizeLabel(match[2] ?? "")
    if (!Number.isSafeInteger(count)) {
      continue
    }
    counts[label] += count
  }
  return counts
}

function failedFiles(lines: readonly string[]): readonly string[] {
  return unique(
    lines
      .map((line) => /^(?:FAILED|ERROR)\s+([^:\s]+)(?:::|$)/.exec(line.trim())?.[1])
      .filter((value): value is string => value !== undefined)
      .slice(0, 20),
  )
}

function failedTests(lines: readonly string[]): readonly string[] {
  return unique(
    lines
      .map((line) => /^(?:FAILED|ERROR)\s+(.+?)(?:\s+-\s+.+)?$/.exec(line.trim())?.[1])
      .filter((value): value is string => value !== undefined)
      .map((value) => (value.length > 300 ? value.slice(0, 300) : value))
      .slice(0, 20),
  )
}

function conflictReasons(
  exitCode: number | undefined,
  failed: number,
  passed: number,
): readonly string[] {
  if (exitCode === 0 && failed > 0) return ["EXIT_CODE_SUMMARY_CONFLICT"]
  if (exitCode !== undefined && exitCode !== 0 && failed === 0 && passed > 0) {
    return ["POST_TEST_COMMAND_FAILED"]
  }
  return []
}

function normalizeLabel(label: string): keyof PytestCounts {
  const normalized = label.toLocaleLowerCase("en-US")
  return normalized === "error" ? "errors" : (normalized as keyof PytestCounts)
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)]
}
