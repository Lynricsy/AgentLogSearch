import { mkdir, mkdtemp, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createSourceRequestSchema, SOURCE_PRESET_DEFAULTS } from "@agent-log-search/shared"
import { Test } from "@nestjs/testing"
import { PrismaService } from "../database/prisma.service.js"
import { PathPolicyService } from "./path-policy.service.js"
import { SourcesService } from "./sources.service.js"

type FakeSourceUpdateData = Readonly<
  Record<string, unknown> & {
    parserType?: unknown
    readerType?: unknown
    sourcePreset?: unknown
  }
>

describe("SourcesService", () => {
  let rootPath: string
  let service: SourcesService
  let storedSources: readonly Awaited<ReturnType<SourcesService["create"]>>[]

  beforeEach(async () => {
    // Given
    rootPath = await mkdtemp(join(tmpdir(), "sources-service-"))
    storedSources = []

    const prisma = {
      agentSource: {
        create: jest.fn(async ({ data }: { readonly data: Record<string, unknown> }) => {
          const now = new Date("2026-06-16T00:00:00.000Z")
          const record = {
            id: BigInt(storedSources.length + 1),
            ...data,
            lastScanAt: null,
            createdAt: now,
            updatedAt: now,
          }
          storedSources = [...storedSources, service.toAgentSource(record)]
          return record
        }),
        delete: jest.fn(async ({ where }: { readonly where: { readonly id: bigint } }) => ({
          id: where.id,
        })),
        findMany: jest.fn(async () =>
          storedSources.map((source) => ({
            ...source,
            id: BigInt(source.id),
            sourcePreset: source.sourcePreset.replaceAll("-", "_"),
            parserType: source.parserType.replaceAll("-", "_"),
            readerType: source.readerType.replaceAll("-", "_"),
            lastScanAt: null,
            createdAt: new Date(source.createdAt),
            updatedAt: new Date(source.updatedAt),
          })),
        ),
        findUnique: jest.fn(async ({ where }: { readonly where: { readonly id: bigint } }) => {
          const source = storedSources.find((candidate) => candidate.id === where.id.toString())
          if (!source) return null
          return {
            ...source,
            id: where.id,
            sourcePreset: source.sourcePreset.replaceAll("-", "_"),
            parserType: source.parserType.replaceAll("-", "_"),
            readerType: source.readerType.replaceAll("-", "_"),
            lastScanAt: null,
            createdAt: new Date(source.createdAt),
            updatedAt: new Date(source.updatedAt),
          }
        }),
        update: jest.fn(
          async ({
            data,
            where,
          }: {
            readonly data: FakeSourceUpdateData
            readonly where: { readonly id: bigint }
          }) => {
            const previous = storedSources.find((candidate) => candidate.id === where.id.toString())
            if (!previous) throw new Error("source missing in fake prisma")
            const merged = {
              ...previous,
              ...data,
              id: where.id,
              sourcePreset: data.sourcePreset ?? previous.sourcePreset.replaceAll("-", "_"),
              parserType: data.parserType ?? previous.parserType.replaceAll("-", "_"),
              readerType: data.readerType ?? previous.readerType.replaceAll("-", "_"),
              lastScanAt: null,
              createdAt: new Date(previous.createdAt),
              updatedAt: new Date("2026-06-16T00:01:00.000Z"),
            }
            storedSources = storedSources.map((candidate) =>
              candidate.id === previous.id ? service.toAgentSource(merged) : candidate,
            )
            return merged
          },
        ),
      },
    }

    const moduleRef = await Test.createTestingModule({
      providers: [
        SourcesService,
        PathPolicyService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile()

    service = moduleRef.get(SourcesService)
  })

  it("creates, lists, updates, and deletes a source when path policy accepts the root", async () => {
    // Given
    const defaults = SOURCE_PRESET_DEFAULTS.codex

    // When
    const created = await service.create(
      createSourceRequestSchema.parse({
        name: "Codex local",
        ...defaults,
        rootPath,
      }),
    )
    const listed = await service.list()
    const updated = await service.update(created.id, { name: "Codex renamed" })
    await service.delete(created.id)

    // Then
    expect(created.parserType).toBe("codex-jsonl")
    expect(created.readerType).toBe("file-glob")
    expect(created.rootPath).toBe(rootPath)
    expect(listed).toHaveLength(1)
    expect(updated.name).toBe("Codex renamed")
  })

  it("returns preset defaults for codex claude pi opencode and generic imports", () => {
    // Given / When
    const presets = service.listPresets()

    // Then
    expect(presets).toEqual([
      expect.objectContaining({
        sourcePreset: "codex",
        parserType: "codex-jsonl",
        readerType: "file-glob",
      }),
      expect.objectContaining({
        sourcePreset: "claude-code",
        parserType: "claude-jsonl",
        readerType: "file-glob",
      }),
      expect.objectContaining({
        sourcePreset: "pi-agent",
        parserType: "pi-jsonl",
        readerType: "file-glob",
      }),
      expect.objectContaining({
        sourcePreset: "opencode",
        parserType: "opencode-sqlite",
        readerType: "sqlite",
      }),
      expect.objectContaining({
        sourcePreset: "generic",
        parserType: "generic-jsonl",
        readerType: "file-glob",
      }),
      expect.objectContaining({
        sourcePreset: "generic",
        parserType: "generic-json",
        readerType: "file-glob",
      }),
      expect.objectContaining({
        sourcePreset: "generic",
        parserType: "generic-markdown",
        readerType: "file-glob",
      }),
    ])
  })

  it("rejects missing roots before writing to the database", async () => {
    // Given
    const missingRoot = join(rootPath, "missing")

    // When / Then
    await expect(
      service.create(
        createSourceRequestSchema.parse({
          name: "Missing",
          ...SOURCE_PRESET_DEFAULTS.generic,
          rootPath: missingRoot,
        }),
      ),
    ).rejects.toMatchObject({
      response: {
        error: expect.objectContaining({
          code: "invalid_source_path",
        }),
      },
      status: 400,
    })
  })

  it("rejects symlink roots when followSymlinks is not enabled", async () => {
    // Given
    const target = join(rootPath, "target")
    const link = join(rootPath, "link")
    await mkdir(target)
    await symlink(target, link)

    // When / Then
    await expect(
      service.create(
        createSourceRequestSchema.parse({
          name: "Symlink",
          ...SOURCE_PRESET_DEFAULTS.generic,
          rootPath: link,
        }),
      ),
    ).rejects.toMatchObject({
      response: {
        error: expect.objectContaining({
          code: "invalid_source_path",
        }),
      },
      status: 400,
    })
  })
})
