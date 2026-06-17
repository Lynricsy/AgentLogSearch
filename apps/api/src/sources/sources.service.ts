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
import { readSourceRootPath, type SourceRecord, toAgentSource } from "../sources/sources-records.js"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { PathPolicyService } from "./path-policy.service.js"
import {
  PARSER_TYPE_TO_PRISMA,
  SOURCE_PRESET_TO_PRISMA,
  SOURCE_READER_TYPE_TO_PRISMA,
} from "./source-mapping.js"

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
    return toAgentSource(record)
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

    const currentRootPath = readSourceRootPath(existing)
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
