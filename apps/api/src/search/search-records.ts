import type {
  AgentMessagePart,
  AgentRole,
  SemanticSearchResponse,
  SemanticSearchResult,
} from "@agent-log-search/shared"
import { splitAgentMessageParts } from "../messages/message-parts.js"

export type SemanticSearchChunkHit = {
  readonly sessionId: string
  readonly chunkId: string
  readonly score: number
  readonly snippet: string
  readonly messageStartSequence: number | null
  readonly messageEndSequence: number | null
  readonly agentName: string
  readonly cwd: string | null
  readonly threadId: string
  readonly title: string | null
  readonly resumeCommand: string
  readonly messageCount: number
  readonly lastMessageAt: string | null
  readonly messages: readonly SemanticSearchHitMessage[]
}

export type SemanticSearchHitMessage = {
  readonly id: string
  readonly seqNo: number
  readonly role: AgentRole
  readonly content: string
  readonly model: string | null
  readonly createdAt: string | null
}

type StructuredSearchMessage = {
  readonly id: string
  readonly seqNo: number
  readonly role: AgentRole
  readonly model: string | null
  readonly createdAt: string | null
  readonly parts: readonly AgentMessagePart[]
}

const MAX_MATCHED_CHUNKS_PER_SESSION = 3

type SessionAccumulator = Omit<SemanticSearchResult, "matchedChunks"> & {
  readonly matchedChunks: SemanticSearchResult["matchedChunks"]
}

export function aggregateSemanticHits(
  hits: readonly SemanticSearchChunkHit[],
  sessionLimit: number,
): SemanticSearchResponse {
  const sessions = new Map<string, SessionAccumulator>()

  for (const hit of hits) {
    const previous = sessions.get(hit.sessionId)
    const nextChunks = [...(previous?.matchedChunks ?? []), toMatchedChunk(hit)]
      .sort(compareMatchedChunks)
      .slice(0, MAX_MATCHED_CHUNKS_PER_SESSION)
    sessions.set(hit.sessionId, {
      agentName: hit.agentName,
      cwd: hit.cwd,
      lastMessageAt: hit.lastMessageAt,
      matchedChunks: nextChunks,
      messageCount: hit.messageCount,
      resumeCommand: hit.resumeCommand,
      score: Math.max(previous?.score ?? 0, hit.score),
      sessionId: hit.sessionId,
      threadId: hit.threadId,
      title: hit.title,
    })
  }

  return {
    records: [...sessions.values()].sort(compareSessions).slice(0, sessionLimit),
  }
}

function toMatchedChunk(
  hit: SemanticSearchChunkHit,
): SemanticSearchResult["matchedChunks"][number] {
  return {
    chunkId: hit.chunkId,
    messageEndSequence: hit.messageEndSequence,
    messageStartSequence: hit.messageStartSequence,
    messages: hit.messages.map(toStructuredMessage),
    metadata: {
      agentName: hit.agentName,
      cwd: hit.cwd,
      part: readChunkPart(hit.snippet),
      threadId: hit.threadId,
    },
    score: hit.score,
    snippet: hit.snippet,
  }
}

function toStructuredMessage(message: SemanticSearchHitMessage): StructuredSearchMessage {
  return {
    createdAt: message.createdAt,
    id: message.id,
    model: message.model,
    parts: splitAgentMessageParts(message),
    role: message.role,
    seqNo: message.seqNo,
  }
}

function readChunkPart(snippet: string): string | null {
  const match = /^Part:\s*(.+)$/mu.exec(snippet)
  return match?.[1]?.trim() ?? null
}

function compareMatchedChunks(
  left: SemanticSearchResult["matchedChunks"][number],
  right: SemanticSearchResult["matchedChunks"][number],
): number {
  return right.score - left.score || compareText(left.chunkId, right.chunkId)
}

function compareSessions(left: SemanticSearchResult, right: SemanticSearchResult): number {
  return (
    right.score - left.score ||
    compareNullableDateDesc(left.lastMessageAt, right.lastMessageAt) ||
    compareText(left.sessionId, right.sessionId)
  )
}

function compareNullableDateDesc(left: string | null, right: string | null): number {
  if (left === right) {
    return 0
  }
  if (left === null) {
    return 1
  }
  if (right === null) {
    return -1
  }
  return right.localeCompare(left)
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right)
}
