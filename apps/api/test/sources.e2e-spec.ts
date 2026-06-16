import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { SOURCE_PRESET_DEFAULTS } from "@agent-log-search/shared"
import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { AppModule } from "../src/app.module"
import { configureApp } from "../src/bootstrap"
import { PrismaService } from "../src/database/prisma.service"

type StoredSourceRecord = Readonly<Record<string, unknown> & { id: bigint }>

describe("Sources API", () => {
  let app: INestApplication
  let rootPath: string
  let sourceId = 0
  let storedSources: readonly StoredSourceRecord[] = []

  beforeAll(async () => {
    // Given
    rootPath = await mkdtemp(join(tmpdir(), "sources-e2e-"))

    const prisma = {
      agentSource: {
        create: jest.fn(async ({ data }: { readonly data: Record<string, unknown> }) => {
          sourceId += 1
          const now = new Date("2026-06-16T00:00:00.000Z")
          const record = {
            id: BigInt(sourceId),
            ...data,
            lastScanAt: null,
            createdAt: now,
            updatedAt: now,
          }
          storedSources = [...storedSources, record]
          return record
        }),
        delete: jest.fn(async ({ where }: { readonly where: { readonly id: bigint } }) => {
          storedSources = storedSources.filter((source) => source.id !== where.id)
          return { id: where.id }
        }),
        findMany: jest.fn(async () => storedSources),
        findUnique: jest.fn(async ({ where }: { readonly where: { readonly id: bigint } }) => {
          return storedSources.find((source) => source.id === where.id) ?? null
        }),
        update: jest.fn(
          async ({
            data,
            where,
          }: {
            readonly data: Record<string, unknown>
            readonly where: { readonly id: bigint }
          }) => {
            const previous = storedSources.find((source) => source.id === where.id)
            if (!previous) return null
            const record = {
              ...previous,
              ...data,
              updatedAt: new Date("2026-06-16T00:01:00.000Z"),
            }
            storedSources = storedSources.map((source) =>
              source.id === where.id ? record : source,
            )
            return record
          },
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

  it("creates and lists a source when the payload is valid", async () => {
    // Given
    const payload = {
      name: "Demo source",
      ...SOURCE_PRESET_DEFAULTS.generic,
      rootPath,
    }

    // When
    const createResponse = await request(app.getHttpServer()).post("/api/sources").send(payload)
    const listResponse = await request(app.getHttpServer()).get("/api/sources")

    // Then
    expect(createResponse.status).toBe(201)
    expect(createResponse.body).toEqual(
      expect.objectContaining({
        id: "1",
        name: "Demo source",
        parserType: "generic-jsonl",
      }),
    )
    expect(listResponse.status).toBe(200)
    expect(listResponse.body).toEqual([
      expect.objectContaining({
        id: "1",
        sourcePreset: "generic",
      }),
    ])
  })

  it("returns DTO errors when the create payload is invalid", async () => {
    // Given
    const payload = {
      name: "",
      sourcePreset: "generic",
      parserType: "generic-jsonl",
      readerType: "file-glob",
      rootPath,
    }

    // When
    const response = await request(app.getHttpServer()).post("/api/sources").send(payload)

    // Then
    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: expect.objectContaining({
        code: "validation_error",
      }),
    })
  })

  it("returns path errors when root path does not exist", async () => {
    // Given
    const payload = {
      name: "Missing source",
      ...SOURCE_PRESET_DEFAULTS.generic,
      rootPath: join(rootPath, "missing"),
    }

    // When
    const response = await request(app.getHttpServer()).post("/api/sources").send(payload)

    // Then
    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      error: expect.objectContaining({
        code: "invalid_source_path",
      }),
    })
  })
})
