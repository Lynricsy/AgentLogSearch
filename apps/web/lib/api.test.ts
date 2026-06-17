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
