import { Test } from "@nestjs/testing"
import { PrismaService } from "../database/prisma.service.js"
import { ParserRegistry } from "../parsers/index.js"
import { ScannerService } from "./scanner.service.js"
import type { ScanRunResponse } from "./scanner.types.js"
import { ScannerConflictError } from "./scanner-errors.js"
import { ScannerFileRunner } from "./scanner-file-runner.js"
import { ScannerJobStore } from "./scanner-job-store.js"
import { ScannerScheduler } from "./scanner-scheduler.js"
import { ScannerSourceStore } from "./scanner-source-store.js"
import { FakePrisma } from "./scanner-test-fakes.js"
import { SourceReaderRegistry } from "./source-reader-registry.js"

describe("ScannerSourceStore", () => {
  it("returns enabled sources due at the provided time", async () => {
    // Given
    const now = new Date("2026-06-17T10:00:00.000Z")
    const prisma = new FakePrisma()
    const due = prisma.addSource({ lastScanAt: new Date("2026-06-17T09:55:00.000Z") })
    prisma.addSource({ lastScanAt: new Date("2026-06-17T09:56:00.000Z") })
    prisma.addSource({ enabled: false, lastScanAt: null })
    const store = await createSourceStore(prisma)

    // When
    const sources = await store.listDue(now)

    // Then
    expect(sources.map((source) => source.id)).toEqual([due.id])
  })
})

describe("ScannerService.runDue", () => {
  it("runs only due sources through the existing source path", async () => {
    // Given
    const now = new Date("2026-06-17T10:00:00.000Z")
    const prisma = new FakePrisma()
    const due = prisma.addSource({ lastScanAt: null })
    prisma.addSource({ lastScanAt: new Date("2026-06-17T09:59:00.000Z") })
    prisma.addSource({ enabled: false, lastScanAt: null })
    const service = await createScanner(prisma)

    // When
    const response = await service.runDue(now)

    // Then
    expect(response.records).toEqual([expect.objectContaining({ sourceId: due.id.toString() })])
  })
})

describe("ScannerScheduler", () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
    deleteEnv("SCAN_SCHEDULER_ENABLED")
    deleteEnv("SCAN_INTERVAL_SECONDS")
  })

  it("scans due sources on the global interval when enabled", async () => {
    // Given
    jest.setSystemTime(new Date("2026-06-17T10:00:00.000Z"))
    setEnv("SCAN_SCHEDULER_ENABLED", "true")
    setEnv("SCAN_INTERVAL_SECONDS", "2")
    const prisma = new FakePrisma()
    const due = prisma.addSource({ lastScanAt: null })
    const notDue = prisma.addSource({ lastScanAt: new Date("2026-06-17T09:59:00.000Z") })
    const disabled = prisma.addSource({ enabled: false, lastScanAt: null })
    const scanner = await createScanner(prisma)
    const scheduler = new ScannerScheduler(scanner)

    // When
    scheduler.onModuleInit()
    await jest.advanceTimersByTimeAsync(2000)
    scheduler.onModuleDestroy()

    // Then
    expect(prisma.scanJobsFor(due.id)).toHaveLength(1)
    expect(prisma.scanJobsFor(notDue.id)).toHaveLength(0)
    expect(prisma.scanJobsFor(disabled.id)).toHaveLength(0)
  })

  it("does not register work when disabled", async () => {
    // Given
    setEnv("SCAN_SCHEDULER_ENABLED", "false")
    const { scanner, scheduler } = await createSchedulerWithFake()

    // When
    scheduler.onModuleInit()
    await jest.advanceTimersByTimeAsync(60_000)
    scheduler.onModuleDestroy()

    // Then
    expect(scanner.runDue).not.toHaveBeenCalled()
  })

  it("keeps ticking after a duplicate scan conflict", async () => {
    // Given
    setEnv("SCAN_SCHEDULER_ENABLED", "true")
    setEnv("SCAN_INTERVAL_SECONDS", "1")
    const runDue = jest.fn(async (_now?: Date): Promise<ScanRunResponse> => ({ records: [] }))
    runDue.mockRejectedValueOnce(new ScannerConflictError(1n))
    const { scanner, scheduler } = await createSchedulerWithFake(runDue)

    // When
    scheduler.onModuleInit()
    await jest.advanceTimersByTimeAsync(1000)
    await jest.advanceTimersByTimeAsync(1000)
    scheduler.onModuleDestroy()

    // Then
    expect(scanner.runDue).toHaveBeenCalledTimes(2)
  })
})

async function createSourceStore(prisma: FakePrisma): Promise<ScannerSourceStore> {
  const moduleRef = await Test.createTestingModule({
    providers: [ScannerSourceStore, { provide: PrismaService, useValue: prisma }],
  }).compile()
  return moduleRef.get(ScannerSourceStore)
}

async function createScanner(prisma: FakePrisma): Promise<ScannerService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      ScannerJobStore,
      ScannerService,
      ScannerSourceStore,
      { provide: PrismaService, useValue: prisma },
      { provide: ScannerFileRunner, useValue: { runFile: async () => null } },
      {
        provide: ParserRegistry,
        useValue: { parse: async () => ({ sessions: [], warnings: [], errors: [] }) },
      },
      { provide: SourceReaderRegistry, useValue: { read: async () => [] } },
    ],
  }).compile()
  return moduleRef.get(ScannerService)
}

async function createSchedulerWithFake(
  runDue = jest.fn(async (_now?: Date): Promise<ScanRunResponse> => ({ records: [] })),
): Promise<{
  readonly scanner: { readonly runDue: typeof runDue }
  readonly scheduler: ScannerScheduler
}> {
  const scanner = { runDue }
  const moduleRef = await Test.createTestingModule({
    providers: [ScannerScheduler, { provide: ScannerService, useValue: scanner }],
  }).compile()
  return { scanner, scheduler: moduleRef.get(ScannerScheduler) }
}

function setEnv(name: string, value: string): void {
  process.env[name] = value
}

function deleteEnv(name: string): void {
  delete process.env[name]
}
