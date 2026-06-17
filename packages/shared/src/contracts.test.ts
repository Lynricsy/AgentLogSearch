import { describe, expect, it } from "vitest"
import {
  agentChunkSchema,
  agentMessageSchema,
  agentSessionSchema,
  apiErrorResponseSchema,
  embeddingJobRequestSchema,
  embeddingJobSummarySchema,
  embeddingStatusSchema,
  historyFileSchema,
  parseStatusSchema,
  scanJobSchema,
  scanJobsResponseSchema,
  scanRunResponseSchema,
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
        parseStatus: "READY",
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
        resumeCommand: "cd /repo && codex resume thread-1",
        messageCount: 1,
        lastMessageAt: timestamp,
        startedAt: timestamp,
        updatedAt: timestamp,
      }),
      message: agentMessageSchema.parse({
        id: "message-1",
        sessionId: "session-1",
        role: "assistant",
        content: "Done",
        model: "gpt-5",
        seqNo: 1,
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
        source: {
          id: "source-1",
          name: "Codex local",
          sourcePreset: "codex",
          parserType: "codex-jsonl",
        },
        status: "completed",
        filesDiscovered: 1,
        filesParsed: 1,
        filesFailed: 0,
        sessionsImported: 1,
        messagesImported: 2,
        chunksCreated: 1,
        errorMessage: null,
        createdAt: timestamp,
        startedAt: timestamp,
        finishedAt: timestamp,
      }),
      embeddingRequest: embeddingJobRequestSchema.parse({ sourceId: "12" }),
      embeddingJob: embeddingJobSummarySchema.parse({
        id: "1",
        sourceId: "12",
        status: "completed",
        requestedBy: "process",
        totalChunks: 2,
        processedChunks: 2,
        failedChunks: 0,
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
    expect(parsed.historyFile.parseStatus).toBe("READY")
    expect(parsed.embeddingRequest.sourceId).toBe("12")
    expect(parsed.embeddingJob.requestedBy).toBe("process")
  })

  it("parses scan job list responses with records and pagination metadata", () => {
    // Given
    const timestamp = "2026-06-16T09:00:00.000Z"
    const payload = {
      records: [
        {
          id: "scan-1",
          sourceId: null,
          source: null,
          status: "failed",
          filesDiscovered: 1,
          filesParsed: 0,
          filesFailed: 1,
          sessionsImported: 0,
          messagesImported: 0,
          chunksCreated: 0,
          errorMessage: "parse failed",
          createdAt: timestamp,
          startedAt: timestamp,
          finishedAt: timestamp,
        },
      ],
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
      },
    }

    // When
    const parsed = scanJobsResponseSchema.parse(payload)

    // Then
    expect(parsed.records[0]?.status).toBe("failed")
    expect(parsed.pagination.totalItems).toBe(1)
  })

  it("parses manual scan run responses", () => {
    // Given
    const timestamp = "2026-06-16T09:00:00.000Z"

    // When
    const parsed = scanRunResponseSchema.parse({
      records: [
        {
          id: "scan-1",
          sourceId: "source-1",
          status: "completed",
          filesDiscovered: 1,
          filesParsed: 1,
          filesFailed: 0,
          sessionsImported: 1,
          messagesImported: 2,
          chunksCreated: 1,
          errorMessage: null,
          startedAt: timestamp,
          finishedAt: timestamp,
        },
      ],
    })

    // Then
    expect(parsed.records[0]?.status).toBe("completed")
    expect(parsed.records[0]?.sessionsImported).toBe(1)
  })

  it("rejects malformed embedding status and API error payloads", () => {
    // Given
    const invalidEmbeddingStatus = "complete"
    const invalidParseStatus = "completed"
    const invalidApiError = { error: { code: "", message: "" } }
    const invalidEmbeddingRequest = { sourceId: "abc" }

    // When
    const embeddingResult = embeddingStatusSchema.safeParse(invalidEmbeddingStatus)
    const parseStatusResult = parseStatusSchema.safeParse(invalidParseStatus)
    const errorResult = apiErrorResponseSchema.safeParse(invalidApiError)
    const embeddingRequestResult = embeddingJobRequestSchema.safeParse(invalidEmbeddingRequest)

    // Then
    expect(embeddingResult.success).toBe(false)
    expect(parseStatusResult.success).toBe(false)
    expect(errorResult.success).toBe(false)
    expect(embeddingRequestResult.success).toBe(false)
  })
})
