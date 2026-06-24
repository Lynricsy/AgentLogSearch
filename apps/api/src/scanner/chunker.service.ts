import type { AgentRole } from "@agent-log-search/shared"
import { Injectable } from "@nestjs/common"
import type { ParsedMessage, ParsedSession } from "../parsers/index.js"
import { isRetainedHistoryMessage } from "./message-retention.js"
import type { SourceConfig } from "./scanner.types.js"

const MAX_MESSAGES_PER_CHUNK = 16
const MIN_MESSAGES_BEFORE_SIZE_SPLIT = 3
const OVERLAP_MESSAGES = 2
const MAX_TARGET_CHARS = 2_000
const TARGET_LONG_MESSAGE_PART_CHARS = 2_400
const MAX_LONG_MESSAGE_PART_CHARS = 3_200
const MIN_TRAILING_PART_CHARS = 600
const MISSING_CWD_LABEL = "未记录"

export type ChunkDraft = {
  readonly chunkIndex: number
  readonly startMessageSeq: number
  readonly endMessageSeq: number
  readonly agentName: string
  readonly externalThreadId: string
  readonly cwd: string | null
  readonly chunkText: string
}

@Injectable()
export class ChunkerService {
  public chunkSession(source: SourceConfig, session: ParsedSession): readonly ChunkDraft[] {
    const messages = session.messages.filter(
      (message) => isRetainedHistoryMessage(message) && message.content.trim().length > 0,
    )
    const chunks: ChunkDraft[] = []
    let start = 0

    while (start < messages.length) {
      const endExclusive = nextChunkEnd(messages, start)
      const chunkMessages = messages.slice(start, endExclusive)
      const first = chunkMessages[0]
      const last = chunkMessages[chunkMessages.length - 1]

      if (first !== undefined && last !== undefined) {
        for (const chunkText of formatChunkTexts(source, session, chunkMessages)) {
          chunks.push({
            chunkIndex: chunks.length,
            startMessageSeq: first.sequence,
            endMessageSeq: last.sequence,
            agentName: source.sourcePreset,
            externalThreadId: session.threadId,
            cwd: session.cwd,
            chunkText,
          })
        }
      }

      if (endExclusive >= messages.length) {
        break
      }

      const overlappedStart = Math.max(start + 1, endExclusive - OVERLAP_MESSAGES)
      start = nextPreferredStartInWindow(messages, overlappedStart, endExclusive)
    }

    return chunks
  }
}

function nextPreferredStartInWindow(
  messages: readonly ParsedMessage[],
  start: number,
  endExclusive: number,
): number {
  const current = messages[start]
  if (current === undefined || current.role === "user" || isLongMessage(current)) {
    return start
  }

  const nextUser = messages.findIndex(
    (message, index) => index > start && index < endExclusive && message.role === "user",
  )
  return nextUser === -1 ? start : nextUser
}

function nextChunkEnd(messages: readonly ParsedMessage[], start: number): number {
  const first = messages[start]
  if (first === undefined) {
    return start
  }
  if (isLongMessage(first)) {
    return start + 1
  }

  let bodyChars = 0
  let end = start
  while (end < messages.length && end - start < MAX_MESSAGES_PER_CHUNK) {
    const message = messages[end]
    if (message === undefined || (end > start && isLongMessage(message))) {
      break
    }

    const nextBodyChars = bodyChars + message.content.length
    const nextCount = end - start + 1
    if (nextCount > MIN_MESSAGES_BEFORE_SIZE_SPLIT && nextBodyChars > MAX_TARGET_CHARS) {
      break
    }

    bodyChars = nextBodyChars
    end += 1
  }
  return Math.max(start + 1, end)
}

function isLongMessage(message: ParsedMessage): boolean {
  return message.content.length > MAX_TARGET_CHARS
}

function formatChunkTexts(
  source: SourceConfig,
  session: ParsedSession,
  messages: readonly ParsedMessage[],
): readonly string[] {
  const header = [
    `Agent: ${source.sourcePreset}`,
    `CWD: ${session.cwd ?? MISSING_CWD_LABEL}`,
    `Thread: ${session.threadId}`,
  ]
  if (messages.length === 1) {
    const [message] = messages
    if (message !== undefined && message.content.length > MAX_LONG_MESSAGE_PART_CHARS) {
      const parts = splitLongContent(message.content)
      return parts.map((part, index) =>
        [
          ...header,
          `Part: ${index + 1}/${parts.length}`,
          "",
          `${roleLabel(message.role)}: ${part}`,
        ].join("\n"),
      )
    }
  }

  const body = messages.map((message) => `${roleLabel(message.role)}: ${message.content}`)
  return [[...header, "", ...body].join("\n")]
}

function splitLongContent(content: string): readonly string[] {
  return packTextUnits(splitTextUnits(content))
}

function splitTextUnits(content: string): readonly string[] {
  const lines = content.match(/[^\n]*\n|[^\n]+/gu) ?? []
  return lines.flatMap((line) =>
    line.length > MAX_LONG_MESSAGE_PART_CHARS ? splitOversizedUnit(line) : [line],
  )
}

function splitOversizedUnit(value: string): readonly string[] {
  const parts: string[] = []
  let remaining = value
  while (remaining.length > MAX_LONG_MESSAGE_PART_CHARS) {
    const preferredEnd = preferredSplitIndex(remaining, MAX_LONG_MESSAGE_PART_CHARS)
    const tailLength = remaining.length - preferredEnd
    const end =
      tailLength > 0 && tailLength < MIN_TRAILING_PART_CHARS
        ? Math.max(1, preferredEnd - (MIN_TRAILING_PART_CHARS - tailLength))
        : preferredEnd
    parts.push(remaining.slice(0, end))
    remaining = remaining.slice(end)
  }
  if (remaining.length > 0) {
    parts.push(remaining)
  }
  return parts
}

function preferredSplitIndex(value: string, maxLength: number): number {
  let currentLength = 0
  let lastPreferredBreak = 0

  for (const character of value) {
    const nextLength = currentLength + character.length
    if (nextLength > maxLength) {
      break
    }
    currentLength = nextLength
    if (currentLength >= TARGET_LONG_MESSAGE_PART_CHARS && isPreferredBreakCharacter(character)) {
      lastPreferredBreak = currentLength
    }
  }

  return lastPreferredBreak > 0 ? lastPreferredBreak : currentLength
}

function packTextUnits(units: readonly string[]): readonly string[] {
  const parts: string[] = []
  let current = ""

  for (const unit of units) {
    if (current.length > 0 && current.length + unit.length > MAX_LONG_MESSAGE_PART_CHARS) {
      parts.push(current)
      current = ""
    }
    current += unit
  }

  if (current.length > 0) {
    parts.push(current)
  }

  return parts
}

function isPreferredBreakCharacter(character: string): boolean {
  return /[\s,;，；。.!?！？)\]}]/u.test(character)
}

function roleLabel(role: AgentRole): string {
  switch (role) {
    case "system":
      return "System"
    case "user":
      return "User"
    case "assistant":
      return "Assistant"
    case "tool":
      return "Tool"
    case "unknown":
      return "Unknown"
  }
  const exhaustive: never = role
  return exhaustive
}
