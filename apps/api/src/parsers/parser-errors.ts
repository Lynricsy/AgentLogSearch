import type { ParseIssueCode } from "./parser-types.js"

export class ParseFailureError extends Error {
  public readonly name = "ParseFailureError"
  public readonly code: ParseIssueCode
  public readonly filePath: string
  public readonly line: number | null

  public constructor(input: {
    readonly code: ParseIssueCode
    readonly filePath: string
    readonly line: number | null
    readonly message: string
    readonly cause?: unknown
  }) {
    super(input.message, input.cause === undefined ? undefined : { cause: input.cause })
    this.code = input.code
    this.filePath = input.filePath
    this.line = input.line
  }
}

export class UnsupportedParserError extends Error {
  public readonly name = "UnsupportedParserError"

  public constructor(public readonly parserType: string) {
    super(`Unsupported parser type: ${parserType}`)
  }
}
