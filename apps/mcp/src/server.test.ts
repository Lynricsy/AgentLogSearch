// @vitest-environment node

import { experienceDetailSchema, experienceSearchResponseSchema } from "@agent-log-search/shared"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { afterEach, describe, expect, it } from "vitest"
import { type ApiClient, ApiClientError, HISTORY_RESULT_DISCLAIMER } from "./api-client"
import { createAgentLogSearchMcpServer } from "./server"

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
const searchResponse = {
  failedAttempts: [],
  partial: [],
  successful: [experiencePayload],
  unverified: [],
}
const detailPayload = {
  ...experiencePayload,
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
}
const parsedSearchResponse = experienceSearchResponseSchema.parse(searchResponse)
const parsedDetailPayload = experienceDetailSchema.parse(detailPayload)

const closeables: Array<{ close: () => Promise<void> }> = []

describe("AgentLogSearch MCP server", () => {
  afterEach(async () => {
    await Promise.allSettled(closeables.splice(0).map((item) => item.close()))
  })

  it("lists only the read-only evidence tools", async () => {
    const { client } = await createTestClient()
    const tools = await client.listTools()

    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
      "check_failed_attempt",
      "get_experience_evidence",
      "search_engineering_history",
    ])
    expect(tools.tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true)
    expect(tools.tools.every((tool) => tool.annotations?.destructiveHint === false)).toBe(true)
    expect(tools.tools.map((tool) => tool.name)).not.toEqual(
      expect.arrayContaining(["apply_patch", "edit_file", "execute_command", "resume_agent"]),
    )
    expect(
      tools.tools.find((tool) => tool.name === "search_engineering_history")?.inputSchema
        .properties,
    ).toHaveProperty("query")
    expect(
      tools.tools.find((tool) => tool.name === "get_experience_evidence")?.inputSchema.properties,
    ).toHaveProperty("id")
  })

  it("returns disclaimer-wrapped history search content", async () => {
    const { apiClient, client } = await createTestClient()
    const result = await client.callTool({
      arguments: {
        files: ["apps/api/src/scanner/scanner-importer.ts"],
        mode: "all",
        query: "TS2322 scanner importer",
        symbols: ["ScannerImporter"],
        topK: 10,
      },
      name: "search_engineering_history",
    })

    const payload = parseTextPayload(result)
    expect(payload).toMatchObject({
      data: { successful: [{ id: "61" }] },
      disclaimer: HISTORY_RESULT_DISCLAIMER,
      kind: "experience_search",
    })
    expect(apiClient.searchRequests).toEqual(["TS2322 scanner importer"])
  })

  it("returns structured MCP tool errors with the disclaimer", async () => {
    const { client } = await createTestClient({
      searchEngineeringHistory: async () => {
        throw new ApiClientError({
          code: "experience_search_disabled",
          message: "Experience search is disabled",
          status: 503,
        })
      },
    })

    const result = await client.callTool({
      arguments: { query: "TS2322 scanner importer" },
      name: "search_engineering_history",
    })

    const payload = parseTextPayload(result)
    expect(result.isError).toBe(true)
    expect(payload).toMatchObject({
      disclaimer: HISTORY_RESULT_DISCLAIMER,
      error: {
        code: "experience_search_disabled",
        message: "Experience search is disabled",
        status: 503,
      },
      kind: "experience_search",
    })
  })
})

async function createTestClient(overrides: Partial<ApiClient> = {}) {
  const apiClient = createFakeApiClient(overrides)
  const server = createAgentLogSearchMcpServer({ apiClient })
  const client = new Client({
    name: "test-client",
    version: "0.1.0",
  })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  closeables.push(client, server)
  return { apiClient, client }
}

function createFakeApiClient(overrides: Partial<ApiClient> = {}) {
  const apiClient: ApiClient & { searchRequests: string[] } = {
    baseUrl: "http://api.test/api",
    checkFailedAttempt: async () => ({
      matches: [],
      message: null,
      risk: "none",
    }),
    getExperienceEvidence: async () => parsedDetailPayload,
    searchEngineeringHistory: async (payload) => {
      apiClient.searchRequests.push(payload.query)
      return parsedSearchResponse
    },
    searchRequests: [] as string[],
  }
  Object.assign(apiClient, overrides)
  return apiClient
}

function parseTextPayload(result: Awaited<ReturnType<Client["callTool"]>>) {
  const toolResult = result as CallToolResult
  const item = toolResult.content[0]
  if (item?.type !== "text") {
    throw new Error("Expected text MCP result content.")
  }

  return JSON.parse(item.text) as Record<string, unknown>
}
