import { parseJsonlRecords, parseJsonRecord } from "./json-parse.js"
import type { AgentHistoryParser, ParseResult, ParserSource } from "./parser-types.js"
import {
  type JsonRecord,
  readOptionalString,
  readRecordArray,
  readRole,
  readValue,
} from "./record-access.js"
import {
  buildSession,
  latestCreatedAt,
  type MessageDraft,
  type SessionDraft,
} from "./session-builder.js"
import { requireTextSource } from "./source-guards.js"

export class GenericJsonlParser implements AgentHistoryParser {
  public readonly parserType = "generic-jsonl"

  public async parse(source: ParserSource): Promise<ParseResult> {
    const textSource = requireTextSource(source, this.parserType)
    const records = parseJsonlRecords(textSource.content, textSource.filePath).map(
      (entry) => entry.record,
    )
    return parseGenericRecords(this.parserType, textSource.filePath, records)
  }
}

export class GenericJsonParser implements AgentHistoryParser {
  public readonly parserType = "generic-json"

  public async parse(source: ParserSource): Promise<ParseResult> {
    const textSource = requireTextSource(source, this.parserType)
    return parseGenericRecords(this.parserType, textSource.filePath, [
      parseJsonRecord(textSource.content, textSource.filePath),
    ])
  }
}

function parseGenericRecords(
  parserType: "generic-jsonl" | "generic-json",
  filePath: string,
  records: readonly JsonRecord[],
): ParseResult {
  const built = records.map((record) => buildSession(toGenericDraft(parserType, filePath, record)))
  return {
    sessions: built.map((entry) => entry.session),
    warnings: built.flatMap((entry) => entry.warnings),
    errors: [],
  }
}

function toGenericDraft(
  parserType: "generic-jsonl" | "generic-json",
  filePath: string,
  record: JsonRecord,
): SessionDraft {
  const messages = readRecordArray(record, "messages", filePath).map(toMessageDraft)
  return {
    parserType,
    sourcePath: filePath,
    threadId: readOptionalString(record, "threadId"),
    cwd: readOptionalString(record, "cwd"),
    title: readOptionalString(record, "title"),
    model: messages.find((message) => message.model !== null)?.model ?? null,
    startedAt: messages.at(0)?.createdAt ?? null,
    updatedAt: latestCreatedAt(messages),
    messages,
  }
}

function toMessageDraft(record: JsonRecord): MessageDraft {
  return {
    role: readRole(readValue(record, "role")),
    content: readValue(record, "content"),
    model: readOptionalString(record, "model"),
    createdAt: readOptionalString(record, "createdAt"),
    line: null,
  }
}
