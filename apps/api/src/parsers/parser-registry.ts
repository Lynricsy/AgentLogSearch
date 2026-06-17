import type { ParserType } from "@agent-log-search/shared"
import { ClaudeJsonlParser, CodexJsonlParser, PiJsonlParser } from "./agent-jsonl-parsers.js"
import { GenericJsonlParser, GenericJsonParser } from "./generic-json-parsers.js"
import { GenericMarkdownParser } from "./generic-markdown-parser.js"
import { OpenCodeSqliteParser } from "./opencode-sqlite-parser.js"
import { UnsupportedParserError } from "./parser-errors.js"
import type { AgentHistoryParser, ParseResult, ParserSource } from "./parser-types.js"

export class ParserRegistry {
  private readonly parsers: ReadonlyMap<ParserType, AgentHistoryParser>

  public constructor(parsers: readonly AgentHistoryParser[]) {
    this.parsers = new Map(parsers.map((parser) => [parser.parserType, parser]))
  }

  public static createDefault(): ParserRegistry {
    return new ParserRegistry([
      new CodexJsonlParser(),
      new ClaudeJsonlParser(),
      new PiJsonlParser(),
      new OpenCodeSqliteParser(),
      new GenericJsonlParser(),
      new GenericJsonParser(),
      new GenericMarkdownParser(),
    ])
  }

  public listTypes(): readonly ParserType[] {
    return [
      "codex-jsonl",
      "claude-jsonl",
      "pi-jsonl",
      "opencode-sqlite",
      "generic-jsonl",
      "generic-json",
      "generic-markdown",
    ]
  }

  public async parse(parserType: ParserType, source: ParserSource): Promise<ParseResult> {
    const parser = this.parsers.get(parserType)
    if (parser === undefined) {
      throw new UnsupportedParserError(parserType)
    }
    return parser.parse(source)
  }
}
