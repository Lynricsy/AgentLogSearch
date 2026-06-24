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

  it("attaches repository compatibility and applies a conservative score factor", async () => {
    const prisma = createPrismaFake({
      experiences: [
        experience({
          id: 4n,
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
      async (args: { readonly where?: { readonly id?: { readonly in: bigint[] } } }) => {
        if (args.where?.id?.in !== undefined) {
          const ids = new Set(args.where.id.in.map((id) => id.toString()))
          return input.experiences.filter((entry) => ids.has(entry.id.toString()))
        }
        return input.experiences
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
    title: "TS2339 · foo.ts",
    taskText: "修复错误",
    templateSummary: "该任务包含 1 次修改尝试；随后测试验证通过。",
    outcome: input.outcome ?? "SUCCEEDED",
    evidenceScore: input.evidenceScore ?? 0.9,
    evidenceLevel: "A",
    evidenceReasonCodes: ["HAS_TEST_SUMMARY"],
    repoKey: input.repoKey ?? null,
    cwd: "/repo",
    pathTokens: input.pathTokens ?? [],
    symbolTokens: input.symbolTokens ?? [],
    errorSignatures: [],
    errorCodes: input.errorCodes ?? [],
    commandFamilies: input.commandFamilies ?? [],
    failedAttemptCount: input.attempts?.filter((entry) => entry.outcome === "FAILED").length ?? 0,
    successfulAttemptCount: 1,
    unverifiedAttemptCount: 0,
    searchText: input.searchText ?? "",
    searchDocumentVersion: "experience-search-v1",
    embeddingStatus: input.embeddingStatus ?? "pending",
    embeddingModel: null,
    embeddingError: null,
    embeddingReadyAt: null,
    builderVersion: "experience-v1",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    session: {
      experienceBuildStatus: input.sessionExperienceBuildStatus ?? "READY",
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
    readonly traceRevision: number
  }
  readonly sessionExperienceBuildStatus?: "PENDING" | "PROCESSING" | "READY" | "FAILED"
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
