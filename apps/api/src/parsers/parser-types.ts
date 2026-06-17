import type { AgentRole, ParserType } from "@agent-log-search/shared"

export type TextParserSource = {
  readonly kind: "text"
  readonly filePath: string
  readonly content: string
}

export type SqliteParserSource = {
  readonly kind: "sqlite"
  readonly filePath: string
  readonly databasePath: string
}

export type ParserSource = TextParserSource | SqliteParserSource

export type ParseIssueCode =
  | "empty_content_skipped"
  | "invalid_json"
  | "invalid_shape"
  | "missing_cwd"
  | "missing_thread_id"
  | "unsupported_parser"
  | "wrong_source_kind"

export type ParseIssue = {
  readonly code: ParseIssueCode
  readonly filePath: string
  readonly line: number | null
  readonly message: string
}

export type ParsedMessage = {
  readonly role: AgentRole
  readonly content: string
  readonly model: string | null
  readonly sequence: number
  readonly createdAt: string | null
}

export type ParsedSession = {
  readonly parserType: ParserType
  readonly sourcePath: string
  readonly threadId: string
  readonly cwd: string | null
  readonly title: string | null
  readonly model: string | null
  readonly startedAt: string | null
  readonly updatedAt: string | null
  readonly messages: readonly ParsedMessage[]
}

export type ParseResult = {
  readonly sessions: readonly ParsedSession[]
  readonly warnings: readonly ParseIssue[]
  readonly errors: readonly ParseIssue[]
}

export interface AgentHistoryParser {
  readonly parserType: ParserType
  parse(source: ParserSource): Promise<ParseResult>
}

export type SourceReaderRequest = {
  readonly rootPath: string
  readonly fileGlob: string
}

export interface SourceReader<TSource extends ParserSource = ParserSource> {
  read(request: SourceReaderRequest): Promise<readonly TSource[]>
}
