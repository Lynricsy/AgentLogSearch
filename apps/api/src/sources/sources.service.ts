import {
  type AgentSource,
  type CreateSourceRequest,
  SOURCE_PRESET_METADATA,
  type SourcePresetMetadata,
  type UpdateSourceRequest,
} from "@agent-log-search/shared"
import { Injectable, NotFoundException } from "@nestjs/common"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { PrismaService } from "../database/prisma.service.js"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { PathPolicyService } from "./path-policy.service.js"
import {
  PARSER_TYPE_TO_PRISMA,
  PRISMA_PARSER_TYPE_TO_API,
  PRISMA_SOURCE_PRESET_TO_API,
  PRISMA_SOURCE_READER_TYPE_TO_API,
  SOURCE_PRESET_TO_PRISMA,
  SOURCE_READER_TYPE_TO_PRISMA,
} from "./source-mapping.js"

type SourceRecord = Readonly<Record<string, unknown>>

@Injectable()
export class SourcesService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly pathPolicy: PathPolicyService,
  ) {}

  public async list(): Promise<readonly AgentSource[]> {
    const records = await this.prisma.agentSource.findMany({
      orderBy: {
        createdAt: "desc",
      },
    })
    return records.map((record) => this.toAgentSource(record))
  }

  public listPresets(): readonly SourcePresetMetadata[] {
    return SOURCE_PRESET_METADATA
  }

  public async create(input: CreateSourceRequest): Promise<AgentSource> {
    const { rootPath } = await this.pathPolicy.normalizeRoot({
      rootPath: input.rootPath,
      followSymlinks: input.followSymlinks,
    })

    const record = await this.prisma.agentSource.create({
      data: {
        name: input.name,
        sourcePreset: SOURCE_PRESET_TO_PRISMA[input.sourcePreset],
        parserType: PARSER_TYPE_TO_PRISMA[input.parserType],
        readerType: SOURCE_READER_TYPE_TO_PRISMA[input.readerType],
        rootPath,
        fileGlob: input.fileGlob,
        resumeTemplate: input.resumeTemplate,
        enabled: input.enabled,
        scanIntervalSeconds: input.scanIntervalSeconds,
      },
    })

    return this.toAgentSource(record)
  }

  public async update(id: string, input: UpdateSourceRequest): Promise<AgentSource> {
    const sourceId = parseSourceId(id)
    const existing = await this.findExisting(sourceId)
    const rootPath = await this.resolveUpdatedRoot(existing, input)

    const record = await this.prisma.agentSource.update({
      where: {
        id: sourceId,
      },
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.sourcePreset === undefined
          ? {}
          : { sourcePreset: SOURCE_PRESET_TO_PRISMA[input.sourcePreset] }),
        ...(input.parserType === undefined
          ? {}
          : { parserType: PARSER_TYPE_TO_PRISMA[input.parserType] }),
        ...(input.readerType === undefined
          ? {}
          : { readerType: SOURCE_READER_TYPE_TO_PRISMA[input.readerType] }),
        ...(rootPath === undefined ? {} : { rootPath }),
        ...(input.fileGlob === undefined ? {} : { fileGlob: input.fileGlob }),
        ...(input.resumeTemplate === undefined ? {} : { resumeTemplate: input.resumeTemplate }),
        ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
        ...(input.scanIntervalSeconds === undefined
          ? {}
          : { scanIntervalSeconds: input.scanIntervalSeconds }),
      },
    })

    return this.toAgentSource(record)
  }

  public async delete(id: string): Promise<void> {
    const sourceId = parseSourceId(id)
    await this.findExisting(sourceId)
    await this.prisma.agentSource.delete({
      where: {
        id: sourceId,
      },
    })
  }

  public toAgentSource(record: SourceRecord): AgentSource {
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

  private async findExisting(id: bigint): Promise<SourceRecord> {
    const existing = await this.prisma.agentSource.findUnique({
      where: {
        id,
      },
    })
    if (existing === null) {
      throw new NotFoundException({
        error: {
          code: "source_not_found",
          message: "Source not found",
        },
      })
    }
    return existing
  }

  private async resolveUpdatedRoot(
    existing: SourceRecord,
    input: UpdateSourceRequest,
  ): Promise<string | undefined> {
    if (input.rootPath === undefined && input.followSymlinks === undefined) {
      return undefined
    }

    const currentRootPath = readString(existing, "rootPath")
    const normalized = await this.pathPolicy.normalizeRoot(
      input.followSymlinks === undefined
        ? { rootPath: input.rootPath ?? currentRootPath }
        : { rootPath: input.rootPath ?? currentRootPath, followSymlinks: input.followSymlinks },
    )
    return normalized.rootPath
  }
}

function parseSourceId(id: string): bigint {
  if (!/^[1-9]\d*$/.test(id)) {
    throw new NotFoundException({
      error: {
        code: "source_not_found",
        message: "Source not found",
      },
    })
  }

  return BigInt(id)
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
