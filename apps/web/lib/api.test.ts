// @vitest-environment node

import { describe, expect, it } from "vitest"

import { ApiClientError, createApiClient } from "./api"

describe("createApiClient", () => {
  it("uses the default API base URL when no override is provided", () => {
    const client = createApiClient({ fetcher: async () => new Response("{}") })

    expect(client.baseUrl).toBe("http://localhost:3001/api")
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
      message: "API response did not match the expected contract.",
      name: ApiClientError.name,
      status: 0,
    })
  })
})
