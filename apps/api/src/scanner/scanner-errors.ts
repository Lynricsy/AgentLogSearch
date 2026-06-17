import { ConflictException, NotFoundException } from "@nestjs/common"
import type { ParseIssue } from "../parsers/index.js"

export class ScannerConflictError extends ConflictException {
  public readonly name = "ScannerConflictError"

  public constructor(sourceId: bigint) {
    super({
      error: {
        code: "scan_already_running",
        message: `Scan already running for source ${sourceId.toString()}`,
      },
    })
  }
}

export class ScannerSourceNotFoundError extends NotFoundException {
  public readonly name = "ScannerSourceNotFoundError"

  public constructor() {
    super({
      error: {
        code: "source_not_found",
        message: "Source not found",
      },
    })
  }
}

export class ScannerParseIssuesError extends Error {
  public readonly name = "ScannerParseIssuesError"

  public constructor(public readonly issues: readonly ParseIssue[]) {
    super(summarizeParseIssues(issues))
  }
}

function summarizeParseIssues(issues: readonly ParseIssue[]): string {
  const first = issues[0]
  if (first === undefined) {
    return "Parser returned errors"
  }
  const line = first.line === null ? "" : ` line ${first.line.toString()}`
  return `${first.code}${line}: ${first.message}`
}
