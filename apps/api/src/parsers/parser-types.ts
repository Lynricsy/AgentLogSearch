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
  | "oversized_jsonl_line"
  | "unsupported_tool_record_shape"
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

export type ParsedTraceRawPointer = {
  readonly sourcePath: string
  readonly lineNumber?: number
  readonly sqliteTable?: string
  readonly sqliteRowId?: string
  readonly jsonPath?: string
}

export type ParsedTraceEventBase = {
  readonly sourceEventKey: string
  readonly sequence: number
  readonly subSequence: number
  readonly occurredAt?: Date
  readonly rawPointer: ParsedTraceRawPointer
}

export type ParsedUserMessageEvent = ParsedTraceEventBase & {
  readonly kind: "user_message"
  readonly text: string
}

export type ParsedAssistantMessageEvent = ParsedTraceEventBase & {
  readonly kind: "assistant_message"
  readonly text: string
}

export type ParsedToolCallEvent = ParsedTraceEventBase & {
  readonly kind: "tool_call"
  readonly callId?: string
  readonly toolName: string
  readonly arguments: unknown
}

export type ParsedToolResultEvent = ParsedTraceEventBase & {
  readonly kind: "tool_result"
  readonly callId?: string
  readonly toolName?: string
  readonly result: {
    readonly text?: string
    readonly structured?: unknown
    readonly exitCode?: number
    readonly status?: "success" | "failed" | "unknown"
  }
}

export type ParsedSystemEvent = ParsedTraceEventBase & {
  readonly kind: "system"
  readonly text: string
}

export type ParsedTraceEvent =
  | ParsedUserMessageEvent
  | ParsedAssistantMessageEvent
  | ParsedToolCallEvent
  | ParsedToolResultEvent
  | ParsedSystemEvent

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
  readonly traceEvents: readonly ParsedTraceEvent[]
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
