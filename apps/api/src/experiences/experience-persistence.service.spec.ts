import { ExperienceBuildStatus } from "@prisma/client"
import type { RepositorySnapshot } from "../repositories/repository.types.js"
import type { RepositorySnapshotService } from "../repositories/repository-snapshot.service.js"
import { ExperiencePersistenceService } from "./experience-persistence.service.js"

describe("ExperiencePersistenceService", () => {
  it("persists the repository manifest hash on built experiences", async () => {
    const prisma = createPrismaFake()
    const repositories = createRepositorySnapshots({
      manifestHash: "1".repeat(64),
      repoKey: "repo-key",
    })
    const service = new ExperiencePersistenceService(prisma, repositories)

    const count = await service.buildAndPersistSession(10n, 3)

    expect(count).toBe(1)
    expect(repositories.snapshot).toHaveBeenCalledWith("/repo")
    expect(prisma.agentExperience.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cwd: "/repo",
          manifestHash: "1".repeat(64),
          repoKey: "repo-key",
        }),
      }),
    )
    expect(prisma.agentSession.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          experienceBuildStatus: ExperienceBuildStatus.READY,
          experienceBuildError: null,
        }),
        where: { id: 10n },
      }),
    )
  })
})

function createPrismaFake() {
  const session = {
    cwd: "/repo",
    experienceBuildStatus: ExperienceBuildStatus.PROCESSING,
    id: 10n,
    traceEvents: [
      traceEvent(0, "user-0", "USER_MESSAGE", "NONE", { redactedExcerpt: "修复测试" }),
      traceEvent(1, "patch-1", "TOOL_EXECUTION", "FILE_PATCH", {
        facts: {
          patch: { files: [{ operation: "update", path: "apps/api/src/foo.ts" }] },
        },
        pathTokens: ["apps/api/src/foo.ts"],
      }),
      traceEvent(2, "test-1", "TOOL_EXECUTION", "TEST", {
        commandFamilies: ["test"],
        facts: {
          commands: [{ family: "test", operationKind: "TEST", scope: "targeted" }],
          processResult: { exitCode: 0, status: "succeeded" },
          testSummary: { failed: 0, passed: 3, status: "succeeded" },
        },
      }),
    ],
    traceRevision: 3,
  }
  type PrismaFake = {
    readonly $transaction: jest.Mock
    readonly agentAttempt: { readonly create: jest.Mock }
    readonly agentAttemptEvidence: { readonly createMany: jest.Mock }
    readonly agentExperience: { readonly create: jest.Mock; readonly deleteMany: jest.Mock }
    readonly agentSession: { readonly findUnique: jest.Mock; readonly update: jest.Mock }
    readonly agentTraceEvent: { readonly findMany: jest.Mock }
  }
  const prisma: PrismaFake = {
    $transaction: jest.fn(async (callback: (tx: PrismaFake) => Promise<unknown>) =>
      callback(prisma),
    ),
    agentAttempt: {
      create: jest.fn(async () => ({ id: 42n })),
    },
    agentAttemptEvidence: {
      createMany: jest.fn(),
    },
    agentExperience: {
      create: jest.fn(async () => ({ id: 21n })),
      deleteMany: jest.fn(),
    },
    agentSession: {
      findUnique: jest.fn(async () => session),
      update: jest.fn(async () => session),
    },
    agentTraceEvent: {
      findMany: jest.fn(async () =>
        session.traceEvents.map((event, index) => ({
          id: BigInt(index + 1),
          sourceEventKey: event.sourceEventKey,
        })),
      ),
    },
  }
  return prisma as unknown as ConstructorParameters<typeof ExperiencePersistenceService>[0] & {
    readonly agentExperience: { readonly create: jest.Mock }
    readonly agentSession: { readonly update: jest.Mock }
  }
}

function createRepositorySnapshots(input: {
  readonly manifestHash: string
  readonly repoKey: string
}): RepositorySnapshotService & { readonly snapshot: jest.Mock } {
  return {
    snapshot: jest.fn(
      async () =>
        ({
          branch: "main",
          capturedAt: "2026-01-01T00:00:00.000Z",
          dependencies: null,
          dirtyHash: "clean",
          gitHead: "a".repeat(40),
          manifestHash: input.manifestHash,
          quality: "unknown",
          repoKey: input.repoKey,
          rootPath: "/repo",
        }) satisfies RepositorySnapshot,
    ),
  } as unknown as RepositorySnapshotService & { readonly snapshot: jest.Mock }
}

function traceEvent(
  seqNo: number,
  sourceEventKey: string,
  eventKind: "USER_MESSAGE" | "TOOL_EXECUTION",
  operationKind: "NONE" | "FILE_PATCH" | "TEST",
  input: {
    readonly commandFamilies?: readonly string[]
    readonly facts?: Record<string, unknown>
    readonly pathTokens?: readonly string[]
    readonly redactedExcerpt?: string | null
  } = {},
) {
  return {
    callId: null,
    commandFamilies: input.commandFamilies ?? [],
    contentHash: "a".repeat(64),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    errorCodes: [],
    errorSignatures: [],
    eventKind,
    extractorVersion: "evidence-v1",
    facts: input.facts ?? {},
    id: BigInt(seqNo + 1),
    occurredAt: null,
    operationKind,
    pairingQuality: "EXACT",
    pathTokens: input.pathTokens ?? [],
    rawContentSha256: null,
    rawPointer: { sourcePath: "fixture.jsonl", lineNumber: seqNo + 1 },
    redactedExcerpt: input.redactedExcerpt ?? null,
    seqNo,
    sessionId: 10n,
    sourceEventKey,
    subSeqNo: 0,
    toolName: null,
  }
}
