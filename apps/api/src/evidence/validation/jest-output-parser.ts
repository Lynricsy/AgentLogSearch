import type { ProcessStatus, TestSummary } from "../evidence-types.js"
import {
  type ParsedCountLine,
  parseNamedCounts,
  statusFromSummary,
  type ValidationOutputInput,
} from "./validation-output-parser.js"

export function parseJestOutput(input: ValidationOutputInput): TestSummary | null {
  const lines = input.output.split(/\r?\n/)
  const suiteLine = lines.find((line) => line.trim().startsWith("Test Suites:"))
  const testsLine = lines.find((line) => line.trim().startsWith("Tests:"))
  if (suiteLine === undefined && testsLine === undefined) {
    return null
  }
  const suiteCounts = suiteLine === undefined ? {} : parseNamedCounts(suiteLine)
  const testCounts = testsLine === undefined ? {} : parseNamedCounts(testsLine)
  const failedFiles = lines
    .map((line) => /^FAIL\s+(.+)$/.exec(line.trim())?.[1])
    .filter((value): value is string => value !== undefined)
    .slice(0, 20)

  const failed = testCounts.failed ?? 0
  const passed = testCounts.passed ?? 0
  return withOptionalCounts(
    {
      framework: "jest",
      status: statusFromSummary({ exitCode: input.exitCode, failed, passed }),
      reasonCodes: conflictReasons(input.exitCode, failed, passed),
      passed,
      failed,
      skipped: (testCounts.skipped ?? 0) + (testCounts.pending ?? 0),
      todo: testCounts.todo ?? 0,
      failedFiles,
      failedTests: [],
    },
    suiteCounts,
    testCounts,
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

function withOptionalCounts(
  base: {
    readonly framework: "jest"
    readonly status: ProcessStatus
    readonly reasonCodes: readonly string[]
    readonly passed: number
    readonly failed: number
    readonly skipped: number
    readonly todo: number
    readonly failedFiles: readonly string[]
    readonly failedTests: readonly string[]
  },
  suiteCounts: Readonly<ParsedCountLine>,
  testCounts: Readonly<ParsedCountLine>,
): TestSummary {
  return {
    ...base,
    ...(suiteCounts.total === undefined ? {} : { suiteCount: suiteCounts.total }),
    ...(suiteCounts.passed === undefined ? {} : { suitePassed: suiteCounts.passed }),
    ...(suiteCounts.failed === undefined ? {} : { suiteFailed: suiteCounts.failed }),
    ...(testCounts.total === undefined ? {} : { testCount: testCounts.total }),
  }
}
