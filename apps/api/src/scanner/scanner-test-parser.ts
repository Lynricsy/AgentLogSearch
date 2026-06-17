import type { ParseResult, ParserSource } from "../parsers/index.js"
import type { FakeParser } from "./scanner-test-types.js"

export function createParserFake(result: ParseResult | Error, delayMs = 0): FakeParser {
  return {
    calls: 0,
    async parse(_parserType: string, _source: ParserSource): Promise<ParseResult> {
      this.calls += 1
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
      if (result instanceof Error) {
        throw result
      }
      return result
    },
  }
}
