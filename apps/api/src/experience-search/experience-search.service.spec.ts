import { ExperienceSearchService } from "./experience-search.service.js"
import { FailedAttemptSearchService } from "./failed-attempt-search.service.js"

describe("ExperienceSearchService", () => {
  const env = process.env as Record<string, string | undefined>
  const previousSearchFlag = readEnv(env, "EXPERIENCE_SEARCH_ENABLED")

  beforeEach(() => {
    writeEnv(env, "EXPERIENCE_SEARCH_ENABLED", "true")
  })

  afterEach(() => {
    if (previousSearchFlag === undefined) {
      deleteEnv(env, "EXPERIENCE_SEARCH_ENABLED")
    } else {
      writeEnv(env, "EXPERIENCE_SEARCH_ENABLED", previousSearchFlag)
    }
  })

  it("searches ready same-revision experiences and groups outcomes", async () => {
    const prisma = createPrismaFake({
      experiences: [
        experience({
          id: 1n,
          outcome: "SUCCEEDED",
          searchText: "TS2339 apps/api/src/foo.ts test",
          pathTokens: ["apps/api/src/foo.ts"],
          errorCodes: ["TS2339"],
          commandFamilies: ["test"],
        }),
        experience({
          id: 2n,
          outcome: "FAILED",
          searchText: "unrelated",
          sourceRevision: 1,
          sessionTraceRevision: 2,
        }),
      ],
    })
    const compatibility = createCompatibilityFake()
    const service = new ExperienceSearchService(prisma, compatibility)

    const result = await service.search({
      query: "TS2339 foo.ts test",
      files: ["apps/api/src/foo.ts"],
      symbols: [],
      mode: "all",
      topK: 10,
    })

    expect(result.successful.map((entry) => entry.id)).toEqual(["1"])
    expect(result.successful[0]?.matchedErrors).toEqual(["TS2339"])
    expect(result.failedAttempts).toEqual([])
    expect(compatibility.check).not.toHaveBeenCalled()
  })

  it("finds verified scanner experience from fuzzy Prisma text without advanced fields", async () => {
    const prisma = createPrismaFake({
      experiences: [
        experience({
          id: 1n,
          outcome: "PARTIAL",
          title: "TS2724 · session-detail-workspace.tsx",
          taskText: "优化会话详情界面",
          templateSummary: "该任务的部分验证通过，但仍存在后续验证失败。",
          searchText: "Invalid unknown invocation data source",
          pathTokens: ["apps/web/components/session-detail-workspace.tsx"],
        }),
        experience({
          id: 2n,
          outcome: "SUCCEEDED",
          title: "TS4111 · scanner-file-runner.ts:90:37",
          taskText: "截图显示 Invalid historyFile.findUnique invocation",
          templateSummary:
            "最后一次涉及 apps/api/src/scanner/scanner-file-runner.ts 和 prisma/schema.prisma，随后测试验证通过。",
          searchText: "Prisma schema scanner-file-runner historyFile findUnique scan failure",
          pathTokens: ["apps/api/src/scanner/scanner-file-runner.ts", "prisma/schema.prisma"],
          commandFamilies: ["test", "typecheck", "lint"],
        }),
      ],
    })
    const service = new ExperienceSearchService(prisma, createCompatibilityFake())

    const result = await service.search({
      query: "Invalid historyFile.findUnique invocation scanner unknown data source Prisma",
      files: [],
      symbols: [],
      mode: "all",
      topK: 10,
    })

    expect(result.successful[0]).toMatchObject({
      id: "2",
      matchedPaths: expect.arrayContaining(["prisma/schema.prisma"]),
    })
    expect(result.successful[0]?.scoreBreakdown.pathMatch).toBeGreaterThan(0.35)
  })

  it("ignores experiences built with stale search document versions", async () => {
    const prisma = createPrismaFake({
      experiences: [
        experience({
          id: 1n,
          searchDocumentVersion: "experience-search-v1",
          searchText: "TS2339 apps/api/src/foo.ts test",
          pathTokens: ["apps/api/src/foo.ts"],
          errorCodes: ["TS2339"],
          commandFamilies: ["test"],
        }),
        experience({
          id: 2n,
          searchText: "TS2339 apps/api/src/foo.ts test",
          pathTokens: ["apps/api/src/foo.ts"],
          errorCodes: ["TS2339"],
          commandFamilies: ["test"],
        }),
      ],
    })
    const service = new ExperienceSearchService(prisma, createCompatibilityFake())

    const result = await service.search({
      query: "TS2339 foo.ts test",
      files: ["apps/api/src/foo.ts"],
      symbols: [],
      mode: "all",
      topK: 10,
    })

    expect(result.successful.map((entry) => entry.id)).toEqual(["2"])
  })

  it("attaches repository compatibility and applies a conservative score factor", async () => {
    const prisma = createPrismaFake({
      experiences: [
        experience({
          id: 4n,
          dependencySnapshot: {
            lockfiles: [],
            manifestHash: "1".repeat(64),
            packageManagers: ["pnpm"],
            packageName: "api",
            topLevelDependencies: [
              {
                group: "dependencies",
                majorVersion: 10,
                name: "@nestjs/common",
                versionRange: "^10.0.0",
              },
            ],
          },
          manifestHash: "1".repeat(64),
          repoKey: "historical-repo",
          searchText: "TS2322 scanner importer test",
          pathTokens: ["apps/api/src/scanner/scanner-importer.ts"],
          symbolTokens: ["ScannerImporter"],
          errorCodes: ["TS2322"],
        }),
      ],
    })
    const compatibility = createCompatibilityFake({
      coverage: 0.7,
      files: [
        {
          currentPath: null,
          historicalPath: "apps/api/src/scanner/scanner-importer.ts",
          status: "missing",
        },
      ],
      level: "STALE",
      reasonCodes: ["ALL_FILES_MISSING"],
      score: 0,
    })
    const service = new ExperienceSearchService(prisma, compatibility)

    const result = await service.search({
      files: ["apps/api/src/scanner/scanner-importer.ts"],
      mode: "all",
      query: "TS2322 scanner importer",
      repositoryPath: "/repo",
      symbols: ["ScannerImporter"],
      topK: 10,
    })

    expect(compatibility.check).toHaveBeenCalledWith(
      expect.objectContaining({
        currentRepositoryPath: "/repo",
        historicalDependencies: expect.objectContaining({
          packageName: "api",
          topLevelDependencies: [
            {
              group: "dependencies",
              majorVersion: 10,
              name: "@nestjs/common",
              versionRange: "^10.0.0",
            },
          ],
        }),
        historicalManifestHash: "1".repeat(64),
        historicalPaths: ["apps/api/src/scanner/scanner-importer.ts"],
        historicalRepoKey: "historical-repo",
        historicalSymbols: ["ScannerImporter"],
      }),
    )
    expect(result.successful[0]).toMatchObject({
      compatibility: {
        disclaimer: "该结果只表示相关工程对象仍然存在或相似，不代表历史 patch 可以直接应用。",
        level: "STALE",
        reasonCodes: ["ALL_FILES_MISSING"],
      },
      scoreBreakdown: {
        compatibilityFactor: 0.5,
      },
    })
    expect(result.successful[0]?.scoreBreakdown.finalScore).toBeLessThanOrEqual(0.5)
  })

  it("marks matching sessions pending for rebuild", async () => {
    const prisma = createPrismaFake({ experiences: [] })
    const service = new ExperienceSearchService(prisma, createCompatibilityFake())

    const result = await service.rebuild({ sessionId: "42", includeReady: true })

    expect(result).toEqual({ affectedSessions: 1 })
    expect(prisma.agentSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 42n },
        data: expect.objectContaining({ experienceBuildStatus: "PENDING" }),
      }),
    )
  })

  it("reports experience build and embedding status without requiring search enablement", async () => {
    writeEnv(env, "EXPERIENCE_SEARCH_ENABLED", "false")
    writeEnv(env, "EXPERIENCE_WORKER_ENABLED", "true")
    const prisma = createPrismaFake({
      experiences: [
        experience({ id: 4n, embeddingStatus: "ready", sessionExperienceBuildStatus: "READY" }),
        experience({
          id: 5n,
          embeddingStatus: "pending",
          sessionExperienceBuildStatus: "READY",
          sessionTraceRevision: 2,
          sourceRevision: 1,
        }),
        experience({ id: 6n, embeddingStatus: "failed", sessionExperienceBuildStatus: "FAILED" }),
      ],
      latestWorkerError: {
        experienceBuildError: "builder failed",
        id: 99n,
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
      sessionStatusCounts: [
        { count: 2, status: "PENDING" },
        { count: 1, status: "PROCESSING" },
        { count: 3, status: "READY" },
        { count: 1, status: "FAILED" },
      ],
    })
    const service = new ExperienceSearchService(prisma, createCompatibilityFake())

    const result = await service.status()

    expect(result).toMatchObject({
      currentRevisionExperiences: 2,
      embeddingFailed: 1,
      embeddingPending: 1,
      embeddingReady: 1,
      failedSessions: 1,
      pendingSessions: 2,
      processingSessions: 1,
      readyExperiences: 1,
      readySessions: 3,
      searchEnabled: false,
      staleRevisionExperiences: 1,
      workerEnabled: true,
    })
    expect(result.latestWorkerError).toEqual({
      message: "builder failed",
      sessionId: "99",
      updatedAt: "2026-01-02T00:00:00.000Z",
    })
  })

  it("reports stale search document versions as stale experiences", async () => {
    writeEnv(env, "EXPERIENCE_SEARCH_ENABLED", "false")
    const prisma = createPrismaFake({
      experiences: [
        experience({ id: 7n, searchDocumentVersion: "experience-search-v1" }),
        experience({ id: 8n }),
      ],
    })
    const service = new ExperienceSearchService(prisma, createCompatibilityFake())

    const result = await service.status()

    expect(result.currentRevisionExperiences).toBe(1)
    expect(result.readyExperiences).toBe(1)
    expect(result.staleRevisionExperiences).toBe(1)
  })

  it("checks planned operations against failed attempt history", async () => {
    const prisma = createPrismaFake({
      experiences: [
        experience({
          id: 3n,
          outcome: "FAILED",
          searchText: "TS2339 apps/api/src/foo.ts FooService test",
          pathTokens: ["apps/api/src/foo.ts", "foo.ts"],
          errorCodes: ["TS2339"],
          commandFamilies: ["test"],
          attempts: [
            attempt({
              id: 31n,
              experienceId: 3n,
              actionTokens: ["FooService", "test"],
              affectedPaths: ["apps/api/src/foo.ts"],
              affectedSymbols: ["FooService"],
              commandFamilies: ["test"],
              errorBefore: ["TS2339"],
              errorAfter: ["TS2339"],
              evidenceLinks: [{ traceEventId: 91n, role: "VALIDATION", ordinal: 0 }],
            }),
          ],
        }),
      ],
      evidenceEvents: [
        evidenceEvent({
          id: 91n,
          sessionId: 10n,
          redactedExcerpt: "pnpm test failed with TS2339",
          pathTokens: ["apps/api/src/foo.ts"],
          errorCodes: ["TS2339"],
          commandFamilies: ["test"],
        }),
      ],
    })
    const service = new FailedAttemptSearchService(prisma)

    const result = await service.check({
      task: "修复 FooService 的 TS2339 后准备跑测试",
      files: ["apps/api/src/foo.ts"],
      symbols: ["FooService"],
      operationKinds: ["TEST"],
      plannedCommand: "pnpm test apps/api/src/foo.ts",
      topK: 3,
    })

    expect(result.risk).toBe("medium")
    expect(result.message).toBe("计划操作与一条历史失败尝试高度相似。")
    expect(result.matches[0]).toMatchObject({
      risk: "medium",
      matchedPaths: expect.arrayContaining(["apps/api/src/foo.ts"]),
      matchedSymbols: ["FooService"],
      matchedCommandFamilies: ["test"],
      matchedErrors: ["TS2339"],
    })
    expect(result.matches[0]?.attempt.id).toBe("31")
    expect(result.matches[0]?.evidenceEvents[0]?.redactedExcerpt).toContain("TS2339")
  })
})

function createPrismaFake(input: {
  readonly experiences: readonly FakeExperience[]
  readonly evidenceEvents?: readonly FakeEvidenceEvent[]
  readonly latestWorkerError?: FakeWorkerError | null
  readonly sessionStatusCounts?: readonly FakeSessionStatusCount[]
}) {
  const agentExperience = {
    findMany: jest.fn(
      async (args: {
        readonly where?: {
          readonly id?: { readonly in: bigint[] }
          readonly outcome?: FakeExperience["outcome"]
          readonly searchDocumentVersion?: string
          readonly session?: {
            readonly experienceBuildStatus?: FakeExperience["session"]["experienceBuildStatus"]
            readonly experienceBuilderVersion?: string
          }
        }
      }) => {
        if (args.where?.id?.in !== undefined) {
          const ids = new Set(args.where.id.in.map((id) => id.toString()))
          return input.experiences.filter((entry) => ids.has(entry.id.toString()))
        }
        return input.experiences.filter((entry) => {
          if (args.where?.outcome !== undefined && entry.outcome !== args.where.outcome) {
            return false
          }
          if (
            args.where?.searchDocumentVersion !== undefined &&
            entry.searchDocumentVersion !== args.where.searchDocumentVersion
          ) {
            return false
          }
          if (
            args.where?.session?.experienceBuildStatus !== undefined &&
            entry.session.experienceBuildStatus !== args.where.session.experienceBuildStatus
          ) {
            return false
          }
          if (
            args.where?.session?.experienceBuilderVersion !== undefined &&
            entry.session.experienceBuilderVersion !== args.where.session.experienceBuilderVersion
          ) {
            return false
          }
          return true
        })
      },
    ),
    findUnique: jest.fn(),
  }
  const agentSession = {
    findFirst: jest.fn(async () => input.latestWorkerError ?? null),
    groupBy: jest.fn(async () =>
      (input.sessionStatusCounts ?? []).map((entry) => ({
        _count: { _all: entry.count },
        experienceBuildStatus: entry.status,
      })),
    ),
    updateMany: jest.fn(async () => ({ count: 1 })),
  }
  const agentTraceEvent = {
    findMany: jest.fn(
      async (args?: { readonly where?: { readonly id?: { readonly in: bigint[] } } }) => {
        const events = input.evidenceEvents ?? []
        if (args?.where?.id?.in === undefined) {
          return events
        }
        const ids = new Set(args.where.id.in.map((id) => id.toString()))
        return events.filter((event) => ids.has(event.id.toString()))
      },
    ),
  }
  const agentAttempt = {
    findMany: jest.fn(async () =>
      input.experiences.flatMap((entry) =>
        entry.attempts.map((entryAttempt) => ({
          ...entryAttempt,
          experience: entry,
        })),
      ),
    ),
  }
  return {
    agentExperience,
    agentSession,
    agentTraceEvent,
    agentAttempt,
  } as unknown as ConstructorParameters<typeof ExperienceSearchService>[0] & {
    readonly agentSession: {
      readonly findFirst: jest.Mock
      readonly groupBy: jest.Mock
      readonly updateMany: jest.Mock
    }
  }
}

function createCompatibilityFake(input: Partial<FakeCompatibilityResult> = {}) {
  return {
    check: jest.fn(async () => ({
      coverage: input.coverage ?? 1,
      disclaimer:
        input.disclaimer ??
        "该结果只表示相关工程对象仍然存在或相似，不代表历史 patch 可以直接应用。",
      files: input.files ?? [],
      level: input.level ?? "COMPATIBLE",
      reasonCodes: input.reasonCodes ?? ["FILES_PRESENT"],
      score: input.score ?? 1,
      snapshot: input.snapshot ?? {
        branch: "main",
        capturedAt: "2026-01-01T00:00:00.000Z",
        dependencies: null,
        dirtyHash: "clean",
        gitHead: "a".repeat(40),
        manifestHash: null,
        quality: "unknown",
        repoKey: "current-repo",
        rootPath: "/repo",
      },
    })),
  } as unknown as ConstructorParameters<typeof ExperienceSearchService>[1] & {
    readonly check: jest.Mock
  }
}

function experience(input: Partial<FakeExperience> & { readonly id: bigint }): FakeExperience {
  const sourceRevision = input.sourceRevision ?? 1
  return {
    id: input.id,
    sessionId: 10n,
    episodeIndex: 0,
    sourceRevision,
    startSeq: 0,
    endSeq: 2,
    kind: "change",
    title: input.title ?? "TS2339 · foo.ts",
    taskText: input.taskText ?? "修复错误",
    templateSummary: input.templateSummary ?? "该任务包含 1 次修改尝试；随后测试验证通过。",
    outcome: input.outcome ?? "SUCCEEDED",
    evidenceScore: input.evidenceScore ?? 0.9,
    evidenceLevel: "A",
    evidenceReasonCodes: ["HAS_TEST_SUMMARY"],
    repoKey: input.repoKey ?? null,
    cwd: "/repo",
    dependencySnapshot: input.dependencySnapshot ?? null,
    manifestHash: input.manifestHash ?? null,
    pathTokens: input.pathTokens ?? [],
    symbolTokens: input.symbolTokens ?? [],
    errorSignatures: [],
    errorCodes: input.errorCodes ?? [],
    commandFamilies: input.commandFamilies ?? [],
    failedAttemptCount: input.attempts?.filter((entry) => entry.outcome === "FAILED").length ?? 0,
    successfulAttemptCount: 1,
    unverifiedAttemptCount: 0,
    searchText: input.searchText ?? "",
    searchDocumentVersion: input.searchDocumentVersion ?? "experience-search-v2",
    embeddingStatus: input.embeddingStatus ?? "pending",
    embeddingModel: null,
    embeddingError: null,
    embeddingReadyAt: null,
    builderVersion: input.builderVersion ?? "experience-v1",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    session: {
      experienceBuildStatus: input.sessionExperienceBuildStatus ?? "READY",
      experienceBuilderVersion: input.sessionExperienceBuilderVersion ?? "experience-v1",
      traceRevision: input.sessionTraceRevision ?? sourceRevision,
    },
    attempts: input.attempts ?? [],
  }
}

function attempt(
  input: Partial<FakeAttempt> & { readonly id: bigint; readonly experienceId: bigint },
): FakeAttempt {
  return {
    id: input.id,
    experienceId: input.experienceId,
    attemptIndex: input.attemptIndex ?? 0,
    startSeq: input.startSeq ?? 1,
    endSeq: input.endSeq ?? 2,
    outcome: input.outcome ?? "FAILED",
    outcomeConfidence: input.outcomeConfidence ?? 0.85,
    actionSignature: input.actionSignature ?? "test FooService",
    actionTokens: input.actionTokens ?? [],
    affectedPaths: input.affectedPaths ?? [],
    affectedSymbols: input.affectedSymbols ?? [],
    commandFamilies: input.commandFamilies ?? [],
    errorBefore: input.errorBefore ?? [],
    errorAfter: input.errorAfter ?? [],
    reasonCodes: input.reasonCodes ?? ["VALIDATION_FAILED"],
    evidenceLinks: input.evidenceLinks ?? [],
    createdAt: input.createdAt ?? new Date("2026-01-01T00:00:00.000Z"),
  }
}

function evidenceEvent(
  input: Partial<FakeEvidenceEvent> & { readonly id: bigint; readonly sessionId: bigint },
): FakeEvidenceEvent {
  return {
    id: input.id,
    sessionId: input.sessionId,
    sourceEventKey: input.sourceEventKey ?? "message:1:tool_result",
    seqNo: input.seqNo ?? 1,
    subSeqNo: input.subSeqNo ?? 0,
    eventKind: input.eventKind ?? "TOOL_EXECUTION",
    operationKind: input.operationKind ?? "TEST",
    occurredAt: input.occurredAt ?? new Date("2026-01-01T00:00:00.000Z"),
    callId: input.callId ?? "call-1",
    toolName: input.toolName ?? "shell",
    pairingQuality: input.pairingQuality ?? "EXACT",
    redactedExcerpt: input.redactedExcerpt ?? null,
    pathTokens: input.pathTokens ?? [],
    errorSignatures: input.errorSignatures ?? [],
    errorCodes: input.errorCodes ?? [],
    commandFamilies: input.commandFamilies ?? [],
    rawPointer: input.rawPointer ?? { messageIndex: 1 },
    rawContentSha256: input.rawContentSha256 ?? "b".repeat(64),
    contentHash: input.contentHash ?? "a".repeat(64),
    extractorVersion: input.extractorVersion ?? "evidence-v1",
  }
}

type FakeExperience = {
  readonly id: bigint
  readonly sessionId: bigint
  readonly episodeIndex: number
  readonly sourceRevision: number
  readonly startSeq: number
  readonly endSeq: number
  readonly kind: string
  readonly title: string
  readonly taskText: string
  readonly templateSummary: string
  readonly outcome: "SUCCEEDED" | "FAILED" | "PARTIAL" | "UNKNOWN"
  readonly evidenceScore: number
  readonly evidenceLevel: string
  readonly evidenceReasonCodes: string[]
  readonly repoKey: string | null
  readonly cwd: string | null
  readonly dependencySnapshot: unknown
  readonly manifestHash: string | null
  readonly pathTokens: string[]
  readonly symbolTokens: string[]
  readonly errorSignatures: string[]
  readonly errorCodes: string[]
  readonly commandFamilies: string[]
  readonly failedAttemptCount: number
  readonly successfulAttemptCount: number
  readonly unverifiedAttemptCount: number
  readonly searchText: string
  readonly searchDocumentVersion: string
  readonly embeddingStatus: string
  readonly embeddingModel: string | null
  readonly embeddingError: string | null
  readonly embeddingReadyAt: Date | null
  readonly builderVersion: string
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly session: {
    readonly experienceBuildStatus: "PENDING" | "PROCESSING" | "READY" | "FAILED"
    readonly experienceBuilderVersion: string | null
    readonly traceRevision: number
  }
  readonly sessionExperienceBuildStatus?: "PENDING" | "PROCESSING" | "READY" | "FAILED"
  readonly sessionExperienceBuilderVersion?: string | null
  readonly sessionTraceRevision?: number
  readonly attempts: FakeAttempt[]
}

type FakeCompatibilityResult = Awaited<
  ReturnType<ConstructorParameters<typeof ExperienceSearchService>[1]["check"]>
>

type FakeSessionStatusCount = {
  readonly count: number
  readonly status: "PENDING" | "PROCESSING" | "READY" | "FAILED"
}

type FakeWorkerError = {
  readonly id: bigint
  readonly experienceBuildError: string
  readonly updatedAt: Date
}

type FakeAttempt = {
  readonly id: bigint
  readonly experienceId: bigint
  readonly attemptIndex: number
  readonly startSeq: number
  readonly endSeq: number
  readonly outcome: "SUCCEEDED" | "FAILED" | "PARTIAL" | "UNVERIFIED"
  readonly outcomeConfidence: number
  readonly actionSignature: string
  readonly actionTokens: string[]
  readonly affectedPaths: string[]
  readonly affectedSymbols: string[]
  readonly commandFamilies: string[]
  readonly errorBefore: string[]
  readonly errorAfter: string[]
  readonly reasonCodes: string[]
  readonly evidenceLinks: {
    readonly traceEventId: bigint
    readonly role:
      | "MUTATION"
      | "VALIDATION"
      | "OBSERVATION_BEFORE"
      | "OBSERVATION_AFTER"
      | "CONTEXT"
    readonly ordinal: number
  }[]
  readonly createdAt: Date
}

type FakeEvidenceEvent = {
  readonly id: bigint
  readonly sessionId: bigint
  readonly sourceEventKey: string
  readonly seqNo: number
  readonly subSeqNo: number
  readonly eventKind: "USER_MESSAGE" | "ASSISTANT_MESSAGE" | "TOOL_EXECUTION" | "SYSTEM"
  readonly operationKind:
    | "NONE"
    | "SHELL"
    | "FILE_READ"
    | "FILE_WRITE"
    | "FILE_PATCH"
    | "FILE_DELETE"
    | "SEARCH"
    | "TEST"
    | "BUILD"
    | "TYPECHECK"
    | "LINT"
    | "GIT"
    | "PACKAGE_CHANGE"
    | "OTHER"
  readonly occurredAt: Date | null
  readonly callId: string | null
  readonly toolName: string | null
  readonly pairingQuality: "EXACT" | "PARSED" | "INFERRED" | "UNKNOWN"
  readonly redactedExcerpt: string | null
  readonly pathTokens: string[]
  readonly errorSignatures: string[]
  readonly errorCodes: string[]
  readonly commandFamilies: string[]
  readonly rawPointer: unknown
  readonly rawContentSha256: string | null
  readonly contentHash: string
  readonly extractorVersion: string
}

function readEnv(
  env: Readonly<Record<string, string | undefined>>,
  key: string,
): string | undefined {
  return env[key]
}

function writeEnv(env: Record<string, string | undefined>, key: string, value: string): void {
  env[key] = value
}

function deleteEnv(env: Record<string, string | undefined>, key: string): void {
  delete env[key]
}
