import type {
  PaginationQuery,
  ScanJob,
  ScanJobSource,
  ScanJobsResponse,
} from "@agent-log-search/shared"
import { Injectable } from "@nestjs/common"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { PrismaService } from "../database/prisma.service.js"
import {
  PRISMA_PARSER_TYPE_TO_API,
  PRISMA_SOURCE_PRESET_TO_API,
} from "../sources/source-mapping.js"
import { truncateNullableMessage } from "./history-files.service.js"
import {
  mapRecordValue,
  readBigIntLike,
  readDate,
  readNullableBigIntLike,
  readNullableDate,
  readNullableString,
  readNumber,
  readString,
} from "./record-readers.js"
import { PRISMA_SCAN_JOB_STATUS_TO_API } from "./scan-job-mapping.js"

type ScanJobRecord = Readonly<Record<string, unknown> & { readonly source: unknown }>

@Injectable()
export class ScanJobsService {
  public constructor(private readonly prisma: PrismaService) {}

  public async list(query: PaginationQuery): Promise<ScanJobsResponse> {
    const [totalItems, records] = await Promise.all([
      this.prisma.scanJob.count(),
      this.prisma.scanJob.findMany({
        include: {
          source: {
            select: {
              id: true,
              name: true,
              sourcePreset: true,
              parserType: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ])

    return {
      records: records.map((record) => this.toScanJob(record)),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / query.pageSize),
      },
    }
  }

  public toScanJob(record: ScanJobRecord): ScanJob {
    return {
      id: readBigIntLike(record, "id"),
      sourceId: readNullableBigIntLike(record, "sourceId"),
      source: readScanJobSource(record),
      status: mapRecordValue(PRISMA_SCAN_JOB_STATUS_TO_API, readString(record, "status"), "status"),
      filesDiscovered: readNumber(record, "filesDiscovered"),
      filesParsed: readNumber(record, "filesParsed"),
      filesFailed: readNumber(record, "filesFailed"),
      sessionsImported: readNumber(record, "sessionsImported"),
      messagesImported: readNumber(record, "messagesImported"),
      chunksCreated: readNumber(record, "chunksCreated"),
      errorMessage: truncateNullableMessage(readNullableString(record, "errorMessage")),
      createdAt: readDate(record, "createdAt"),
      startedAt: readNullableDate(record, "startedAt"),
      finishedAt: readNullableDate(record, "finishedAt"),
    }
  }
}

function readScanJobSource(record: ScanJobRecord): ScanJobSource | null {
  const value = record.source
  if (value === null) {
    return null
  }
  if (!isRecord(value)) {
    throw new InvalidScanJobSourceError()
  }

  return {
    id: readBigIntLike(value, "id"),
    name: readString(value, "name"),
    sourcePreset: mapRecordValue(
      PRISMA_SOURCE_PRESET_TO_API,
      readString(value, "sourcePreset"),
      "source.sourcePreset",
    ),
    parserType: mapRecordValue(
      PRISMA_PARSER_TYPE_TO_API,
      readString(value, "parserType"),
      "source.parserType",
    ),
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

class InvalidScanJobSourceError extends Error {
  public readonly name = "InvalidScanJobSourceError"

  public constructor() {
    super("Invalid scan job source relation")
  }
}
