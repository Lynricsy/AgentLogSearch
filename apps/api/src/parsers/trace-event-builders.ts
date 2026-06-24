import { createHash } from "node:crypto"
import { normalizeContent } from "./content-normalizer.js"
import type {
  ParsedAssistantMessageEvent,
  ParsedMessage,
  ParsedSystemEvent,
  ParsedToolCallEvent,
  ParsedToolResultEvent,
  ParsedTraceEvent,
  ParsedTraceRawPointer,
  ParsedUserMessageEvent,
} from "./parser-types.js"

export function jsonlEventKey(input: {
  readonly parser: string
  readonly lineNumber: number
  readonly blockIndex: number
  readonly kind: string
  readonly callId?: string
}): string {
  const identity = input.callId ?? `${input.kind}-${input.blockIndex.toString()}`
  return `${input.parser}:line:${input.lineNumber.toString()}:block:${input.blockIndex.toString()}:${identity}`
}

export function buildMessageOnlyTrace(
  sourcePath: string,
  messages: readonly ParsedMessage[],
): readonly ParsedTraceEvent[] {
  const events: ParsedTraceEvent[] = []
  for (const message of messages) {
    const rawPointer = jsonlRawPointer(sourcePath, message.sequence + 1)
    const occurredAt = parseOptionalDate(message.createdAt)
    switch (message.role) {
      case "user":
        events.push(
          buildUserMessageEvent(
            withOptionalOccurredAt(
              {
                sourceEventKey: `message:${message.sequence.toString()}:user`,
                sequence: message.sequence,
                subSequence: 0,
                rawPointer,
                text: message.content,
              },
              occurredAt,
            ),
          ),
        )
        break
      case "assistant":
        events.push(
          buildAssistantMessageEvent(
            withOptionalOccurredAt(
              {
                sourceEventKey: `message:${message.sequence.toString()}:assistant`,
                sequence: message.sequence,
                subSequence: 0,
                rawPointer,
                text: message.content,
              },
              occurredAt,
            ),
          ),
        )
        break
      case "system":
        events.push(
          buildSystemEvent(
            withOptionalOccurredAt(
              {
                sourceEventKey: `message:${message.sequence.toString()}:system`,
                sequence: message.sequence,
                subSequence: 0,
                rawPointer,
                text: message.content,
              },
              occurredAt,
            ),
          ),
        )
        break
      default:
        break
    }
  }
  return events
}

export function buildUserMessageEvent(
  input: Omit<ParsedUserMessageEvent, "kind">,
): ParsedUserMessageEvent {
  return { ...input, kind: "user_message" }
}

export function buildAssistantMessageEvent(
  input: Omit<ParsedAssistantMessageEvent, "kind">,
): ParsedAssistantMessageEvent {
  return { ...input, kind: "assistant_message" }
}

export function buildSystemEvent(input: Omit<ParsedSystemEvent, "kind">): ParsedSystemEvent {
  return { ...input, kind: "system" }
}

export function buildToolCallEvent(input: Omit<ParsedToolCallEvent, "kind">): ParsedToolCallEvent {
  return { ...input, kind: "tool_call" }
}

export function buildToolResultEvent(
  input: Omit<ParsedToolResultEvent, "kind">,
): ParsedToolResultEvent {
  return { ...input, kind: "tool_result" }
}

export function jsonlRawPointer(
  sourcePath: string,
  lineNumber: number,
  jsonPath?: string,
): ParsedTraceRawPointer {
  return jsonPath === undefined ? { sourcePath, lineNumber } : { sourcePath, lineNumber, jsonPath }
}

export function parseOptionalDate(value: string | null | undefined): Date | undefined {
  if (value === null || value === undefined) {
    return undefined
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

export function withOptionalOccurredAt<T extends object>(
  input: T,
  occurredAt: Date | undefined,
): T & { readonly occurredAt?: Date } {
  return occurredAt === undefined ? input : { ...input, occurredAt }
}

export function hashEventContent(value: unknown): string {
  return createHash("sha256").update(normalizeContent(value)).digest("hex")
}
