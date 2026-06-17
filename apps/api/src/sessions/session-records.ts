import type { AgentMessage, AgentSessionDetail } from "@agent-log-search/shared"
import {
  mapRecordValue,
  readBigIntLike,
  readDate,
  readNullableBigIntLike,
  readNullableDate,
  readNullableString,
  readNumber,
  readString,
} from "../scan-jobs/record-readers.js"

type SessionRecord = Readonly<Record<string, unknown>> & {
  readonly messages?: unknown
}

const PRISMA_ROLE_TO_API = {
  assistant: "assistant",
  system: "system",
  tool: "tool",
  unknown: "unknown",
  user: "user",
} as const satisfies Record<string, AgentMessage["role"]>

export function toSessionDetail(record: SessionRecord): AgentSessionDetail {
  const rawMessages = record.messages
  if (!Array.isArray(rawMessages)) {
    throw new InvalidSessionRecordError("messages")
  }
  return {
    agentName: readString(record, "agentName"),
    cwd: readNullableString(record, "cwd"),
    externalThreadId: readString(record, "externalThreadId"),
    historyFileId: readNullableBigIntLike(record, "historyFileId"),
    id: readBigIntLike(record, "id"),
    lastMessageAt: readNullableDate(record, "lastMessageAt"),
    messageCount: readNumber(record, "messageCount"),
    messages: rawMessages.map(toAgentMessage),
    resumeCommand: readNullableString(record, "resumeCommand"),
    sourceId: readBigIntLike(record, "sourceId"),
    startedAt: readNullableDate(record, "startedAt"),
    title: readNullableString(record, "title"),
    updatedAt: readDate(record, "updatedAt"),
  }
}

function toAgentMessage(record: SessionRecord): AgentMessage {
  return {
    content: readString(record, "content"),
    createdAt: readNullableDate(record, "createdAt"),
    id: readBigIntLike(record, "id"),
    model: readNullableString(record, "model"),
    role: mapRecordValue(PRISMA_ROLE_TO_API, readString(record, "role"), "role"),
    seqNo: readNumber(record, "seqNo"),
    sessionId: readBigIntLike(record, "sessionId"),
  }
}

class InvalidSessionRecordError extends Error {
  public readonly name = "InvalidSessionRecordError"

  public constructor(public readonly field: string) {
    super(`Invalid session record field: ${field}`)
  }
}
