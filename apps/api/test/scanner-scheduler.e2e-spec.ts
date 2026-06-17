import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SOURCE_PRESET_DEFAULTS } from "@agent-log-search/shared"
import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { AppModule } from "../src/app.module"
import { configureApp } from "../src/bootstrap"
import { PrismaService } from "../src/database/prisma.service"

type SchedulerJob = {
  readonly sourceId: bigint | null
  readonly status: string
}

describe("ScannerScheduler", () => {
  let app: INestApplication
  let prisma: PrismaService
  let sourceId: bigint | null = null
  let rootPath: string | null = null
  const previousEnabled = readEnv("SCAN_SCHEDULER_ENABLED")
  const previousInterval = readEnv("SCAN_INTERVAL_SECONDS")

  beforeAll(async () => {
    // Given
    setEnv("SCAN_SCHEDULER_ENABLED", "true")
    setEnv("SCAN_INTERVAL_SECONDS", "1")
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    configureApp(app)
    await app.init()
    prisma = app.get(PrismaService)
  })

  afterEach(async () => {
    await cleanupCreatedSource()
    await cleanupRootPath()
  })

  afterAll(async () => {
    await cleanupCreatedSource()
    await cleanupRootPath()
    await app.close()
    restoreEnv("SCAN_SCHEDULER_ENABLED", previousEnabled)
    restoreEnv("SCAN_INTERVAL_SECONDS", previousInterval)
  })

  it("creates a scan job for a due source without a manual scan request", async () => {
    // Given
    rootPath = await mkdtemp(join(tmpdir(), "scanner-scheduler-e2e-"))
    await writeFile(join(rootPath, "history.jsonl"), makeHistoryLine(), "utf8")
    const createResponse = await request(app.getHttpServer())
      .post("/api/sources")
      .send({
        ...SOURCE_PRESET_DEFAULTS.generic,
        name: `T12 Scheduler ${Date.now()}`,
        rootPath,
        fileGlob: "*.jsonl",
      })
    expect(createResponse.status).toBe(201)
    sourceId = BigInt(createResponse.body.id)

    // When
    const job = await waitForSchedulerJob(sourceId)

    // Then
    expect(job?.sourceId).toBe(sourceId)
    expect(job?.status).toBe("completed")
  })

  async function waitForSchedulerJob(id: bigint): Promise<SchedulerJob | null> {
    const deadline = Date.now() + 6000
    while (Date.now() < deadline) {
      const job = await prisma.scanJob.findFirst({
        orderBy: { createdAt: "desc" },
        where: { sourceId: id },
      })
      if (job !== null) return job
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    return null
  }

  async function cleanupCreatedSource(): Promise<void> {
    if (sourceId === null) {
      return
    }
    await prisma.agentSource.deleteMany({ where: { id: sourceId } })
    sourceId = null
  }

  async function cleanupRootPath(): Promise<void> {
    if (rootPath === null) {
      return
    }
    await rm(rootPath, { force: true, recursive: true })
    rootPath = null
  }
})

function makeHistoryLine(): string {
  return `${JSON.stringify({
    messages: [{ content: "scheduled hello", role: "user" }],
    threadId: "scheduler-thread",
  })}\n`
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
    return
  }
  process.env[name] = value
}

function readEnv(name: string): string | undefined {
  return process.env[name]
}

function setEnv(name: string, value: string): void {
  process.env[name] = value
}
