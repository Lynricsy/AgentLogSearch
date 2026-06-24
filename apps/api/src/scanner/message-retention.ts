import type { ParsedMessage, ParsedSession } from "../parsers/index.js"

export function retainHistoryMessages(session: ParsedSession): ParsedSession {
  const messages = session.messages.filter(isRetainedHistoryMessage)
  if (messages.length === session.messages.length) {
    return session
  }

  return {
    ...session,
    messages,
    traceEvents: session.traceEvents,
    updatedAt: latestMessageCreatedAt(messages) ?? session.updatedAt,
  }
}

export function isRetainedHistoryMessage(message: ParsedMessage): boolean {
  return message.role !== "tool"
}

function latestMessageCreatedAt(messages: readonly ParsedMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const createdAt = messages[index]?.createdAt
    if (createdAt !== undefined && createdAt !== null) {
      return createdAt
    }
  }
  return null
}
