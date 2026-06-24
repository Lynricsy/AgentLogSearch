import type { AgentMessagePart, AgentRole } from "@agent-log-search/shared"

export type MessagePartInput = {
  readonly content: string
  readonly role: AgentRole
}

const ROLE_LABELS: Record<AgentRole, string> = {
  assistant: "Agent 回复",
  system: "系统",
  tool: "工具结果",
  unknown: "未知",
  user: "用户",
}

const METADATA_FIELD_PATTERN = /^([A-Za-z][A-Za-z0-9_]*)(?:=|:)(.*)$/u
const THINKING_CONTENT_FIELD_NAMES = new Set(["thinking"])
const THINKING_SIGNATURE_FIELD_NAMES = new Set(["thinkingSignature", "thinking_signature"])
const TOOL_FIELD_NAMES = new Set([
  "arguments",
  "call_id",
  "cmd",
  "command",
  "execution",
  "id",
  "input",
  "name",
  "search",
  "status",
  "tool",
  "tool_call",
  "toolCall",
  "tool_call_id",
  "workdir",
])
const TEXT_FIELD_NAMES = new Set(["content", "message", "output", "response", "stdout", "text"])
const TOOL_ARGUMENT_FIELD_NAMES = new Set([
  "autoResolutionMs",
  "body",
  "button",
  "code",
  "contentType",
  "data",
  "depth",
  "duration",
  "element",
  "endTarget",
  "exclude_paths",
  "file",
  "filename",
  "fullPage",
  "height",
  "identifier",
  "include_sources",
  "index",
  "language",
  "limit",
  "maxDepth",
  "maxFiles",
  "max_results",
  "max_turns",
  "max_output_tokens",
  "offset",
  "pageno",
  "path",
  "paths",
  "platform",
  "projectPath",
  "project_path",
  "prompt",
  "query",
  "question",
  "selector",
  "session_id",
  "target",
  "textGone",
  "time",
  "timeout",
  "title",
  "tree_depth",
  "url",
  "values",
  "width",
  "yield_time_ms",
])
const TOOL_TEXT_ARGUMENT_FIELD_NAMES = new Set(["content", "text"])

type ParsedMessagePart = AgentMessagePart & {
  readonly acceptsContinuation: boolean
  readonly fieldKey?: string
  readonly rawText?: string
  readonly source: "field" | "plain"
}

export function splitAgentMessageParts(message: MessagePartInput): readonly AgentMessagePart[] {
  const parts = splitContentParts(message.role, message.content)
  const deduped = removeStructuredEchoParts(
    mergeToolPreludeParts(parts.filter((part) => part.text.trim().length > 0)),
  ).map(stripParsedMetadata)
  const merged = mergeAdjacentParts(deduped)
  if (merged.length > 0) {
    return merged
  }
  return [
    {
      kind: defaultPartKind(message.role),
      label: ROLE_LABELS[message.role],
      text: message.content,
    },
  ]
}

function splitContentParts(role: AgentRole, content: string): readonly ParsedMessagePart[] {
  const parts: ParsedMessagePart[] = []
  let currentContinuationIndex: number | null = null

  for (const line of content.split(/\r?\n/u)) {
    const continuationPart =
      currentContinuationIndex === null ? null : (parts[currentContinuationIndex] ?? null)
    const fieldPart = splitLinePart(role, line, continuationPart)
    if (fieldPart !== null) {
      parts.push(fieldPart)
      currentContinuationIndex = fieldPart.acceptsContinuation ? parts.length - 1 : null
      continue
    }

    if (currentContinuationIndex !== null) {
      const current = parts[currentContinuationIndex]
      if (current !== undefined) {
        parts[currentContinuationIndex] = {
          ...current,
          text: `${current.text}\n${line}`,
        }
        continue
      }
      currentContinuationIndex = null
    }

    parts.push({
      acceptsContinuation: true,
      kind: defaultPartKind(role),
      label: ROLE_LABELS[role],
      source: "plain",
      text: line,
    })
    currentContinuationIndex = parts.length - 1
  }

  return parts
}

function splitLinePart(
  role: AgentRole,
  line: string,
  continuationPart: ParsedMessagePart | null,
): ParsedMessagePart | null {
  const match = METADATA_FIELD_PATTERN.exec(line)
  if (match === null) {
    return null
  }

  const key = match[1] ?? ""
  const value = match[2] ?? ""
  const rawText = `${key}=${value}`.trim()
  if (continuationPart?.kind === "tool_call") {
    if (THINKING_SIGNATURE_FIELD_NAMES.has(key)) {
      return {
        acceptsContinuation: false,
        fieldKey: key,
        kind: "metadata",
        label: "思考签名",
        rawText,
        source: "field",
        text: rawText,
      }
    }
    return {
      acceptsContinuation: true,
      fieldKey: key,
      kind: "tool_call",
      label: "工具调用",
      rawText,
      source: "field",
      text: rawText,
    }
  }

  if (THINKING_CONTENT_FIELD_NAMES.has(key)) {
    return {
      acceptsContinuation: true,
      fieldKey: key,
      kind: "thinking",
      label: "思考",
      rawText,
      source: "field",
      text: value.trim(),
    }
  }
  if (THINKING_SIGNATURE_FIELD_NAMES.has(key)) {
    return {
      acceptsContinuation: false,
      fieldKey: key,
      kind: "metadata",
      label: "思考签名",
      rawText,
      source: "field",
      text: rawText,
    }
  }
  if (TEXT_FIELD_NAMES.has(key)) {
    return {
      acceptsContinuation: true,
      fieldKey: key,
      kind: textPartKind(role),
      label: ROLE_LABELS[role],
      rawText,
      source: "field",
      text: value.trim(),
    }
  }
  if (TOOL_FIELD_NAMES.has(key)) {
    return {
      acceptsContinuation: true,
      fieldKey: key,
      kind: "tool_call",
      label: "工具调用",
      rawText,
      source: "field",
      text: rawText,
    }
  }
  if (TOOL_ARGUMENT_FIELD_NAMES.has(key)) {
    return {
      acceptsContinuation: false,
      fieldKey: key,
      kind: textPartKind(role),
      label: ROLE_LABELS[role],
      rawText,
      source: "field",
      text: rawText,
    }
  }
  return null
}

function mergeToolPreludeParts(parts: readonly ParsedMessagePart[]): readonly ParsedMessagePart[] {
  const merged: ParsedMessagePart[] = []
  let preludeParts: ParsedMessagePart[] = []

  for (const part of parts) {
    if (isToolPreludePart(part)) {
      preludeParts = [...preludeParts, part]
      continue
    }

    if (part.kind === "tool_call" && preludeParts.length > 0 && canMergeToolPrelude(preludeParts)) {
      const previous = merged.at(-1)
      if (previous !== undefined && isEchoedToolText(previous, preludeParts)) {
        merged.pop()
      }
      merged.push({
        ...part,
        text: `${preludeParts.map(readToolPreludeText).join("\n")}\n${part.text}`,
      })
      preludeParts = []
      continue
    }

    merged.push(...preludeParts, part)
    preludeParts = []
  }

  return [...merged, ...preludeParts]
}

function isToolPreludePart(part: ParsedMessagePart): boolean {
  if (part.kind !== "assistant_response" && part.kind !== "text") {
    return false
  }
  if (part.fieldKey !== undefined) {
    return (
      TOOL_ARGUMENT_FIELD_NAMES.has(part.fieldKey) ||
      TOOL_TEXT_ARGUMENT_FIELD_NAMES.has(part.fieldKey)
    )
  }
  const lines = part.text.split(/\r?\n/u).filter((line) => line.trim().length > 0)
  if (lines.length === 0) {
    return false
  }
  return lines.every((line) => {
    const key = readStructuredFieldKey(line)
    return (
      key !== null &&
      (TOOL_ARGUMENT_FIELD_NAMES.has(key) || TOOL_TEXT_ARGUMENT_FIELD_NAMES.has(key))
    )
  })
}

function canMergeToolPrelude(parts: readonly ParsedMessagePart[]): boolean {
  return parts.some(hasNonTextToolArgument)
}

function hasNonTextToolArgument(part: ParsedMessagePart): boolean {
  if (part.fieldKey !== undefined) {
    return TOOL_ARGUMENT_FIELD_NAMES.has(part.fieldKey)
  }
  return part.text
    .split(/\r?\n/u)
    .some((line) => TOOL_ARGUMENT_FIELD_NAMES.has(readStructuredFieldKey(line) ?? ""))
}

function isEchoedToolText(
  previous: ParsedMessagePart,
  preludeParts: readonly ParsedMessagePart[],
): boolean {
  if (previous.kind !== "assistant_response" && previous.kind !== "text") {
    return false
  }
  const previousText = normalizeEchoText(previous.text)
  return preludeParts.some((part) => {
    const textValue = readToolTextArgumentValue(part)
    return textValue !== null && normalizeEchoText(textValue) === previousText
  })
}

function readToolTextArgumentValue(part: ParsedMessagePart): string | null {
  if (part.fieldKey !== undefined && TOOL_TEXT_ARGUMENT_FIELD_NAMES.has(part.fieldKey)) {
    return part.text
  }
  for (const line of part.text.split(/\r?\n/u)) {
    const match = METADATA_FIELD_PATTERN.exec(line)
    if (match !== null && TOOL_TEXT_ARGUMENT_FIELD_NAMES.has(match[1] ?? "")) {
      return (match[2] ?? "").trim()
    }
  }
  return null
}

function readStructuredFieldKey(line: string): string | null {
  const match = METADATA_FIELD_PATTERN.exec(line)
  return match?.[1] ?? null
}

function readToolPreludeText(part: ParsedMessagePart): string {
  if (part.rawText !== undefined && TOOL_TEXT_ARGUMENT_FIELD_NAMES.has(part.fieldKey ?? "")) {
    return `${part.fieldKey}=${part.text}`
  }
  return part.rawText ?? part.text
}

function removeStructuredEchoParts(
  parts: readonly ParsedMessagePart[],
): readonly ParsedMessagePart[] {
  const deduped: ParsedMessagePart[] = []
  for (const part of parts) {
    const previous = deduped.at(-1)
    if (previous !== undefined && isStructuredEcho(previous, part)) {
      continue
    }
    deduped.push(part)
  }
  return deduped
}

function isStructuredEcho(left: ParsedMessagePart, right: ParsedMessagePart): boolean {
  if (left.kind !== right.kind || left.label !== right.label) {
    return false
  }
  if (left.source === right.source) {
    return false
  }
  const leftText = normalizeEchoText(left.text)
  const rightText = normalizeEchoText(right.text)
  return leftText === rightText || leftText.startsWith(rightText)
}

function normalizeEchoText(text: string): string {
  return text.trim().replace(/\s+/gu, " ")
}

function stripParsedMetadata(part: ParsedMessagePart): AgentMessagePart {
  return {
    kind: part.kind,
    label: part.label,
    text: part.text,
  }
}

function mergeAdjacentParts(parts: readonly AgentMessagePart[]): readonly AgentMessagePart[] {
  const merged: AgentMessagePart[] = []
  for (const part of parts) {
    const previous = merged.at(-1)
    if (previous !== undefined && previous.kind === part.kind && previous.label === part.label) {
      merged[merged.length - 1] = {
        ...previous,
        text: `${previous.text}\n${part.text}`,
      }
      continue
    }
    merged.push(part)
  }
  return merged
}

function defaultPartKind(role: AgentRole): AgentMessagePart["kind"] {
  if (role === "assistant") return "assistant_response"
  if (role === "user" || role === "system") return "text"
  if (role === "tool") return "tool_call"
  return "unknown"
}

function textPartKind(role: AgentRole): AgentMessagePart["kind"] {
  if (role === "assistant") return "assistant_response"
  return defaultPartKind(role)
}
