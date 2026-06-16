import { describe, expect, it } from "vitest"
import {
  agentChunkSchema,
  agentMessageSchema,
  agentSessionSchema,
  apiErrorResponseSchema,
  embeddingStatusSchema,
  historyFileSchema,
  scanJobSchema,
} from "./index"

describe("shared domain contracts", () => {
  it("parses session, message, chunk, history file, and scan job payloads", () => {
    // Given
    const timestamp = "2026-06-16T09:00:00.000Z"

    // When
    const parsed = {
      historyFile: historyFileSchema.parse({
        id: "file-1",
        sourceId: "source-1",
        filePath: "/tmp/history.jsonl",
        fileHash: "sha256:abc",
        fileSize: 128,
        modifiedAt: timestamp,
        lastScannedAt: timestamp,
        parseStatus: "completed",
        errorMessage: null,
      }),
      session: agentSessionSchema.parse({
        id: "session-1",
        sourceId: "source-1",
        historyFileId: "file-1",
        agentName: "codex",
        externalThreadId: "thread-1",
        cwd: "/repo",
        title: "Fix login",
        startedAt: timestamp,
        updatedAt: timestamp,
      }),
      message: agentMessageSchema.parse({
        id: "message-1",
        sessionId: "session-1",
        role: "assistant",
        content: "Done",
        model: "gpt-5",
        sequence: 1,
        createdAt: timestamp,
      }),
      chunk: agentChunkSchema.parse({
        id: "chunk-1",
        sessionId: "session-1",
        sourceId: "source-1",
        text: "assistant: Done",
        messageStartSequence: 1,
        messageEndSequence: 1,
        embeddingStatus: "pending",
        tokenEstimate: 4,
      }),
      scanJob: scanJobSchema.parse({
        id: "scan-1",
        sourceId: "source-1",
        status: "completed",
        filesDiscovered: 1,
        filesParsed: 1,
        filesFailed: 0,
        errorMessage: null,
        createdAt: timestamp,
        startedAt: timestamp,
        finishedAt: timestamp,
      }),
    }

    // Then
    expect(parsed.session.externalThreadId).toBe("thread-1")
    expect(parsed.message.role).toBe("assistant")
    expect(parsed.chunk.embeddingStatus).toBe("pending")
    expect(parsed.scanJob.filesParsed).toBe(1)
    expect(parsed.historyFile.parseStatus).toBe("completed")
  })

  it("rejects malformed embedding status and API error payloads", () => {
    // Given
    const invalidEmbeddingStatus = "complete"
    const invalidApiError = { error: { code: "", message: "" } }

    // When
    const embeddingResult = embeddingStatusSchema.safeParse(invalidEmbeddingStatus)
    const errorResult = apiErrorResponseSchema.safeParse(invalidApiError)

    // Then
    expect(embeddingResult.success).toBe(false)
    expect(errorResult.success).toBe(false)
  })
})
