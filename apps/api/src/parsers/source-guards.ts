import type { ParserType } from "@agent-log-search/shared"
import { ParseFailureError } from "./parser-errors.js"
import type { ParserSource, SqliteParserSource, TextParserSource } from "./parser-types.js"

export function requireTextSource(source: ParserSource, parserType: ParserType): TextParserSource {
  if (source.kind === "text") {
    return source
  }
  throw new ParseFailureError({
    code: "wrong_source_kind",
    filePath: source.filePath,
    line: null,
    message: `${parserType} requires a text source`,
  })
}

export function requireSqliteSource(
  source: ParserSource,
  parserType: ParserType,
): SqliteParserSource {
  if (source.kind === "sqlite") {
    return source
  }
  throw new ParseFailureError({
    code: "wrong_source_kind",
    filePath: source.filePath,
    line: null,
    message: `${parserType} requires a SQLite source`,
  })
}
