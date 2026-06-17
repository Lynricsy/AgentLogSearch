import type { AgentHistoryParser, ParseResult, ParserSource } from "./parser-types.js"
import { readRole } from "./record-access.js"
import { buildSession, type MessageDraft } from "./session-builder.js"
import { requireTextSource } from "./source-guards.js"

type MarkdownMetadata = {
  readonly threadId: string | null
  readonly cwd: string | null
  readonly title: string | null
}

type MarkdownSection = {
  readonly role: string
  readonly body: string
}

export class GenericMarkdownParser implements AgentHistoryParser {
  public readonly parserType = "generic-markdown"

  public async parse(source: ParserSource): Promise<ParseResult> {
    const textSource = requireTextSource(source, this.parserType)
    const metadata = readMetadata(textSource.content)
    const messages = readSections(textSource.content).map(toMessageDraft)
    const built = buildSession({
      parserType: this.parserType,
      sourcePath: textSource.filePath,
      threadId: metadata.threadId,
      cwd: metadata.cwd,
      title: metadata.title,
      model: messages.find((message) => message.model !== null)?.model ?? null,
      startedAt: null,
      updatedAt: null,
      messages,
    })
    return { sessions: [built.session], warnings: built.warnings, errors: [] }
  }
}

function readMetadata(raw: string): MarkdownMetadata {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)
  const fields = match === null ? new Map<string, string>() : parseFrontmatter(match[1] ?? "")
  return {
    threadId: fields.get("threadId") ?? null,
    cwd: fields.get("cwd") ?? null,
    title: fields.get("title") ?? null,
  }
}

function parseFrontmatter(raw: string): ReadonlyMap<string, string> {
  const fields = new Map<string, string>()
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/)
    if (match === null) {
      continue
    }
    const key = match[1] ?? ""
    if (key.length > 0) {
      fields.set(key, match[2] ?? "")
    }
  }
  return fields
}

function readSections(raw: string): readonly MarkdownSection[] {
  const sectionRegex = /^### role:\s*(\S+)\s*$/gm
  const matches = Array.from(raw.matchAll(sectionRegex))
  return matches.map((match, index) => {
    const start = match.index + match[0].length
    const next = matches[index + 1]
    const end = next === undefined ? raw.length : next.index
    return {
      role: match[1] ?? "unknown",
      body: raw.slice(start, end).trim(),
    }
  })
}

function toMessageDraft(section: MarkdownSection): MessageDraft {
  const fields = parseBodyFields(section.body)
  return {
    role: readRole(section.role),
    content: fields.get("content") ?? section.body,
    model: fields.get("model") ?? null,
    createdAt: null,
    line: null,
  }
}

function parseBodyFields(raw: string): ReadonlyMap<string, string> {
  const lines = raw.split(/\r?\n/)
  const fields = new Map<string, string>()
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ""
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/)
    if (match === null) {
      continue
    }
    const key = match[1] ?? ""
    const inlineValue = match[2] ?? ""
    fields.set(key, inlineValue.length > 0 ? inlineValue : readBlockValue(lines, index + 1))
  }
  return fields
}

function readBlockValue(lines: readonly string[], startIndex: number): string {
  return lines
    .slice(startIndex)
    .join("\n")
    .replace(/^```(?:json)?\r?\n/, "")
    .replace(/\r?\n```$/, "")
    .trim()
}
