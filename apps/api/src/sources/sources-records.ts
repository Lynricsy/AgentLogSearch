import type { AgentSource } from "@agent-log-search/shared"
import {
  PRISMA_PARSER_TYPE_TO_API,
  PRISMA_SOURCE_PRESET_TO_API,
  PRISMA_SOURCE_READER_TYPE_TO_API,
} from "./source-mapping.js"

export type SourceRecord = Readonly<Record<string, unknown>>

export function toAgentSource(record: SourceRecord): AgentSource {
  return {
    id: readBigIntLike(record, "id"),
    name: readString(record, "name"),
    sourcePreset: mapPrismaValue(
      PRISMA_SOURCE_PRESET_TO_API,
      readString(record, "sourcePreset"),
      "sourcePreset",
    ),
    parserType: mapPrismaValue(
      PRISMA_PARSER_TYPE_TO_API,
      readString(record, "parserType"),
      "parserType",
    ),
    readerType: mapPrismaValue(
      PRISMA_SOURCE_READER_TYPE_TO_API,
      readString(record, "readerType"),
      "readerType",
    ),
    rootPath: readString(record, "rootPath"),
    fileGlob: readString(record, "fileGlob"),
    resumeTemplate: readString(record, "resumeTemplate"),
    enabled: readBoolean(record, "enabled"),
    scanIntervalSeconds: readNumber(record, "scanIntervalSeconds"),
    lastScanAt: readNullableDate(record, "lastScanAt"),
    createdAt: readDate(record, "createdAt"),
    updatedAt: readDate(record, "updatedAt"),
  }
}

export function readSourceRootPath(record: SourceRecord): string {
  return readString(record, "rootPath")
}

function readBigIntLike(record: SourceRecord, field: string): string {
  const value = record[field]
  if (typeof value === "bigint") {
    return value.toString()
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    return value.toString()
  }
  if (typeof value === "string" && value.length > 0) {
    return value
  }
  throw new InvalidSourceRecordError(field)
}

function readString(record: SourceRecord, field: string): string {
  const value = record[field]
  if (typeof value === "string") {
    return value
  }
  throw new InvalidSourceRecordError(field)
}

function readBoolean(record: SourceRecord, field: string): boolean {
  const value = record[field]
  if (typeof value === "boolean") {
    return value
  }
  throw new InvalidSourceRecordError(field)
}

function readNumber(record: SourceRecord, field: string): number {
  const value = record[field]
  if (typeof value === "number") {
    return value
  }
  throw new InvalidSourceRecordError(field)
}

function readDate(record: SourceRecord, field: string): string {
  const value = record[field]
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (typeof value === "string") {
    return value
  }
  throw new InvalidSourceRecordError(field)
}

function readNullableDate(record: SourceRecord, field: string): string | null {
  const value = record[field]
  if (value === null) {
    return null
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (typeof value === "string") {
    return value
  }
  throw new InvalidSourceRecordError(field)
}

function mapPrismaValue<T extends string>(
  mapping: Readonly<Record<string, T>>,
  value: string,
  field: string,
): T {
  const mapped = mapping[value]
  if (mapped === undefined) {
    throw new InvalidSourceRecordError(field)
  }
  return mapped
}

class InvalidSourceRecordError extends Error {
  public readonly name = "InvalidSourceRecordError"

  public constructor(public readonly field: string) {
    super(`Invalid source record field: ${field}`)
  }
}
