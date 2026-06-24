// @vitest-environment node

import { describe, expect, it } from "vitest"

import { ApiClientError, createApiClient } from "./api"

const sourcePayload = {
  createdAt: "2026-06-16T09:00:00.000Z",
  enabled: true,
  fileGlob: "**/*.jsonl",
  id: "12",
  lastScanAt: null,
  name: "Demo source",
  parserType: "generic-jsonl",
  readerType: "file-glob",
  resumeTemplate: "cd {quoted cwd}",
  rootPath: "/tmp/demo-agent",
  scanIntervalSeconds: 300,
  sourcePreset: "generic",
  updatedAt: "2026-06-16T09:00:00.000Z",
} as const

const timestamp = "2026-06-16T09:00:00.000Z"
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
const attemptPayload = {
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
    compatibilityFactor: 0.5,
    errorMatch: 1,
    finalScore: 0.8,
    lexical: 0.5,
    pathMatch: 1,
    symbolMatch: 1,
  },
  compatibility: {
    coverage: 0.7,
    disclaimer: "该结果只表示相关工程对象仍然存在或相似，不代表历史 patch 可以直接应用。",
    files: [
      {
        currentPath: "apps/api/src/scanner/scanner-importer.ts",
        historicalPath: "apps/api/src/scanner/scanner-importer.ts",
        status: "present",
      },
    ],
    level: "LIKELY_COMPATIBLE",
    reasonCodes: ["FILES_PRESENT"],
    score: 0.88,
    snapshot: {
      branch: "main",
      capturedAt: timestamp,
      dirtyHash: "clean",
      gitHead: "a".repeat(40),
      manifestHash: null,
      quality: "unknown",
      repoKey: "CliSearch",
    },
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

describe("createApiClient", () => {
  it("uses the default API base URL when no override is provided", () => {
    const client = createApiClient({ fetcher: async () => new Response("{}") })

    expect(client.baseUrl).toBe("/api")
  })

  it("uses the configured API base URL when an override is provided", () => {
    const client = createApiClient({
      baseUrl: "http://api.test/api/",
      fetcher: async () => new Response("{}"),
    })

    expect(client.baseUrl).toBe("http://api.test/api")
  })

  it("throws a typed API client error when the server returns an error response", async () => {
    const client = createApiClient({
      baseUrl: "http://api.test/api",
      fetcher: async () =>
        new Response(JSON.stringify({ error: { code: "bad_request", message: "Invalid query" } }), {
          headers: { "content-type": "application/json" },
          status: 400,
        }),
    })

    await expect(
      client.searchSemantic({ query: "login", sessionLimit: 10, topK: 50 }),
    ).rejects.toMatchObject({
      code: "bad_request",
      message: "Invalid query",
      name: ApiClientError.name,
      status: 400,
    })
  })

  it("parses session-level semantic search responses", async () => {
    const client = createApiClient({
      baseUrl: "http://api.test/api",
      fetcher: async () =>
        new Response(
          JSON.stringify({
            records: [
              {
                agentName: "generic",
                cwd: "/workspace/clisearch-demo",
                lastMessageAt: "2026-01-02T03:04:08.000Z",
                matchedChunks: [
                  {
                    chunkId: "9",
                    messageEndSequence: 2,
                    messageStartSequence: 1,
                    messages: [
                      {
                        createdAt: "2026-01-02T03:04:06.000Z",
                        id: "10",
                        model: "demo-agent-synthetic",
                        parts: [
                          { kind: "thinking", label: "思考", text: "先检查日志" },
                          {
                            kind: "assistant_response",
                            label: "Agent 回复",
                            text: "登录接口返回 500",
                          },
                        ],
                        role: "assistant",
                        seqNo: 1,
                      },
                    ],
                    metadata: {
                      agentName: "generic",
                      cwd: "/workspace/clisearch-demo",
                      part: null,
                      threadId: "abc123",
                    },
                    score: 0.91,
                    snippet: "登录接口返回 500",
                  },
                ],
                messageCount: 4,
                resumeCommand: "cd '/workspace/clisearch-demo' && codex resume 'abc123'",
                score: 0.91,
                sessionId: "1",
                threadId: "abc123",
                title: "登录接口 500 修复演示",
              },
            ],
          }),
          { headers: { "content-type": "application/json" } },
        ),
    })

    const result = await client.searchSemantic({
      query: "之前修过登录接口 500 的那次",
      sessionLimit: 10,
      topK: 50,
    })

    expect(result.records[0]?.threadId).toBe("abc123")
    expect(result.records[0]?.matchedChunks[0]?.snippet).toContain("登录接口返回 500")
    expect(result.records[0]?.matchedChunks[0]?.messages?.[0]?.parts[0]?.kind).toBe("thinking")
  })

  it("parses session detail responses with ordered messages", async () => {
    const client = createApiClient({
      baseUrl: "http://api.test/api",
      fetcher: async () =>
        new Response(
          JSON.stringify({
            agentName: "generic",
            cwd: "/workspace/clisearch-demo",
            externalThreadId: "abc123",
            historyFileId: "1",
            id: "1",
            lastMessageAt: "2026-01-02T03:04:08.000Z",
            messageCount: 1,
            messages: [
              {
                content: "登录接口返回 500",
                createdAt: "2026-01-02T03:04:06.000Z",
                id: "10",
                model: "demo-agent-synthetic",
                parts: [
                  {
                    kind: "assistant_response",
                    label: "Agent 回复",
                    text: "登录接口返回 500",
                  },
                ],
                role: "assistant",
                seqNo: 1,
                sessionId: "1",
              },
            ],
            resumeCommand: "cd '/workspace/clisearch-demo' && codex resume 'abc123'",
            sourceId: "1",
            startedAt: "2026-01-02T03:04:05.000Z",
            title: "登录接口 500 修复演示",
            updatedAt: "2026-01-02T03:04:08.000Z",
          }),
          { headers: { "content-type": "application/json" } },
        ),
    })

    const result = await client.getSession("1")

    expect(result.externalThreadId).toBe("abc123")
    expect(result.messages[0]?.content).toContain("登录接口返回 500")
    expect(result.messages[0]?.parts?.[0]?.text).toContain("登录接口返回 500")
  })

  it("uses experience search, detail, rebuild, and check endpoints", async () => {
    const calls: { readonly method: string; readonly path: string; readonly json: unknown }[] = []
    const client = createApiClient({
      baseUrl: "http://api.test/api",
      fetcher: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init)
        const url = new URL(request.url, "http://api.test")
        const text = await request.clone().text()
        const json = text.length > 0 ? JSON.parse(text) : null
        calls.push({ json, method: request.method, path: url.pathname })

        if (url.pathname === "/api/experiences/search") {
          return new Response(
            JSON.stringify({
              failedAttempts: [experiencePayload],
              partial: [],
              successful: [],
              unverified: [],
            }),
            { headers: { "content-type": "application/json" } },
          )
        }

        if (url.pathname === "/api/experiences/61") {
          return new Response(
            JSON.stringify({
              ...experiencePayload,
              evidenceEvents: [{ ...evidenceEventPayload, facts: { operation: "test" } }],
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
            }),
            { headers: { "content-type": "application/json" } },
          )
        }

        if (url.pathname === "/api/experiences/rebuild") {
          return new Response(JSON.stringify({ affectedSessions: 2 }), {
            headers: { "content-type": "application/json" },
          })
        }

        return new Response(
          JSON.stringify({
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
                score: 0.73,
                scoreBreakdown: {
                  actionTokenMatch: 0.7,
                  commandMatch: 1,
                  finalScore: 0.73,
                  pathMatch: 1,
                  symbolMatch: 1,
                  taskSimilarity: 0.5,
                },
              },
            ],
            message: "计划操作与一条历史失败尝试高度相似。",
            risk: "medium",
          }),
          { headers: { "content-type": "application/json" } },
        )
      },
    })

    const search = await client.searchExperiences({
      query: "TS2322 scanner",
      repositoryPath: "/repo",
      topK: 10,
    })
    const detail = await client.getExperience("61")
    const rebuild = await client.rebuildExperiences({ includeReady: true })
    const check = await client.checkFailedAttempt({
      files: ["apps/api/src/scanner/scanner-importer.ts"],
      operationKinds: ["TEST"],
      task: "修复 scanner 后运行测试",
    })

    expect(search.failedAttempts[0]?.id).toBe("61")
    expect(detail.evidenceEvents[0]?.redactedExcerpt).toContain("TS2322")
    expect(rebuild.affectedSessions).toBe(2)
    expect(check.matches[0]?.message).toBe("计划操作与一条历史失败尝试高度相似。")
    expect(search.failedAttempts[0]?.compatibility?.level).toBe("LIKELY_COMPATIBLE")
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "POST /api/experiences/search",
      "GET /api/experiences/61",
      "POST /api/experiences/rebuild",
      "POST /api/experiences/check-failed-attempt",
    ])
    expect(calls[0]?.json).toMatchObject({ repositoryPath: "/repo" })
  })

  it("throws a typed API client error when the response contract is invalid", async () => {
    const client = createApiClient({
      baseUrl: "http://api.test/api",
      fetcher: async () => new Response(JSON.stringify({ records: [{ score: 2 }] })),
    })

    await expect(
      client.searchSemantic({ query: "login", sessionLimit: 10, topK: 50 }),
    ).rejects.toMatchObject({
      code: "invalid_response",
      message: "API 响应不符合预期契约。",
      name: ApiClientError.name,
      status: 0,
    })
  })

  it("parses source list array responses", async () => {
    const client = createApiClient({
      baseUrl: "http://api.test/api",
      fetcher: async () =>
        new Response(JSON.stringify([sourcePayload]), {
          headers: { "content-type": "application/json" },
        }),
    })

    const result = await client.listSources()

    expect(result[0]?.id).toBe("12")
    expect(result[0]?.name).toBe("Demo source")
  })

  it("uses source CRUD and scan endpoints with expected path, method, and JSON", async () => {
    const calls: { readonly method: string; readonly path: string; readonly json: unknown }[] = []
    const client = createApiClient({
      baseUrl: "http://api.test/api",
      fetcher: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init)
        const url = new URL(request.url, "http://api.test")
        const text = await request.clone().text()
        const json = text.length > 0 ? JSON.parse(text) : null
        calls.push({ json, method: request.method, path: url.pathname })

        if (url.pathname === "/api/sources/presets") {
          return new Response(
            JSON.stringify([
              {
                fileGlob: "**/*.jsonl",
                id: "generic-jsonl",
                label: "Generic JSONL",
                parserType: "generic-jsonl",
                readerType: "file-glob",
                resumeTemplate: "cd {quoted cwd}",
                rootPath: "~/agent-log-search/history",
                sourcePreset: "generic",
              },
            ]),
            { headers: { "content-type": "application/json" } },
          )
        }

        if (url.pathname === "/api/sources/12" && request.method === "DELETE") {
          return new Response(null, { status: 204 })
        }

        if (url.pathname === "/api/scan/run/12") {
          return new Response(
            JSON.stringify({
              records: [
                {
                  chunksCreated: 1,
                  errorMessage: null,
                  filesDiscovered: 1,
                  filesFailed: 0,
                  filesParsed: 1,
                  finishedAt: "2026-06-16T09:00:01.000Z",
                  id: "77",
                  messagesImported: 2,
                  sessionsImported: 1,
                  sourceId: "12",
                  startedAt: "2026-06-16T09:00:00.000Z",
                  status: "completed",
                },
              ],
            }),
            { headers: { "content-type": "application/json" } },
          )
        }

        return new Response(JSON.stringify(sourcePayload), {
          headers: { "content-type": "application/json" },
        })
      },
    })

    await client.listSourcePresets()
    await client.createSource({
      enabled: true,
      fileGlob: "**/*.jsonl",
      followSymlinks: false,
      maxFileSizeBytes: 5_242_880,
      maxFilesPerScan: 1_000,
      name: "Demo source",
      parserType: "generic-jsonl",
      readerType: "file-glob",
      resumeTemplate: "cd {quoted cwd}",
      rootPath: "/tmp/demo-agent",
      scanIntervalSeconds: 300,
      sourcePreset: "generic",
    })
    await client.updateSource("12", { enabled: false, name: "Disabled source" })
    await client.deleteSource("12")
    await client.runSourceScan("12")

    expect(calls).toEqual([
      { json: null, method: "GET", path: "/api/sources/presets" },
      {
        json: expect.objectContaining({ name: "Demo source", rootPath: "/tmp/demo-agent" }),
        method: "POST",
        path: "/api/sources",
      },
      {
        json: { enabled: false, name: "Disabled source" },
        method: "PATCH",
        path: "/api/sources/12",
      },
      { json: null, method: "DELETE", path: "/api/sources/12" },
      { json: null, method: "POST", path: "/api/scan/run/12" },
    ])
  })
})
