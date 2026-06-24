import type { ProcessResultFact, ProcessStatus } from "../evidence-types.js"

const FOOTER_PATTERNS = [
  /Process exited with code\s+(-?\d+)/i,
  /Command exited with code\s+(-?\d+)/i,
  /exit code:\s*(-?\d+)/i,
  /Exit status:\s*(-?\d+)/i,
] as const

export function extractProcessResult(input: {
  readonly structuredExitCode?: number | undefined
  readonly explicitStatus?: "success" | "failed" | "unknown" | undefined
  readonly output: string
}): ProcessResultFact {
  if (input.structuredExitCode !== undefined) {
    return {
      exitCode: input.structuredExitCode,
      status: statusFromExitCode(input.structuredExitCode),
      source: "structured",
      reasonCodes: [],
    }
  }
  const footerExitCode = extractExitCodeFooter(input.output)
  if (footerExitCode !== undefined) {
    return {
      exitCode: footerExitCode,
      status: statusFromExitCode(footerExitCode),
      source: "footer",
      reasonCodes: [],
    }
  }
  if (input.explicitStatus === "success" || input.explicitStatus === "failed") {
    return {
      status: input.explicitStatus === "success" ? "succeeded" : "failed",
      source: "explicit_status",
      reasonCodes: [],
    }
  }
  return { status: "unknown", source: "unknown", reasonCodes: [] }
}

export function extractExitCodeFooter(output: string): number | undefined {
  const tail = output.split(/\r?\n/).slice(-50).join("\n")
  for (const pattern of FOOTER_PATTERNS) {
    const match = pattern.exec(tail)
    const raw = match?.[1]
    if (raw !== undefined) {
      const parsed = Number(raw)
      if (Number.isSafeInteger(parsed)) {
        return parsed
      }
    }
  }
  return undefined
}

export function statusFromExitCode(exitCode: number): ProcessStatus {
  return exitCode === 0 ? "succeeded" : "failed"
}

export function reconcileProcessAndSummary(input: {
  readonly process: ProcessResultFact
  readonly summaryFailed?: number | undefined
  readonly summaryPassed?: number | undefined
}): ProcessResultFact {
  const failed = input.summaryFailed ?? 0
  const passed = input.summaryPassed ?? 0
  if (failed > 0) {
    const reasonCodes =
      input.process.exitCode === 0
        ? [...input.process.reasonCodes, "EXIT_CODE_SUMMARY_CONFLICT"]
        : input.process.reasonCodes
    return { ...input.process, status: "failed", reasonCodes }
  }
  if (input.process.exitCode !== undefined && input.process.exitCode !== 0 && passed > 0) {
    return {
      ...input.process,
      status: "failed",
      reasonCodes: [...input.process.reasonCodes, "POST_TEST_COMMAND_FAILED"],
    }
  }
  return input.process
}
