import { Test } from "@nestjs/testing"
import { PrismaService } from "../database/prisma.service.js"
import { HistoryFilesService } from "./history-files.service.js"
import { PRISMA_PARSE_STATUS_TO_API } from "./scan-job-mapping.js"
import { ScanJobsService } from "./scan-jobs.service.js"

type FakeScanJobRecord = Readonly<Record<string, unknown>>

const now = new Date("2026-06-16T10:00:00.000Z")

describe("ScanJobsService", () => {
  it("returns an empty page when no scan jobs exist", async () => {
    // Given
    const service = await createService([])

    // When
    const result = await service.list({ page: 1, pageSize: 20 })

    // Then
    expect(result).toEqual({
      records: [],
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems: 0,
        totalPages: 0,
      },
    })
  })

  it("paginates scan jobs and includes source fields when records exist", async () => {
    // Given
    const records = Array.from({ length: 3 }, (_, index) =>
      makeScanJobRecord({
        id: BigInt(index + 1),
        sourceId: 11n,
        source: {
          id: 11n,
          name: "Codex local",
          sourcePreset: "codex",
          parserType: "codex_jsonl",
        },
      }),
    )
    const service = await createService(records)

    // When
    const result = await service.list({ page: 2, pageSize: 1 })

    // Then
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 1,
      totalItems: 3,
      totalPages: 3,
    })
    expect(result.records).toEqual([
      expect.objectContaining({
        id: "2",
        sourceId: "11",
        source: {
          id: "11",
          name: "Codex local",
          sourcePreset: "codex",
          parserType: "codex-jsonl",
        },
      }),
    ])
  })

  it("truncates failed scan job error messages in list responses", async () => {
    // Given
    const service = await createService([
      makeScanJobRecord({
        id: 1n,
        status: "failed",
        errorMessage: "x".repeat(500),
      }),
    ])

    // When
    const result = await service.list({ page: 1, pageSize: 20 })

    // Then
    expect(result.records[0]?.errorMessage).toHaveLength(203)
    expect(result.records[0]?.errorMessage?.endsWith("...")).toBe(true)
  })
})

describe("HistoryFilesService", () => {
  it("maps Prisma parse statuses to explicit API parse statuses", async () => {
    // Given
    const service = await createHistoryFilesService([
      {
        id: 1n,
        sourceId: 2n,
        filePath: "/tmp/history.jsonl",
        fileHash: null,
        fileSize: 128n,
        modifiedAt: null,
        lastScannedAt: now,
        parseStatus: "failed",
        errorMessage: "parse failed",
        createdAt: now,
        updatedAt: now,
      },
    ])

    // When
    const result = await service.listBySource(2n)

    // Then
    expect(PRISMA_PARSE_STATUS_TO_API.failed).toBe("FAILED")
    expect(result).toEqual([
      expect.objectContaining({
        id: "1",
        sourceId: "2",
        parseStatus: "FAILED",
        errorMessage: "parse failed",
      }),
    ])
  })
})

async function createService(records: readonly FakeScanJobRecord[]): Promise<ScanJobsService> {
  const prisma = {
    scanJob: {
      count: jest.fn(async () => records.length),
      findMany: jest.fn(async ({ skip, take }: { readonly skip: number; readonly take: number }) =>
        records.slice(skip, skip + take),
      ),
    },
  }
  const moduleRef = await Test.createTestingModule({
    providers: [
      ScanJobsService,
      {
        provide: PrismaService,
        useValue: prisma,
      },
    ],
  }).compile()
  return moduleRef.get(ScanJobsService)
}

async function createHistoryFilesService(
  records: readonly FakeScanJobRecord[],
): Promise<HistoryFilesService> {
  const prisma = {
    historyFile: {
      findMany: jest.fn(async () => records),
    },
  }
  const moduleRef = await Test.createTestingModule({
    providers: [
      HistoryFilesService,
      {
        provide: PrismaService,
        useValue: prisma,
      },
    ],
  }).compile()
  return moduleRef.get(HistoryFilesService)
}

function makeScanJobRecord(input: Partial<FakeScanJobRecord> = {}): FakeScanJobRecord {
  return {
    id: 1n,
    sourceId: null,
    source: null,
    status: "completed",
    filesDiscovered: 0,
    filesParsed: 0,
    filesFailed: 0,
    sessionsImported: 0,
    messagesImported: 0,
    chunksCreated: 0,
    errorMessage: null,
    createdAt: now,
    startedAt: now,
    finishedAt: now,
    ...input,
  }
}
