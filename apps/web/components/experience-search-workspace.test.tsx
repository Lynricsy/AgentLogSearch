import "@testing-library/jest-dom/vitest"
import type {
  ExperienceDetail,
  ExperienceSearchResponse,
  ExperienceSummary,
} from "@agent-log-search/shared"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { type ApiClient, ApiClientError } from "../lib/api"
import { ExperienceDetailWorkspace } from "./experience-detail-workspace"
import { ExperienceSearchWorkspace } from "./experience-search-workspace"

const timestamp = "2026-06-16T09:00:00.000Z"

afterEach(() => {
  cleanup()
})

describe("ExperienceSearchWorkspace", () => {
  it("submits an experience query and renders grouped results", async () => {
    const client = createClient({
      searchExperiences: async (payload) => {
        expect(payload).toMatchObject({
          files: [],
          mode: "all",
          query: "TS2322 scanner",
          repositoryPath: "/repo",
          symbols: [],
          topK: 10,
        })
        return {
          failedAttempts: [
            experienceSummary({
              compatibility: {
                coverage: 0.7,
                disclaimer:
                  "该结果只表示相关工程对象仍然存在或相似，不代表历史 patch 可以直接应用。",
                files: [
                  {
                    currentPath: null,
                    historicalPath: "apps/api/src/scanner/scanner-importer.ts",
                    status: "missing",
                  },
                ],
                level: "STALE",
                reasonCodes: ["ALL_FILES_MISSING"],
                score: 0.2,
                snapshot: {
                  branch: "main",
                  capturedAt: timestamp,
                  dependencies: {
                    lockfiles: [{ fileName: "pnpm-lock.yaml", kind: "pnpm" }],
                    packageManagers: ["pnpm"],
                    packageName: "api",
                    topLevelDependencyCount: 42,
                    unknownMajorVersionCount: 3,
                  },
                  dirtyHash: "clean",
                  gitHead: "a".repeat(40),
                  manifestHash: null,
                  quality: "unknown",
                  repoKey: "CliSearch",
                },
              },
              scoreBreakdown: {
                commandMatch: 1,
                compatibilityFactor: 0.5,
                errorMatch: 1,
                finalScore: 0.4,
                lexical: 0.5,
                pathMatch: 1,
                symbolMatch: 1,
              },
            }),
          ],
          partial: [],
          successful: [],
          unverified: [],
        }
      },
    })

    render(<ExperienceSearchWorkspace client={client} />)

    fireEvent.change(screen.getByLabelText("查询文本"), { target: { value: "TS2322 scanner" } })
    fireEvent.click(screen.getByText("高级证据信号"))
    fireEvent.change(screen.getByLabelText("仓库路径"), { target: { value: "/repo" } })
    fireEvent.click(screen.getByRole("button", { name: "搜索经验" }))

    expect(await screen.findByText("修复 scanner 导入")).toBeVisible()
    expect(screen.getByText("仓库兼容性")).toBeVisible()
    expect(screen.getByText("已过期")).toBeVisible()
    expect(screen.getByText("包 api")).toBeVisible()
    expect(screen.getByText("包管理器 pnpm")).toBeVisible()
    expect(screen.getByText("依赖 42 个")).toBeVisible()
    expect(
      screen.getByText("该结果只表示相关工程对象仍然存在或相似，不代表历史 patch 可以直接应用。"),
    ).toBeVisible()
    expect(screen.getByRole("heading", { name: "历史失败尝试" })).toBeVisible()
    expect(screen.getByRole("link", { name: "打开证据" })).toHaveAttribute(
      "href",
      "/experiences/61",
    )
    expect(screen.getByRole("link", { name: "原会话" })).toHaveAttribute("href", "/sessions/21")
  })

  it("shows API errors without stale result assumptions", async () => {
    render(
      <ExperienceSearchWorkspace
        client={createClient({
          searchExperiences: async () => {
            throw new ApiClientError({
              code: "experience_search_disabled",
              message: "Experience search is disabled",
              status: 503,
            })
          },
        })}
      />,
    )

    fireEvent.change(screen.getByLabelText("查询文本"), { target: { value: "TS2322 scanner" } })
    fireEvent.click(screen.getByRole("button", { name: "搜索经验" }))

    expect(await screen.findByText("Experience search is disabled")).toBeVisible()
  })
})

describe("ExperienceDetailWorkspace", () => {
  it("loads an experience detail with attempts and evidence events", async () => {
    render(
      <ExperienceDetailWorkspace
        client={createClient({ getExperience: async () => experienceDetail() })}
        experienceId="61"
      />,
    )

    expect(await screen.findByText("修复 scanner 导入")).toBeVisible()
    expect(screen.getByText("Attempt 时间线")).toBeVisible()
    expect(screen.getByText("pnpm test failed with TS2322")).toBeVisible()
    expect(screen.getByRole("link", { name: "打开原会话" })).toHaveAttribute("href", "/sessions/21")
  })
})

function createClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    baseUrl: "http://api.test/api",
    checkFailedAttempt: async () => ({ matches: [], message: null, risk: "none" }),
    createSource: async () => {
      throw new Error("not used")
    },
    deleteSource: async () => undefined,
    getExperience: async () => experienceDetail(),
    getSession: async () => {
      throw new Error("not used")
    },
    listScanJobs: async () => ({ items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0 }),
    listSourcePresets: async () => [],
    listSources: async () => [],
    rebuildExperiences: async () => ({ affectedSessions: 0 }),
    runSourceScan: async () => ({ records: [] }),
    searchExperiences: async (): Promise<ExperienceSearchResponse> => ({
      failedAttempts: [],
      partial: [],
      successful: [],
      unverified: [],
    }),
    searchSemantic: async () => ({ records: [] }),
    updateSource: async () => {
      throw new Error("not used")
    },
    ...overrides,
  }
}

function experienceSummary(overrides: Partial<ExperienceSummary> = {}): ExperienceSummary {
  return {
    attempts: [
      {
        actionSignature: "run tests",
        actionTokens: ["test"],
        affectedPaths: ["apps/api/src/scanner/scanner-importer.ts"],
        affectedSymbols: ["ScannerImporter"],
        commandFamilies: ["test"],
        createdAt: timestamp,
        endSeq: 9,
        errorAfter: ["TS2322"],
        errorBefore: ["TS2322"],
        evidenceLinks: [{ ordinal: 0, role: "VALIDATION", traceEventId: "51" }],
        experienceId: "61",
        id: "71",
        outcome: "FAILED",
        outcomeConfidence: 0.8,
        reasonCodes: ["VALIDATION_FAILED"],
        startSeq: 6,
        attemptIndex: 0,
      },
    ],
    commandFamilies: ["test"],
    createdAt: timestamp,
    cwd: "/repo",
    endSeq: 10,
    errorCodes: ["TS2322"],
    errorSignatures: ["TS2322"],
    evidenceEvents: [],
    evidenceLevel: "EXACT",
    evidenceReasonCodes: ["VALIDATION_FAILED"],
    evidenceScore: 0.82,
    failedAttemptCount: 1,
    id: "61",
    kind: "code_change",
    matchedErrors: ["TS2322"],
    matchedPaths: ["apps/api/src/scanner/scanner-importer.ts"],
    outcome: "FAILED",
    pathTokens: ["apps/api/src/scanner/scanner-importer.ts"],
    repoKey: "CliSearch",
    scoreBreakdown: {
      commandMatch: 1,
      errorMatch: 1,
      finalScore: 0.8,
      lexical: 0.5,
      pathMatch: 1,
      symbolMatch: 1,
    },
    sessionId: "21",
    sourceRevision: 1,
    startSeq: 1,
    successfulAttemptCount: 0,
    symbolTokens: ["ScannerImporter"],
    taskText: "修复 scanner 导入类型错误",
    templateSummary: "运行测试发现 TS2322",
    title: "修复 scanner 导入",
    unverifiedAttemptCount: 0,
    updatedAt: timestamp,
    episodeIndex: 0,
    ...overrides,
  }
}

function experienceDetail(): ExperienceDetail {
  return {
    ...experienceSummary(),
    evidenceEvents: [
      {
        callId: "call-1",
        commandFamilies: ["test"],
        contentHash: "a".repeat(64),
        errorCodes: ["TS2322"],
        errorSignatures: ["TS2322"],
        eventKind: "TOOL_EXECUTION",
        extractorVersion: "evidence-v1",
        facts: { operation: "test" },
        id: "51",
        occurredAt: timestamp,
        operationKind: "TEST",
        pairingQuality: "EXACT",
        pathTokens: ["apps/api/src/scanner/scanner-importer.ts"],
        rawContentSha256: "b".repeat(64),
        rawPointer: { messageIndex: 7 },
        redactedExcerpt: "pnpm test failed with TS2322",
        seqNo: 7,
        sessionId: "21",
        sourceEventKey: "message:7:tool",
        subSeqNo: 0,
        toolName: "shell",
      },
    ],
    session: {
      agentName: "codex",
      cwd: "/repo",
      experienceBuildStatus: "READY",
      externalThreadId: "thread-1",
      historyFileId: "17",
      id: "21",
      lastMessageAt: timestamp,
      sourceId: "12",
      title: "Fix scanner",
      traceRevision: 1,
      updatedAt: timestamp,
    },
  }
}
