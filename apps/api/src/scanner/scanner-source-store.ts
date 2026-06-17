import { Injectable } from "@nestjs/common"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { PrismaService } from "../database/prisma.service.js"
import type { SourceConfig } from "./scanner.types.js"
import { mapParserType, mapReaderType, mapSourcePreset } from "./scanner-utils.js"

type SourceRecord = {
  readonly id: bigint
  readonly name: string
  readonly sourcePreset: string
  readonly parserType: string
  readonly readerType: string
  readonly rootPath: string
  readonly fileGlob: string
  readonly resumeTemplate: string
  readonly enabled: boolean
}

@Injectable()
export class ScannerSourceStore {
  public constructor(private readonly prisma: PrismaService) {}

  public async listEnabled(): Promise<readonly SourceConfig[]> {
    const records = await this.prisma.agentSource.findMany({
      where: { enabled: true },
      orderBy: { id: "asc" },
    })
    return records.map(toSourceConfig)
  }

  public async findEnabled(id: bigint): Promise<SourceConfig | null> {
    const record = await this.prisma.agentSource.findUnique({
      where: { id },
    })
    return record === null || !record.enabled ? null : toSourceConfig(record)
  }
}

function toSourceConfig(record: SourceRecord): SourceConfig {
  return {
    id: record.id,
    name: record.name,
    sourcePreset: mapSourcePreset(record.sourcePreset),
    parserType: mapParserType(record.parserType),
    readerType: mapReaderType(record.readerType),
    rootPath: record.rootPath,
    fileGlob: record.fileGlob,
    resumeTemplate: record.resumeTemplate,
  }
}
