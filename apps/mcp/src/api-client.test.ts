// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest"
import { ApiClientError, createApiClient, DEFAULT_API_BASE_URL, getApiBaseUrl } from "./api-client"

const timestamp = "2026-06-16T09:00:00.000Z"
const attemptPayload = {
  actionSignature: "run tests",
  actionTokens: ["test"],
  affectedPaths: ["apps/api/src/scanner/scanner-importer.ts"],
  affectedSymbols: ["ScannerImporter"],
  attemptIndex: 0,
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
} as const
const evidenceEventPayload = {
  callId: "call-1",
  commandFamilies: ["test"],
  contentHash: "a".repeat(64),
  errorCodes: ["TS2322"],
  errorSignatures: ["TS2322"],
  eventKind: "TOOL_EXECUTION",
  extractorVersion: "evidence-v1",
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
} as const
const experiencePayload = {
  attempts: [attemptPayload],
  commandFamilies: ["test"],
  createdAt: timestamp,
  cwd: "/repo",
  endSeq: 10,
  episodeIndex: 0,
  errorCodes: ["TS2322"],
  errorSignatures: ["TS2322"],
  evidenceEvents: [evidenceEventPayload],
  evidenceLevel: "EXACT",
  evidenceReasonCodes: ["VALIDATION_FAILED"],
  evidenceScore: 0.82,
  failedAttemptCount: 1,
  id: "61",
  kind: "code_change",
  matchedErrors: ["TS2322"],
  matchedPaths: ["apps/api/src/scanner/scanner-importer.ts"],
  operationKinds: ["TEST"],
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
} as const
const detailPayload = {
  ...experiencePayload,
  evidenceEvents: [{ ...evidenceEventPayload, facts: { exitCode: 1 } }],
  session: {
    agentName: "generic",
    cwd: "/repo",
    experienceBuildStatus: "READY",
    externalThreadId: "thread-1",
    historyFileId: "31",
    id: "21",
    lastMessageAt: timestamp,
    sourceId: "11",
    title: "修复 scanner 导入",
    traceRevision: 1,
    updatedAt: timestamp,
  },
} as const

describe("MCP API client", () => {
  afterEach(() => {
    Reflect.deleteProperty(process.env, "AGENT_LOG_SEARCH_API_BASE_URL")
    Reflect.deleteProperty(process.env, "AGENT_LOG_SEARCH_API_URL")
  })

  it("uses the local Web API proxy by default", () => {
    expect(getApiBaseUrl()).toBe(DEFAULT_API_BASE_URL)
  })

  it("normalizes configured base URLs", () => {
    const client = createApiClient({
      baseUrl: "http://127.0.0.1:3100/api/",
      fetcher: async () => new Response("{}"),
    })

    expect(client.baseUrl).toBe("http://127.0.0.1:3100/api")
  })

  it("searches engineering history through the HTTP API", async () => {
    const seenRequests: string[] = []
    const client = createApiClient({
      baseUrl: "http://api.test/api",
      fetcher: async (input, init) => {
        seenRequests.push(await requestSnapshot(input, init))
        return jsonResponse({
          failedAttempts: [],
          partial: [],
          successful: [experiencePayload],
          unverified: [],
        })
      },
    })

    const result = await client.searchEngineeringHistory({
      files: ["apps/api/src/scanner/scanner-importer.ts"],
      mode: "all",
      query: "TS2322 scanner importer",
      symbols: ["ScannerImporter"],
      topK: 10,
    })

    expect(result.successful[0]?.id).toBe("61")
    expect(seenRequests).toEqual([
      'POST http://api.test/api/experiences/search {"query":"TS2322 scanner importer","files":["apps/api/src/scanner/scanner-importer.ts"],"symbols":["ScannerImporter"],"mode":"all","topK":10}',
    ])
  })

  it("checks failed attempts through the HTTP API", async () => {
    const client = createApiClient({
      baseUrl: "http://api.test/api",
      fetcher: async () =>
        jsonResponse({
          matches: [
            {
              attempt: attemptPayload,
              evidenceEvents: [evidenceEventPayload],
              experience: {
                cwd: "/repo",
                evidenceLevel: "EXACT",
                evidenceScore: 0.82,
                id: "61",
                outcome: "FAILED",
                repoKey: "CliSearch",
                sessionId: "21",
                sourceRevision: 1,
                taskText: "修复 scanner 导入类型错误",
                title: "修复 scanner 导入",
                updatedAt: timestamp,
              },
              matchedActionTokens: ["test"],
              matchedCommandFamilies: ["test"],
              matchedErrors: ["TS2322"],
              matchedPaths: ["apps/api/src/scanner/scanner-importer.ts"],
              matchedSymbols: ["ScannerImporter"],
              message: "计划操作与一条历史失败尝试高度相似。",
              risk: "medium",
              score: 0.7,
              scoreBreakdown: {
                actionTokenMatch: 1,
                commandMatch: 1,
                finalScore: 0.7,
                pathMatch: 1,
                symbolMatch: 1,
                taskSimilarity: 0.4,
              },
            },
          ],
          message: "计划操作与一条历史失败尝试高度相似。",
          risk: "medium",
        }),
    })

    const result = await client.checkFailedAttempt({
      files: ["apps/api/src/scanner/scanner-importer.ts"],
      operationKinds: ["TEST"],
      symbols: ["ScannerImporter"],
      task: "修复 ScannerImporter 后准备运行测试",
      topK: 5,
    })

    expect(result.risk).toBe("medium")
    expect(result.matches[0]?.matchedErrors).toEqual(["TS2322"])
  })

  it("gets experience evidence by id through the HTTP API", async () => {
    const seenRequests: string[] = []
    const client = createApiClient({
      baseUrl: "http://api.test/api",
      fetcher: async (input) => {
        seenRequests.push(input instanceof Request ? input.url : String(input))
        return jsonResponse(detailPayload)
      },
    })

    const detail = await client.getExperienceEvidence("61")

    expect(detail.session.externalThreadId).toBe("thread-1")
    expect(detail.evidenceEvents[0]?.facts).toEqual({ exitCode: 1 })
    expect(seenRequests).toEqual(["http://api.test/api/experiences/61"])
  })

  it("throws typed errors for API error envelopes", async () => {
    const client = createApiClient({
      baseUrl: "http://api.test/api",
      fetcher: async () =>
        jsonResponse(
          { error: { code: "experience_not_found", message: "Experience not found" } },
          404,
        ),
    })

    await expect(client.getExperienceEvidence("404")).rejects.toMatchObject({
      code: "experience_not_found",
      message: "Experience not found",
      name: ApiClientError.name,
      status: 404,
    })
  })
})

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status,
  })
}

async function requestSnapshot(input: RequestInfo | URL, init?: RequestInit): Promise<string> {
  const request = input instanceof Request ? input : new Request(input, init)
  return `${request.method} ${request.url} ${await request.clone().text()}`
}
