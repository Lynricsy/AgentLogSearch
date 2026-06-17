import type { ParserType, SourcePreset, SourceReaderType } from "@agent-log-search/shared"
import {
  PRISMA_PARSER_TYPE_TO_API,
  PRISMA_SOURCE_PRESET_TO_API,
  PRISMA_SOURCE_READER_TYPE_TO_API,
} from "../sources/source-mapping.js"

export function truncateErrorMessage(message: string): string {
  if (message.length <= ERROR_MESSAGE_MAX_LENGTH) {
    return message
  }
  return `${message.slice(0, ERROR_MESSAGE_MAX_LENGTH)}...`
}

export function summarizeError(error: unknown): string {
  if (error instanceof Error) {
    return truncateErrorMessage(error.message)
  }
  const message = readObjectString(error, "message")
  if (message !== null) {
    return truncateErrorMessage(message)
  }
  const name = readObjectString(error, "name")
  if (name !== null) {
    return truncateErrorMessage(name)
  }
  return "Unknown scanner error"
}

export function toNullableDate(value: string | null): Date | null {
  return value === null ? null : new Date(value)
}

export function mapParserType(value: string): ParserType {
  const mapped = mapKnownValue(PRISMA_PARSER_TYPE_TO_API, value)
  if (mapped !== undefined) {
    return mapped
  }
  return parseDirectParserType(value)
}

export function mapReaderType(value: string): SourceReaderType {
  const mapped = mapKnownValue(PRISMA_SOURCE_READER_TYPE_TO_API, value)
  if (mapped !== undefined) {
    return mapped
  }
  return parseDirectReaderType(value)
}

export function mapSourcePreset(value: string): SourcePreset {
  const mapped = mapKnownValue(PRISMA_SOURCE_PRESET_TO_API, value)
  if (mapped !== undefined) {
    return mapped
  }
  return parseDirectSourcePreset(value)
}

function parseDirectParserType(value: string): ParserType {
  if (
    value === "codex-jsonl" ||
    value === "claude-jsonl" ||
    value === "pi-jsonl" ||
    value === "opencode-sqlite" ||
    value === "generic-jsonl" ||
    value === "generic-json" ||
    value === "generic-markdown"
  ) {
    return value
  }
  throw new InvalidScannerRecordError("parserType")
}

function parseDirectReaderType(value: string): SourceReaderType {
  if (value === "file-glob" || value === "sqlite") {
    return value
  }
  throw new InvalidScannerRecordError("readerType")
}

function parseDirectSourcePreset(value: string): SourcePreset {
  if (
    value === "codex" ||
    value === "claude-code" ||
    value === "pi-agent" ||
    value === "opencode" ||
    value === "generic"
  ) {
    return value
  }
  throw new InvalidScannerRecordError("sourcePreset")
}

class InvalidScannerRecordError extends Error {
  public readonly name = "InvalidScannerRecordError"

  public constructor(public readonly field: string) {
    super(`Invalid scanner record field: ${field}`)
  }
}

function mapKnownValue<T extends string>(
  mapping: Readonly<Record<string, T>>,
  value: string,
): T | undefined {
  return mapping[value]
}

function readObjectString(value: unknown, field: string): string | null {
  if (typeof value !== "object" || value === null) {
    return null
  }
  if (!Object.hasOwn(value, field)) {
    return null
  }
  const fieldValue = Reflect.get(value, field)
  return typeof fieldValue === "string" && fieldValue.length > 0 ? fieldValue : null
}

const ERROR_MESSAGE_MAX_LENGTH = 200
