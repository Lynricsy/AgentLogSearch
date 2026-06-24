import type { TestSummary } from "../evidence-types.js"
import { statusFromSummary, type ValidationOutputInput } from "./validation-output-parser.js"

type CargoCounts = {
  readonly passed: number
  readonly failed: number
  readonly ignored: number
  readonly measured: number
  readonly filteredOut: number
}

const SUMMARY_PATTERN = /test result:\s+(ok|FAILED)\.\s+(?<counts>[^.\n]+(?:\.[^.\n]+)?)/gi

export function parseCargoTestOutput(input: ValidationOutputInput): TestSummary | null {
  const summaries = [...input.output.matchAll(SUMMARY_PATTERN)]
  if (summaries.length === 0) {
    return null
  }

  const counts = summaries.map((match) => parseCargoCounts(match[0]))
  const passed = sum(counts, "passed")
  const failed = sum(counts, "failed")
  return {
    failed,
    failedFiles: [],
    failedTests: failedTests(input.output.split(/\r?\n/)),
    framework: "cargo-test",
    passed,
    reasonCodes: conflictReasons(input.exitCode, failed, passed),
    skipped: sum(counts, "ignored"),
    status: statusFromSummary({ exitCode: input.exitCode, failed, passed }),
    suiteCount: summaries.length,
    suiteFailed: summaries.filter(
      (match) => (match[1] ?? "").toLocaleUpperCase("en-US") === "FAILED",
    ).length,
    suitePassed: summaries.filter((match) => (match[1] ?? "").toLocaleLowerCase("en-US") === "ok")
      .length,
    testCount: passed + failed + sum(counts, "ignored"),
    todo: 0,
  }
}

function parseCargoCounts(line: string): CargoCounts {
  const counts = {
    failed: 0,
    filteredOut: 0,
    ignored: 0,
    measured: 0,
    passed: 0,
  }
  for (const match of line.matchAll(/(\d+)\s+(passed|failed|ignored|measured|filtered out)/gi)) {
    const count = Number(match[1] ?? "")
    const label = normalizeLabel(match[2] ?? "")
    if (!Number.isSafeInteger(count)) {
      continue
    }
    counts[label] += count
  }
  return counts
}

function failedTests(lines: readonly string[]): readonly string[] {
  return lines
    .map(
      (line) =>
        /^\s*test\s+([A-Za-z_][\w:<>-]*)\s+\.\.\.\s+FAILED$/.exec(line)?.[1] ??
        /^\s*([A-Za-z_][\w:<>-]*)\s+---\s+FAILED$/.exec(line)?.[1],
    )
    .filter((value): value is string => value !== undefined)
    .slice(0, 20)
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

function normalizeLabel(label: string): keyof CargoCounts {
  return label.toLocaleLowerCase("en-US").replace(/\s+/g, "") === "filteredout"
    ? "filteredOut"
    : (label.toLocaleLowerCase("en-US") as keyof CargoCounts)
}

function sum(counts: readonly CargoCounts[], key: keyof CargoCounts): number {
  return counts.reduce((total, entry) => total + entry[key], 0)
}
