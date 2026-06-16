import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { AppModule } from "../src/app.module"
import { configureApp } from "../src/bootstrap"
import { PrismaService } from "../src/database/prisma.service"

type StoredScanJobRecord = Readonly<Record<string, unknown> & { id: bigint }>

const now = new Date("2026-06-16T10:00:00.000Z")

describe("ScanJobs API", () => {
  let app: INestApplication
  let storedScanJobs: readonly StoredScanJobRecord[] = []

  beforeAll(async () => {
    // Given
    const prisma = {
      scanJob: {
        count: jest.fn(async () => storedScanJobs.length),
        findMany: jest.fn(
          async ({ skip, take }: { readonly skip: number; readonly take: number }) =>
            storedScanJobs.slice(skip, skip + take),
        ),
      },
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile()

    app = moduleRef.createNestApplication()
    configureApp(app)
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    storedScanJobs = []
  })

  it("returns an empty scan job list when no records exist", async () => {
    // When
    const response = await request(app.getHttpServer()).get("/api/scan-jobs?page=1&pageSize=20")

    // Then
    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      records: [],
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems: 0,
        totalPages: 0,
      },
    })
  })

  it("paginates scan jobs and truncates failed error messages", async () => {
    // Given
    storedScanJobs = [
      makeScanJobRecord({ id: 1n }),
      makeScanJobRecord({
        id: 2n,
        sourceId: 7n,
        source: {
          id: 7n,
          name: "Generic local",
          sourcePreset: "generic",
          parserType: "generic_jsonl",
        },
        status: "failed",
        errorMessage: "failure ".repeat(80),
      }),
    ]

    // When
    const response = await request(app.getHttpServer()).get("/api/scan-jobs?page=2&pageSize=1")

    // Then
    expect(response.status).toBe(200)
    expect(response.body.pagination).toEqual({
      page: 2,
      pageSize: 1,
      totalItems: 2,
      totalPages: 2,
    })
    expect(response.body.records).toEqual([
      expect.objectContaining({
        id: "2",
        source: expect.objectContaining({
          id: "7",
          name: "Generic local",
          parserType: "generic-jsonl",
        }),
      }),
    ])
    expect(response.body.records[0].errorMessage).toHaveLength(203)
  })

  it("rejects invalid pagination query values", async () => {
    // When
    const response = await request(app.getHttpServer()).get("/api/scan-jobs?page=0&pageSize=101")

    // Then
    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: expect.objectContaining({
        code: "validation_error",
      }),
    })
  })
})

function makeScanJobRecord(input: Partial<StoredScanJobRecord> = {}): StoredScanJobRecord {
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
