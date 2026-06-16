import type { HistoryFile } from "@agent-log-search/shared"
import { Injectable } from "@nestjs/common"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { PrismaService } from "../database/prisma.service.js"
import {
  mapRecordValue,
  readBigIntLike,
  readNullableDate,
  readNullableString,
  readNumber,
  readString,
} from "./record-readers.js"
import { PRISMA_PARSE_STATUS_TO_API } from "./scan-job-mapping.js"

type HistoryFileRecord = Readonly<Record<string, unknown>>

@Injectable()
export class HistoryFilesService {
  public constructor(private readonly prisma: PrismaService) {}

  public async listBySource(sourceId: bigint): Promise<readonly HistoryFile[]> {
    const records = await this.prisma.historyFile.findMany({
      where: {
        sourceId,
      },
      orderBy: {
        lastScannedAt: "desc",
      },
    })
    return records.map((record) => this.toHistoryFile(record))
  }

  public async listFailedBySource(sourceId: bigint): Promise<readonly HistoryFile[]> {
    const records = await this.prisma.historyFile.findMany({
      where: {
        parseStatus: "failed",
        sourceId,
      },
      orderBy: {
        updatedAt: "desc",
      },
    })
    return records.map((record) => this.toHistoryFile(record))
  }

  public toHistoryFile(record: HistoryFileRecord): HistoryFile {
    return {
      id: readBigIntLike(record, "id"),
      sourceId: readBigIntLike(record, "sourceId"),
      filePath: readString(record, "filePath"),
      fileHash: readNullableString(record, "fileHash"),
      fileSize: readNumber(record, "fileSize"),
      modifiedAt: readNullableDate(record, "modifiedAt"),
      lastScannedAt: readNullableDate(record, "lastScannedAt"),
      parseStatus: mapRecordValue(
        PRISMA_PARSE_STATUS_TO_API,
        readString(record, "parseStatus"),
        "parseStatus",
      ),
      errorMessage: truncateNullableMessage(readNullableString(record, "errorMessage")),
    }
  }
}

export function truncateNullableMessage(message: string | null): string | null {
  if (message === null) {
    return null
  }
  if (message.length <= ERROR_MESSAGE_MAX_LENGTH) {
    return message
  }
  return `${message.slice(0, ERROR_MESSAGE_MAX_LENGTH)}...`
}

export const ERROR_MESSAGE_MAX_LENGTH = 200
