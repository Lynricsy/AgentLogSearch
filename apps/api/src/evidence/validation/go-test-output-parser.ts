import type { TestSummary } from "../evidence-types.js"
import { statusFromSummary, type ValidationOutputInput } from "./validation-output-parser.js"

export function parseGoTestOutput(input: ValidationOutputInput): TestSummary | null {
  const lines = input.output.split(/\r?\n/)
  const packageLines = lines.map(parsePackageLine).filter(isPresent)
  const failedTests = lines
    .map((line) => /^--- FAIL:\s+([^\s(]+)/.exec(line.trim())?.[1])
    .filter((value): value is string => value !== undefined)
    .slice(0, 20)

  if (packageLines.length === 0 && failedTests.length === 0) {
    return null
  }

  const failedPackages = packageLines.filter((entry) => entry.status === "failed")
  const passedPackages = packageLines.filter((entry) => entry.status === "passed")
  const failed = failedPackages.length + failedTests.length
  const passed = passedPackages.length
  return {
    failed,
    failedFiles: failedPackages.map((entry) => entry.packagePath).slice(0, 20),
    failedTests,
    framework: "go-test",
    passed,
    reasonCodes: conflictReasons(input.exitCode, failed, passed),
    status: statusFromSummary({ exitCode: input.exitCode, failed, passed }),
    suiteCount: packageLines.length === 0 ? undefined : packageLines.length,
    suiteFailed: failedPackages.length === 0 ? undefined : failedPackages.length,
    suitePassed: passedPackages.length === 0 ? undefined : passedPackages.length,
    testCount: passed + failed,
  }
}

function parsePackageLine(line: string): {
  readonly packagePath: string
  readonly status: "passed" | "failed"
} | null {
  const trimmed = line.trim()
  const match = /^(ok|FAIL)\s+([^\s]+)(?:\s+|$)/.exec(trimmed)
  if (match === null) {
    return null
  }
  const status = match[1] === "ok" ? "passed" : "failed"
  const packagePath = match[2]
  if (packagePath === undefined || packagePath === "[no") {
    return null
  }
  return { packagePath, status }
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

function isPresent<T>(value: T | null): value is T {
  return value !== null
}
