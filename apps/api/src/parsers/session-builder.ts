import { createHash } from "node:crypto"
import type { AgentRole, ParserType } from "@agent-log-search/shared"
import { normalizeContent } from "./content-normalizer.js"
import type { ParsedMessage, ParsedSession, ParsedTraceEvent, ParseIssue } from "./parser-types.js"
import { buildMessageOnlyTrace } from "./trace-event-builders.js"

export type SessionDraft = {
  readonly parserType: ParserType
  readonly sourcePath: string
  readonly threadId: string | null
  readonly cwd: string | null
  readonly title: string | null
  readonly model: string | null
  readonly startedAt: string | null
  readonly updatedAt: string | null
  readonly messages: readonly MessageDraft[]
  readonly traceEvents?: readonly ParsedTraceEvent[]
}

export type MessageDraft = {
  readonly role: AgentRole
  readonly content: unknown
  readonly model: string | null
  readonly createdAt: string | null
  readonly line: number | null
}

export function buildSession(draft: SessionDraft): {
  readonly session: ParsedSession
  readonly warnings: readonly ParseIssue[]
} {
  const warnings: ParseIssue[] = []
  const threadId = draft.threadId ?? fallbackThreadId(draft.sourcePath)
  if (draft.threadId === null) {
    warnings.push(issue("missing_thread_id", draft.sourcePath, null, "Missing thread id"))
  }
  if (draft.cwd === null) {
    warnings.push(issue("missing_cwd", draft.sourcePath, null, "Missing cwd"))
  }

  const messages = normalizeMessages(draft, warnings)
  return {
    session: {
      parserType: draft.parserType,
      sourcePath: draft.sourcePath,
      threadId,
      cwd: draft.cwd,
      title: draft.title,
      model: draft.model,
      startedAt: draft.startedAt,
      updatedAt: draft.updatedAt,
      messages,
      traceEvents: draft.traceEvents ?? buildMessageOnlyTrace(draft.sourcePath, messages),
    },
    warnings,
  }
}

export function issue(
  code: ParseIssue["code"],
  filePath: string,
  line: number | null,
  message: string,
): ParseIssue {
  return { code, filePath, line, message }
}

export function latestCreatedAt(messages: readonly MessageDraft[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const createdAt = messages[index]?.createdAt
    if (createdAt !== undefined && createdAt !== null) {
      return createdAt
    }
  }
  return null
}

function normalizeMessages(draft: SessionDraft, warnings: ParseIssue[]): readonly ParsedMessage[] {
  const messages: ParsedMessage[] = []
  for (const message of draft.messages) {
    const content = normalizeContent(message.content)
    if (content.length === 0) {
      warnings.push(
        issue("empty_content_skipped", draft.sourcePath, message.line, "Skipped empty message"),
      )
      continue
    }
    messages.push({
      role: message.role,
      content,
      model: message.model,
      sequence: messages.length,
      createdAt: message.createdAt,
    })
  }
  return messages
}

function fallbackThreadId(filePath: string): string {
  return createHash("sha256").update(filePath).digest("hex")
}
