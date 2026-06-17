import { Injectable } from "@nestjs/common"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { PrismaService } from "../database/prisma.service.js"
import type {
  MutableScanCounters,
  ScanRunRecord,
  ScanRunResponse,
  SourceConfig,
} from "./scanner.types.js"
import { ScannerConflictError, ScannerSourceNotFoundError } from "./scanner-errors.js"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { ScannerFileRunner } from "./scanner-file-runner.js"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { ScannerJobStore } from "./scanner-job-store.js"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { ScannerSourceStore } from "./scanner-source-store.js"
import { summarizeError } from "./scanner-utils.js"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { SourceReaderRegistry } from "./source-reader-registry.js"

export { ScannerConflictError } from "./scanner-errors.js"

@Injectable()
export class ScannerService {
  private readonly runningSources = new Set<string>()

  public constructor(
    private readonly prisma: PrismaService,
    private readonly sources: ScannerSourceStore,
    private readonly jobs: ScannerJobStore,
    private readonly files: ScannerFileRunner,
    private readonly readers: SourceReaderRegistry,
  ) {}

  public async runAllEnabled(): Promise<ScanRunResponse> {
    const sources = await this.sources.listEnabled()
    const records: ScanRunRecord[] = []
    for (const source of sources) {
      records.push(await this.runSourceConfig(source))
    }
    return { records }
  }

  public async runDue(now = new Date()): Promise<ScanRunResponse> {
    const sources = await this.sources.listDue(now)
    const records: ScanRunRecord[] = []
    for (const source of sources) {
      records.push(await this.runSourceConfig(source))
    }
    return { records }
  }

  public async runSource(sourceId: bigint): Promise<ScanRunRecord> {
    const source = await this.sources.findEnabled(sourceId)
    if (source === null) {
      throw new ScannerSourceNotFoundError()
    }
    return this.runSourceConfig(source)
  }

  private async runSourceConfig(source: SourceConfig): Promise<ScanRunRecord> {
    const lockKey = source.id.toString()
    if (this.runningSources.has(lockKey)) {
      throw new ScannerConflictError(source.id)
    }
    this.runningSources.add(lockKey)
    try {
      return await this.runLockedSource(source)
    } finally {
      this.runningSources.delete(lockKey)
    }
  }

  private async runLockedSource(source: SourceConfig): Promise<ScanRunRecord> {
    const scannedAt = new Date()
    const job = await this.jobs.start(source.id, scannedAt)
    const counters = createCounters()
    const errors: string[] = []

    try {
      const parserSources = await this.readers.read(source.readerType, {
        rootPath: source.rootPath,
        fileGlob: source.fileGlob,
      })
      counters.filesDiscovered = parserSources.length
      for (const parserSource of parserSources) {
        const error = await this.files.runFile({
          source,
          parserSource,
          scannedAt,
          counters,
          historyFile: this.prisma.historyFile,
        })
        if (error !== null) {
          errors.push(error)
        }
      }
    } catch (error) {
      counters.filesFailed += 1
      errors.push(summarizeError(error))
    }

    const status = errors.length === 0 ? "completed" : "failed"
    const finishedAt = new Date()
    const updated = await this.jobs.finish(
      BigInt(job.id),
      status,
      counters,
      finishedAt,
      errors.length === 0 ? null : (errors[0] ?? "Scanner failed"),
    )
    await this.jobs.touchLastScan(source.id, finishedAt)
    return updated
  }
}

function createCounters(): MutableScanCounters {
  return {
    filesDiscovered: 0,
    filesParsed: 0,
    filesFailed: 0,
    sessionsImported: 0,
    messagesImported: 0,
    chunksCreated: 0,
  }
}
