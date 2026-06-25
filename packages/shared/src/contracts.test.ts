import { describe, expect, it } from "vitest"
import {
  agentChunkSchema,
  agentMessageSchema,
  agentSessionSchema,
  apiErrorResponseSchema,
  embeddingJobRequestSchema,
  embeddingJobSummarySchema,
  embeddingStatusSchema,
  evidenceEventSummarySchema,
  experienceDetailSchema,
  experienceFailedAttemptCheckRequestSchema,
  experienceFailedAttemptCheckResponseSchema,
  experienceSearchRequestSchema,
  experienceSearchResponseSchema,
  experienceStatusResponseSchema,
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
        parts: [{ kind: "assistant_response", label: "Agent 回复", text: "Done" }],
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
    expect(parsed.message.parts?.[0]?.text).toBe("Done")
    expect(parsed.chunk.embeddingStatus).toBe("pending")
    expect(parsed.scanJob.filesParsed).toBe(1)
    expect(parsed.historyFile.parseStatus).toBe("READY")
    expect(parsed.embeddingRequest.sourceId).toBe("12")
    expect(parsed.embeddingJob.requestedBy).toBe("process")
  })

  it("parses evidence and experience search contracts without full tool output", () => {
    // Given
    const timestamp = "2026-06-16T09:00:00.000Z"
    const contentHash = "a".repeat(64)
    const event = {
      id: "51",
      sessionId: "21",
      sourceEventKey: "message:7:tool",
      seqNo: 7,
      subSeqNo: 0,
      eventKind: "TOOL_EXECUTION",
      operationKind: "TEST",
      role: "assistant",
      occurredAt: timestamp,
      callId: "call-1",
      toolName: "shell",
      pairingQuality: "EXACT",
      redactedExcerpt: "pnpm test failed with TS2322",
      pathTokens: ["apps/api/src/scanner/scanner-importer.ts"],
      errorSignatures: ["TS2322"],
      errorCodes: ["TS2322"],
      commandFamilies: ["pnpm:test"],
      rawPointer: { filePath: "/tmp/history.jsonl", messageIndex: 7 },
      rawContentSha256: contentHash,
      contentHash,
      extractorVersion: "evidence-v1",
    }
    const attempt = {
      id: "71",
      experienceId: "61",
      attemptIndex: 0,
      startSeq: 6,
      endSeq: 9,
      outcome: "FAILED",
      outcomeConfidence: 0.8,
      actionSignature: "run tests",
      actionTokens: ["test"],
      affectedPaths: ["apps/api/src/scanner/scanner-importer.ts"],
      affectedSymbols: ["ScannerImporter"],
      commandFamilies: ["pnpm:test"],
      errorBefore: ["TS2322"],
      errorAfter: ["TS2322"],
      reasonCodes: ["validation_failed"],
      evidenceLinks: [{ traceEventId: "51", role: "VALIDATION", ordinal: 0 }],
      createdAt: timestamp,
    }
    const experience = {
      id: "61",
      sessionId: "21",
      episodeIndex: 0,
      sourceRevision: 1,
      startSeq: 1,
      endSeq: 10,
      kind: "code_change",
      title: "修复 scanner 导入",
      taskText: "修复 scanner 导入类型错误",
      templateSummary: "运行测试发现 TS2322",
      outcome: "FAILED",
      evidenceScore: 0.82,
      evidenceLevel: "EXACT",
      evidenceReasonCodes: ["validation_failed"],
      matchedPaths: ["apps/api/src/scanner/scanner-importer.ts"],
      matchedErrors: ["TS2322"],
      repoKey: "CliSearch",
      cwd: "/repo",
      pathTokens: ["apps/api/src/scanner/scanner-importer.ts"],
      symbolTokens: ["ScannerImporter"],
      errorSignatures: ["TS2322"],
      errorCodes: ["TS2322"],
      commandFamilies: ["pnpm:test"],
      operationKinds: ["TEST"],
      failedAttemptCount: 1,
      successfulAttemptCount: 0,
      unverifiedAttemptCount: 0,
      scoreBreakdown: {
        dense: 0.7,
        lexical: 0.6,
        errorMatch: 1,
        pathMatch: 1,
        commandMatch: 0.8,
        evidenceFactor: 0.91,
        outcomeFactor: 1.08,
        compatibilityFactor: 0.93,
        finalScore: 0.86,
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
        reasonCodes: ["REPO_IDENTITY_MATCH", "FILES_PRESENT"],
        score: 0.88,
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
      attempts: [attempt],
      evidenceEvents: [event],
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    // When
    const request = experienceSearchRequestSchema.parse({
      query: "TS2322 scanner importer",
      files: ["apps/api/src/scanner/scanner-importer.ts"],
      repositoryPath: "/repo",
    })
    const eventSummary = evidenceEventSummarySchema.parse(event)
    const response = experienceSearchResponseSchema.parse({
      successful: [],
      failedAttempts: [experience],
      partial: [],
      unverified: [],
    })
    const detail = experienceDetailSchema.parse({
      ...experience,
      session: {
        id: "21",
        sourceId: "12",
        historyFileId: "17",
        agentName: "codex",
        externalThreadId: "thread-1",
        title: "Fix scanner",
        cwd: "/repo",
        traceRevision: 1,
        experienceBuildStatus: "READY",
        lastMessageAt: timestamp,
        updatedAt: timestamp,
      },
      evidenceEvents: [{ ...event, facts: { operation: "test" } }],
    })
    const failedAttemptCheckRequest = experienceFailedAttemptCheckRequestSchema.parse({
      task: "修复 scanner importer 后准备运行测试",
      files: ["apps/api/src/scanner/scanner-importer.ts"],
      symbols: ["ScannerImporter"],
      operationKinds: ["TEST"],
      plannedCommand: "pnpm --filter api test",
    })
    const failedAttemptCheck = experienceFailedAttemptCheckResponseSchema.parse({
      risk: "medium",
      message: "计划操作与一条历史失败尝试高度相似。",
      matches: [
        {
          risk: "medium",
          score: 0.73,
          message: "计划操作与一条历史失败尝试高度相似。",
          experience: {
            id: "61",
            sessionId: "21",
            sourceRevision: 1,
            title: "修复 scanner 导入",
            taskText: "修复 scanner 导入类型错误",
            outcome: "FAILED",
            evidenceScore: 0.82,
            evidenceLevel: "EXACT",
            repoKey: "CliSearch",
            cwd: "/repo",
            updatedAt: timestamp,
          },
          attempt,
          evidenceEvents: [event],
          matchedActionTokens: ["test"],
          matchedPaths: ["apps/api/src/scanner/scanner-importer.ts"],
          matchedSymbols: ["ScannerImporter"],
          matchedCommandFamilies: ["pnpm:test"],
          matchedErrors: ["TS2322"],
          scoreBreakdown: {
            taskSimilarity: 0.6,
            actionTokenMatch: 0.7,
            pathMatch: 1,
            symbolMatch: 1,
            commandMatch: 0.8,
            finalScore: 0.73,
          },
        },
      ],
    })
    const status = experienceStatusResponseSchema.parse({
      pendingSessions: 2,
      processingSessions: 1,
      readySessions: 3,
      failedSessions: 1,
      readyExperiences: 4,
      currentRevisionExperiences: 5,
      staleRevisionExperiences: 1,
      embeddingPending: 2,
      embeddingProcessing: 1,
      embeddingReady: 3,
      embeddingFailed: 1,
      embeddingStatuses: {
        failed: 1,
        pending: 2,
        processing: 1,
        ready: 3,
      },
      workerEnabled: true,
      searchEnabled: false,
      latestWorkerError: {
        sessionId: "21",
        message: "builder failed",
        updatedAt: timestamp,
      },
      updatedAt: timestamp,
    })

    // Then
    expect(request.topK).toBe(10)
    expect(request.mode).toBe("all")
    expect(request.repositoryPath).toBe("/repo")
    expect(eventSummary.redactedExcerpt).toContain("TS2322")
    expect(response.failedAttempts[0]?.compatibility?.level).toBe("LIKELY_COMPATIBLE")
    expect(response.failedAttempts[0]?.attempts[0]?.evidenceLinks?.[0]?.role).toBe("VALIDATION")
    expect(detail.evidenceEvents[0]).not.toHaveProperty("toolOutput")
    expect(failedAttemptCheckRequest.topK).toBe(5)
    expect(failedAttemptCheck.matches[0]?.message).toBe("计划操作与一条历史失败尝试高度相似。")
    expect(failedAttemptCheck.matches[0]?.evidenceEvents[0]).not.toHaveProperty("toolOutput")
    expect(status.readyExperiences).toBe(4)
    expect(status.latestWorkerError?.sessionId).toBe("21")
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
