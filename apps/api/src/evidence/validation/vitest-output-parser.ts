import type { ProcessStatus, TestSummary } from "../evidence-types.js"
import {
  type ParsedCountLine,
  parseNamedCounts,
  statusFromSummary,
  type ValidationOutputInput,
} from "./validation-output-parser.js"

export function parseVitestOutput(input: ValidationOutputInput): TestSummary | null {
  const lines = input.output.split(/\r?\n/)
  const fileLine = lines.find((line) => line.trim().startsWith("Test Files"))
  const testsLine = lines.find((line) => line.trim().startsWith("Tests"))
  if (fileLine === undefined && testsLine === undefined) {
    return null
  }
  const fileCounts = fileLine === undefined ? {} : parseNamedCounts(fileLine)
  const testCounts = testsLine === undefined ? {} : parseNamedCounts(testsLine)
  const failedFiles = lines
    .map((line) => /^FAIL\s+(.+)$/.exec(line.trim())?.[1])
    .filter((value): value is string => value !== undefined)
    .slice(0, 20)
  const failedTests = lines
    .map(
      (line) =>
        /^[×✕]\s+(.+)$/.exec(line.trim())?.[1] ?? /^FAIL\s+(.+?)\s+\d/.exec(line.trim())?.[1],
    )
    .filter((value): value is string => value !== undefined)
    .map((value) => (value.length > 300 ? value.slice(0, 300) : value))
    .slice(0, 20)

  const failed = testCounts.failed ?? 0
  const passed = testCounts.passed ?? 0
  return withOptionalCounts(
    {
      framework: "vitest",
      status: statusFromSummary({ exitCode: input.exitCode, failed, passed }),
      reasonCodes: conflictReasons(input.exitCode, failed, passed),
      passed,
      failed,
      skipped: (testCounts.skipped ?? 0) + (testCounts.pending ?? 0),
      todo: testCounts.todo ?? 0,
      failedFiles,
      failedTests,
    },
    fileCounts,
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
    readonly framework: "vitest"
    readonly status: ProcessStatus
    readonly reasonCodes: readonly string[]
    readonly passed: number
    readonly failed: number
    readonly skipped: number
    readonly todo: number
    readonly failedFiles: readonly string[]
    readonly failedTests: readonly string[]
  },
  fileCounts: Readonly<ParsedCountLine>,
  testCounts: Readonly<ParsedCountLine>,
): TestSummary {
  return {
    ...base,
    ...(fileCounts.total === undefined ? {} : { suiteCount: fileCounts.total }),
    ...(fileCounts.passed === undefined ? {} : { suitePassed: fileCounts.passed }),
    ...(fileCounts.failed === undefined ? {} : { suiteFailed: fileCounts.failed }),
    ...(testCounts.total === undefined ? {} : { testCount: testCounts.total }),
  }
}
