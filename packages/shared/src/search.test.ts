import { describe, expect, it } from "vitest"
import {
  SEMANTIC_SEARCH_DEFAULTS,
  semanticSearchRequestSchema,
  semanticSearchResponseSchema,
} from "./index"

describe("semanticSearchRequestSchema", () => {
  it("parses a valid semantic search request when optional bounds are omitted", () => {
    // Given
    const payload = {
      query: "之前修过登录接口 500 的那次",
      agentName: "codex",
      cwdKeyword: "CliSearch",
    }

    // When
    const result = semanticSearchRequestSchema.parse(payload)

    // Then
    expect(result).toEqual({
      query: payload.query,
      topK: SEMANTIC_SEARCH_DEFAULTS.topK,
      sessionLimit: SEMANTIC_SEARCH_DEFAULTS.sessionLimit,
      agentName: payload.agentName,
      cwdKeyword: payload.cwdKeyword,
    })
  })

  it("rejects malformed semantic search input when query or limits are invalid", () => {
    // Given
    const payloads: readonly unknown[] = [
      { query: "" },
      { query: "valid", topK: 101 },
      { query: "valid", sessionLimit: 51 },
      { query: "valid", topK: 0 },
      { query: "valid", sessionLimit: 0 },
      { query: "a".repeat(SEMANTIC_SEARCH_DEFAULTS.maxQueryLength + 1) },
      { query: "valid", dateFrom: "2026-01-01T00:00:00.000Z" },
    ]

    // When
    const results = payloads.map((payload) => semanticSearchRequestSchema.safeParse(payload))

    // Then
    expect(results.every((result) => !result.success)).toBe(true)
  })
})

describe("semanticSearchResponseSchema", () => {
  it("parses session-level semantic results when matched chunks are present", () => {
    // Given
    const payload = {
      records: [
        {
          sessionId: "1",
          score: 0.91,
          agentName: "generic",
          cwd: "/workspace",
          threadId: "abc123",
          title: "登录接口修复",
          resumeCommand: "cd /workspace",
          messageCount: 4,
          lastMessageAt: "2026-01-02T03:04:08.000Z",
          matchedChunks: [
            {
              chunkId: "9",
              messageEndSequence: 2,
              messageStartSequence: 1,
              messages: [
                {
                  createdAt: "2026-01-02T03:04:06.000Z",
                  id: "message-1",
                  model: null,
                  parts: [
                    {
                      kind: "thinking",
                      label: "思考",
                      text: "先检查日志",
                    },
                    {
                      kind: "assistant_response",
                      label: "Agent 回复",
                      text: "登录接口返回 500",
                    },
                  ],
                  role: "assistant",
                  seqNo: 2,
                },
              ],
              metadata: {
                agentName: "generic",
                cwd: "/workspace",
                part: null,
                threadId: "abc123",
              },
              score: 0.91,
              snippet: "登录接口返回 500",
            },
          ],
        },
      ],
    }

    // When
    const result = semanticSearchResponseSchema.parse(payload)

    // Then
    expect(result.records[0]?.threadId).toBe("abc123")
    expect(result.records[0]?.matchedChunks[0]?.snippet).toContain("登录接口返回 500")
    expect(result.records[0]?.matchedChunks[0]?.messages?.[0]?.parts[0]?.kind).toBe("thinking")
  })
})
