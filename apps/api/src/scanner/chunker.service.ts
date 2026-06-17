import type { AgentRole } from "@agent-log-search/shared"
import { Injectable } from "@nestjs/common"
import type { ParsedMessage, ParsedSession } from "../parsers/index.js"
import type { SourceConfig } from "./scanner.types.js"

const MAX_MESSAGES_PER_CHUNK = 8
const MIN_MESSAGES_BEFORE_SIZE_SPLIT = 3
const OVERLAP_MESSAGES = 2
const MAX_TARGET_CHARS = 1_200
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
    const messages = session.messages.filter((message) => message.content.trim().length > 0)
    const chunks: ChunkDraft[] = []
    let start = 0

    while (start < messages.length) {
      const endExclusive = nextChunkEnd(messages, start)
      const chunkMessages = messages.slice(start, endExclusive)
      const first = chunkMessages[0]
      const last = chunkMessages[chunkMessages.length - 1]

      if (first !== undefined && last !== undefined) {
        chunks.push({
          chunkIndex: chunks.length,
          startMessageSeq: first.sequence,
          endMessageSeq: last.sequence,
          agentName: source.sourcePreset,
          externalThreadId: session.threadId,
          cwd: session.cwd,
          chunkText: formatChunkText(source, session, chunkMessages),
        })
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

function formatChunkText(
  source: SourceConfig,
  session: ParsedSession,
  messages: readonly ParsedMessage[],
): string {
  const header = [
    `Agent: ${source.sourcePreset}`,
    `CWD: ${session.cwd ?? MISSING_CWD_LABEL}`,
    `Thread: ${session.threadId}`,
  ]
  const body = messages.map((message) => `${roleLabel(message.role)}: ${message.content}`)
  return [...header, "", ...body].join("\n")
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
