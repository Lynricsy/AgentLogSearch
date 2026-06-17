import { Injectable } from "@nestjs/common"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { PrismaService } from "../database/prisma.service.js"
import type { MutableScanCounters, ScanRunRecord } from "./scanner.types.js"
import { toScanRunRecord } from "./scanner-records.js"
import { summarizeError, truncateErrorMessage } from "./scanner-utils.js"

@Injectable()
export class ScannerJobStore {
  public constructor(private readonly prisma: PrismaService) {}

  public async start(sourceId: bigint, startedAt: Date): Promise<ScanRunRecord> {
    const record = await this.prisma.scanJob.create({
      data: {
        sourceId,
        status: "running",
        filesDiscovered: 0,
        filesParsed: 0,
        filesFailed: 0,
        sessionsImported: 0,
        messagesImported: 0,
        chunksCreated: 0,
        errorMessage: null,
        startedAt,
        finishedAt: null,
      },
    })
    return toScanRunRecord(record)
  }

  public async finish(
    jobId: bigint,
    status: "completed" | "failed",
    counters: MutableScanCounters,
    finishedAt: Date,
    error: string | null,
  ): Promise<ScanRunRecord> {
    const record = await this.prisma.scanJob.update({
      where: { id: jobId },
      data: {
        status,
        filesDiscovered: counters.filesDiscovered,
        filesParsed: counters.filesParsed,
        filesFailed: counters.filesFailed,
        sessionsImported: counters.sessionsImported,
        messagesImported: counters.messagesImported,
        chunksCreated: counters.chunksCreated,
        errorMessage: error === null ? null : truncateErrorMessage(error),
        finishedAt,
      },
    })
    return toScanRunRecord(record)
  }

  public async markFileFailed(
    sourceId: bigint,
    filePath: string,
    error: unknown,
    scannedAt: Date,
  ): Promise<void> {
    await this.prisma.historyFile.upsert({
      where: { sourceId_filePath: { sourceId, filePath } },
      create: {
        sourceId,
        filePath,
        lastScannedAt: scannedAt,
        parseStatus: "failed",
        errorMessage: summarizeError(error),
      },
      update: {
        lastScannedAt: scannedAt,
        parseStatus: "failed",
        errorMessage: summarizeError(error),
      },
    })
  }

  public async touchLastScan(sourceId: bigint, scannedAt: Date): Promise<void> {
    await this.prisma.agentSource.update({
      where: { id: sourceId },
      data: { lastScanAt: scannedAt },
    })
  }
}
