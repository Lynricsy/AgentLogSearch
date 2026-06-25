import { createHash } from "node:crypto"
import { mkdtemp, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AgentRole } from "@agent-log-search/shared"
import { Test } from "@nestjs/testing"
import { PrismaService } from "../database/prisma.service.js"
import { EvidencePipelineService } from "../evidence/evidence-pipeline.service.js"
import type { ParseResult } from "../parsers/index.js"
import { ParseFailureError, ParserRegistry } from "../parsers/index.js"
import { EVIDENCE_EXTRACTOR_VERSION, TRACE_PARSER_VERSION } from "../pipeline-versions.js"
import { ChunkerService } from "../scanner/chunker.service.js"
import { ScannerConflictError, ScannerService } from "./scanner.service.js"
import { ScannerFileRunner } from "./scanner-file-runner.js"
import { fingerprintSource } from "./scanner-fingerprint.js"
import {
  DEFAULT_SCANNER_IMPORT_TRANSACTION_TIMEOUT_MS,
  ScannerImporter,
} from "./scanner-importer.js"
import { ScannerJobStore } from "./scanner-job-store.js"
import { ScannerSourceStore } from "./scanner-source-store.js"
import { createParserFake, type FakeParser, FakePrisma } from "./scanner-test-fakes.js"
import { SourceReaderRegistry } from "./source-reader-registry.js"

describe("ScannerService", () => {
  it("skips an unchanged file when its fingerprint already matches", async () => {
    // Given
    const filePath = await writeHistory("unchanged.jsonl", "same")
    const fingerprint = sha256("same")
    const prisma = createPrismaFake()
    const source = prisma.addSource({ fileGlob: "*.jsonl", rootPath: rootOf(filePath) })
    prisma.addHistoryFile({
      evidenceExtractorVersion: EVIDENCE_EXTRACTOR_VERSION,
      fileHash: fingerprint,
      filePath,
      sourceId: source.id,
      traceParserVersion: TRACE_PARSER_VERSION,
    })
    const parser = createParserFake(makeParseResult(filePath, "thread-unchanged"))
    const service = await createScanner(prisma, parser)

    // When
    const result = await service.runSource(source.id)

    // Then
    expect(result.filesDiscovered).toBe(1)
    expect(result.filesParsed).toBe(0)
    expect(parser.calls).toBe(0)
  })

  it("reimports an unchanged file when pipeline versions changed", async () => {
    // Given
    const filePath = await writeHistory("unchanged-version.jsonl", "same")
    const fingerprint = sha256("same")
    const prisma = createPrismaFake()
    const source = prisma.addSource({ fileGlob: "*.jsonl", rootPath: rootOf(filePath) })
    prisma.addHistoryFile({ fileHash: fingerprint, filePath, sourceId: source.id })
    const parser = createParserFake(makeParseResult(filePath, "thread-version"))
    const service = await createScanner(prisma, parser)

    // When
    const result = await service.runSource(source.id)
    const history = prisma.onlyHistoryFile()
    const session = prisma.onlySession()

    // Then
    expect(result.filesParsed).toBe(1)
    expect(parser.calls).toBe(1)
    expect(history.traceParserVersion).toBe(TRACE_PARSER_VERSION)
    expect(history.evidenceExtractorVersion).toBe(EVIDENCE_EXTRACTOR_VERSION)
    expect(session.traceRevision).toBe(1)
    expect(session.experienceBuildStatus).toBe("READY")
    expect(session.experienceReadyAt).toBeInstanceOf(Date)
  })

  it("reimports a changed file and replaces messages in one transaction", async () => {
    // Given
    const filePath = await writeHistory("changed.jsonl", "new content")
    const prisma = createPrismaFake()
    const source = prisma.addSource({ fileGlob: "*.jsonl", rootPath: rootOf(filePath) })
    const history = prisma.addHistoryFile({ fileHash: "old", filePath, sourceId: source.id })
    const session = prisma.addSession({
      externalThreadId: "thread-changed",
      historyFileId: history.id,
      sourceId: source.id,
    })
    prisma.addMessage({ content: "old message", seqNo: 0, sessionId: session.id })
    prisma.addChunk({
      sessionId: session.id,
      sourceId: source.id,
      chunkIndex: 0,
      startMessageSeq: 0,
      endMessageSeq: 0,
      agentName: source.sourcePreset,
      externalThreadId: "thread-changed",
      cwd: "/workspace",
      chunkText: "old chunk",
      embeddingStatus: "ready",
    })
    const service = await createScanner(
      prisma,
      createParserFake(
        makeParseResult(filePath, "thread-changed", [
          "new message 0",
          "new message 1",
          "new message 2",
          "new message 3",
          "new message 4",
          "new message 5",
          "new message 6",
          "new message 7",
          "new message 8",
        ]),
      ),
    )

    // When
    const result = await service.runSource(source.id)

    // Then
    expect(result.filesParsed).toBe(1)
    expect(result.sessionsImported).toBe(1)
    expect(result.messagesImported).toBe(9)
    expect(result.chunksCreated).toBe(1)
    expect(prisma.messagesFor(session.id).map((message) => message.content)).toEqual([
      "new message 0",
      "new message 1",
      "new message 2",
      "new message 3",
      "new message 4",
      "new message 5",
      "new message 6",
      "new message 7",
      "new message 8",
    ])
    expect(
      prisma.chunksFor(session.id).map((chunk) => ({
        chunkIndex: chunk.chunkIndex,
        startMessageSeq: chunk.startMessageSeq,
        endMessageSeq: chunk.endMessageSeq,
        embeddingStatus: chunk.embeddingStatus,
      })),
    ).toEqual([{ chunkIndex: 0, startMessageSeq: 0, endMessageSeq: 8, embeddingStatus: "pending" }])
    expect(prisma.chunksFor(session.id)[0]?.chunkText).toContain("Agent: generic")
    expect(prisma.chunksFor(session.id)[0]?.chunkText).toContain("CWD: /workspace")
    expect(prisma.chunksFor(session.id)[0]?.chunkText).toContain("Thread: thread-changed")
    expect(prisma.lastTransactionOptions()).toEqual({
      timeout: DEFAULT_SCANNER_IMPORT_TRANSACTION_TIMEOUT_MS,
    })
  })

  it("allows scanner import transaction timeout to be configured for large history files", async () => {
    // Given
    const previousTimeout = readEnv("SCANNER_IMPORT_TRANSACTION_TIMEOUT_MS")
    writeEnv("SCANNER_IMPORT_TRANSACTION_TIMEOUT_MS", "240000")
    const filePath = await writeHistory("large-import.jsonl", "new content")
    const prisma = createPrismaFake()
    const source = prisma.addSource({ fileGlob: "*.jsonl", rootPath: rootOf(filePath) })
    const service = await createScanner(
      prisma,
      createParserFake(makeParseResult(filePath, "thread-large-import", "message")),
    )

    try {
      // When
      await service.runSource(source.id)
    } finally {
      restoreEnv("SCANNER_IMPORT_TRANSACTION_TIMEOUT_MS", previousTimeout)
    }

    // Then
    expect(prisma.lastTransactionOptions()).toEqual({ timeout: 240_000 })
  })

  it("does not persist tool result messages or index tool output", async () => {
    // Given：解析结果包含用户消息、assistant 的工具调用描述、tool 返回输出和后续总结
    const filePath = await writeHistory("tool-output.jsonl", "new content")
    const prisma = createPrismaFake()
    const source = prisma.addSource({ fileGlob: "*.jsonl", rootPath: rootOf(filePath) })
    const service = await createScanner(
      prisma,
      createParserFake(
        makeParseResult(filePath, "thread-tool-output", [
          { role: "user", content: "需要读取 opencode config.json" },
          { role: "assistant", content: "调用 shell 读取 opencode config.json 里的 mcp servers" },
          { role: "tool", content: "secret tool output should never be imported" },
          { role: "assistant", content: "opencode 配置里启用了 mcp servers" },
        ]),
      ),
    )

    // When：扫描并导入文件
    const result = await service.runSource(source.id)
    const importedSession = prisma.onlySession()

    // Then：只导入非 tool 消息，工具返回既不落库也不进入 chunk
    expect(result.messagesImported).toBe(3)
    expect(
      prisma.messagesFor(importedSession.id).map((message) => ({
        role: message.role,
        content: message.content,
        seqNo: message.seqNo,
      })),
    ).toEqual([
      { role: "user", content: "需要读取 opencode config.json", seqNo: 0 },
      {
        role: "assistant",
        content: "调用 shell 读取 opencode config.json 里的 mcp servers",
        seqNo: 1,
      },
      { role: "assistant", content: "opencode 配置里启用了 mcp servers", seqNo: 3 },
    ])
    const chunkText = prisma
      .chunksFor(importedSession.id)
      .map((chunk) => chunk.chunkText)
      .join("\n")
    expect(chunkText).toContain("调用 shell 读取 opencode config.json 里的 mcp servers")
    expect(chunkText).toContain("opencode 配置里启用了 mcp servers")
    expect(chunkText).not.toContain("Tool:")
    expect(chunkText).not.toContain("secret tool output")
  })

  it("persists tool result trace metadata without storing raw secret output", async () => {
    // Given
    const filePath = await writeHistory("secret-trace.jsonl", "new content")
    const prisma = createPrismaFake()
    const source = prisma.addSource({ fileGlob: "*.jsonl", rootPath: rootOf(filePath) })
    const service = await createScanner(
      prisma,
      createParserFake({
        sessions: [
          {
            parserType: "generic-jsonl",
            sourcePath: filePath,
            threadId: "thread-secret-trace",
            cwd: "/workspace",
            title: "Secret trace",
            model: "model",
            startedAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:01:00.000Z",
            messages: [
              {
                role: "assistant",
                content: "Running command",
                model: null,
                sequence: 0,
                createdAt: null,
              },
              {
                role: "tool",
                content: "SECRET_TOKEN_SHOULD_NOT_BE_PERSISTED=super-secret-value",
                model: null,
                sequence: 1,
                createdAt: null,
              },
            ],
            traceEvents: [
              {
                kind: "tool_result",
                sourceEventKey: "tool-result-secret",
                sequence: 1,
                subSequence: 0,
                callId: "call-secret",
                rawPointer: { sourcePath: filePath, lineNumber: 2 },
                result: {
                  text: "SECRET_TOKEN_SHOULD_NOT_BE_PERSISTED=super-secret-value",
                  status: "success",
                },
              },
            ],
          },
        ],
        warnings: [],
        errors: [],
      }),
    )

    // When
    await service.runSource(source.id)
    const importedSession = prisma.onlySession()
    const persistedTrace = prisma.traceEventsFor(importedSession.id)

    // Then
    expect(prisma.messagesFor(importedSession.id).map((message) => message.role)).toEqual([
      "assistant",
    ])
    expect(String(persistedTrace[0]?.redactedExcerpt)).not.toContain(
      "SECRET_TOKEN_SHOULD_NOT_BE_PERSISTED",
    )
    expect(String(persistedTrace[0]?.facts)).not.toContain("SECRET_TOKEN_SHOULD_NOT_BE_PERSISTED")
    expect(persistedTrace[0]).toMatchObject({
      sourceEventKey: "tool-result-secret",
      redactedExcerpt: null,
    })
  })

  it("persists normalized evidence facts when evidence pipeline is enabled", async () => {
    // Given
    const previousFlag = readEnv("EVIDENCE_PIPELINE_ENABLED")
    writeEnv("EVIDENCE_PIPELINE_ENABLED", "true")
    const filePath = await writeHistory("evidence-trace.jsonl", "new content")
    const prisma = createPrismaFake()
    const source = prisma.addSource({ fileGlob: "*.jsonl", rootPath: rootOf(filePath) })
    const service = await createScanner(
      prisma,
      createParserFake({
        sessions: [
          {
            parserType: "generic-jsonl",
            sourcePath: filePath,
            threadId: "thread-evidence-trace",
            cwd: "/repo",
            title: "Evidence trace",
            model: "model",
            startedAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:01:00.000Z",
            messages: [
              {
                role: "user",
                content: "修复 failing test",
                model: null,
                sequence: 0,
                createdAt: null,
              },
            ],
            traceEvents: [
              {
                kind: "tool_call",
                sourceEventKey: "test-call",
                sequence: 1,
                subSequence: 0,
                callId: "call-test",
                toolName: "exec_command",
                rawPointer: { sourcePath: filePath, lineNumber: 2 },
                arguments: { command: "pnpm --filter api test apps/api/src/foo.spec.ts" },
              },
              {
                kind: "tool_result",
                sourceEventKey: "test-result",
                sequence: 2,
                subSequence: 0,
                callId: "call-test",
                rawPointer: { sourcePath: filePath, lineNumber: 3 },
                result: {
                  exitCode: 1,
                  status: "failed",
                  text: [
                    "FAIL apps/api/src/foo.spec.ts",
                    "TypeError: bad input",
                    "Test Suites: 1 failed, 1 total",
                    "Tests:       1 failed, 2 passed, 3 total",
                    "Process exited with code 1",
                    "SECRET_TOKEN_SHOULD_NOT_BE_PERSISTED=super-secret-value",
                  ].join("\n"),
                },
              },
              {
                kind: "tool_call",
                sourceEventKey: "patch-call",
                sequence: 3,
                subSequence: 0,
                callId: "call-patch",
                toolName: "apply_patch",
                rawPointer: { sourcePath: filePath, lineNumber: 4 },
                arguments: {
                  patch: [
                    "*** Begin Patch",
                    "*** Update File: apps/api/src/foo.ts",
                    "@@",
                    "-const a = 1",
                    "+const a = 2",
                    "*** End Patch",
                  ].join("\n"),
                },
              },
              {
                kind: "tool_result",
                sourceEventKey: "patch-result",
                sequence: 4,
                subSequence: 0,
                callId: "call-patch",
                rawPointer: { sourcePath: filePath, lineNumber: 5 },
                result: { status: "success", text: "Done" },
              },
            ],
          },
        ],
        warnings: [],
        errors: [],
      }),
    )

    try {
      // When
      await service.runSource(source.id)
    } finally {
      if (previousFlag === undefined) {
        deleteEnv("EVIDENCE_PIPELINE_ENABLED")
      } else {
        writeEnv("EVIDENCE_PIPELINE_ENABLED", previousFlag)
      }
    }

    // Then
    const importedSession = prisma.onlySession()
    const traces = prisma.traceEventsFor(importedSession.id)
    const testTrace = traces.find((trace) => trace.sourceEventKey === "test-call")
    const patchTrace = traces.find((trace) => trace.sourceEventKey === "patch-call")
    const serialized = JSON.stringify(traces, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    )

    expect(importedSession.experienceBuildStatus).toBe("PENDING")
    expect(testTrace).toMatchObject({
      operationKind: "TEST",
      pairingQuality: "EXACT",
      commandFamilies: ["test"],
      errorCodes: [],
    })
    expect(testTrace?.facts).toMatchObject({
      canonicalToolKind: "shell",
      processResult: { exitCode: 1, status: "failed" },
      testSummary: { failed: 1, passed: 2, status: "failed" },
    })
    expect(testTrace?.pathTokens).toContain("apps/api/src/foo.spec.ts")
    expect(testTrace?.redactedExcerpt).toContain("<redacted:env-secret>")
    expect(serialized).not.toContain("super-secret-value")
    expect(serialized).not.toContain("SECRET_TOKEN_SHOULD_NOT_BE_PERSISTED=super-secret-value")

    expect(patchTrace?.facts).toMatchObject({
      canonicalToolKind: "apply_patch",
      patch: {
        files: [
          {
            path: "apps/api/src/foo.ts",
            operation: "update",
            addedLines: 1,
            deletedLines: 1,
          },
        ],
      },
    })
  })

  it("marks history and scan job failed when a parser raises a typed parse failure", async () => {
    // Given
    const filePath = await writeHistory("bad.jsonl", "{bad")
    const prisma = createPrismaFake()
    const source = prisma.addSource({ fileGlob: "*.jsonl", rootPath: rootOf(filePath) })
    const service = await createScanner(
      prisma,
      createParserFake(
        new ParseFailureError({
          code: "invalid_json",
          filePath,
          line: 1,
          message: "invalid json raw details",
        }),
      ),
    )

    // When
    const result = await service.runSource(source.id)

    // Then
    expect(result.status).toBe("failed")
    expect(result.filesFailed).toBe(1)
    expect(prisma.onlyHistoryFile().parseStatus).toBe("failed")
    expect(prisma.onlyHistoryFile().errorMessage).toContain("invalid json")
  })

  it("keeps existing messages when message insert fails inside the import transaction", async () => {
    // Given
    const filePath = await writeHistory("rollback.jsonl", "new")
    const prisma = createPrismaFake()
    const source = prisma.addSource({ fileGlob: "*.jsonl", rootPath: rootOf(filePath) })
    const history = prisma.addHistoryFile({ fileHash: "old", filePath, sourceId: source.id })
    const session = prisma.addSession({
      externalThreadId: "thread-rollback",
      historyFileId: history.id,
      sourceId: source.id,
    })
    prisma.addMessage({ content: "old survives", seqNo: 0, sessionId: session.id })
    prisma.addChunk({
      sessionId: session.id,
      sourceId: source.id,
      chunkIndex: 0,
      startMessageSeq: 0,
      endMessageSeq: 0,
      agentName: source.sourcePreset,
      externalThreadId: "thread-rollback",
      cwd: "/workspace",
      chunkText: "old chunk survives",
      embeddingStatus: "ready",
    })
    prisma.failNextMessageCreateMany()
    const service = await createScanner(
      prisma,
      createParserFake(makeParseResult(filePath, "thread-rollback", "new discarded")),
    )

    // When
    const result = await service.runSource(source.id)

    // Then
    expect(result.status).toBe("failed")
    expect(prisma.messagesFor(session.id).map((message) => message.content)).toEqual([
      "old survives",
    ])
    expect(prisma.chunksFor(session.id).map((chunk) => chunk.chunkText)).toEqual([
      "old chunk survives",
    ])
  })

  it("rejects a duplicate scan for the same source while the first scan is running", async () => {
    // Given
    const filePath = await writeHistory("slow.jsonl", "slow")
    const prisma = createPrismaFake()
    const source = prisma.addSource({ fileGlob: "*.jsonl", rootPath: rootOf(filePath) })
    const parser = createParserFake(makeParseResult(filePath, "thread-slow"), 25)
    const service = await createScanner(prisma, parser)

    // When
    const running = service.runSource(source.id)
    const duplicate = service.runSource(source.id)

    // Then
    await expect(duplicate).rejects.toBeInstanceOf(ScannerConflictError)
    await running
  })

  it("fingerprints OpenCode SQLite with optional wal and shm sidecars", async () => {
    // Given
    const databasePath = await writeHistory("opencode.db", "db")
    await writeFile(`${databasePath}-wal`, "wal", "utf8")
    const source = { kind: "sqlite", filePath: databasePath, databasePath } as const

    // When
    const fingerprint = await fingerprintSource(source, "opencode-sqlite")

    // Then
    expect(fingerprint.hash).toBe(sha256("dbwal"))
    expect(fingerprint.fileSize).toBe(5n)
  })
})

async function createScanner(prisma: FakePrisma, parser: FakeParser): Promise<ScannerService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      ScannerFileRunner,
      ChunkerService,
      EvidencePipelineService,
      ScannerImporter,
      ScannerJobStore,
      ScannerService,
      ScannerSourceStore,
      { provide: PrismaService, useValue: prisma },
      { provide: ParserRegistry, useValue: parser },
      { provide: SourceReaderRegistry, useValue: SourceReaderRegistry.createDefault() },
    ],
  }).compile()
  return moduleRef.get(ScannerService)
}

function createPrismaFake(): FakePrisma {
  return new FakePrisma()
}

function makeParseResult(
  filePath: string,
  threadId: string,
  contents: readonly TestMessage[] | TestMessage = "message",
): ParseResult {
  const messages = Array.isArray(contents) ? contents : [contents]
  return {
    sessions: [
      {
        parserType: "generic-jsonl",
        sourcePath: filePath,
        threadId,
        cwd: "/workspace",
        title: "Test",
        model: "model",
        startedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:01:00.000Z",
        messages: messages.map((entry, sequence) => ({
          role: messageRole(entry),
          content: messageContent(entry),
          model: null,
          sequence,
          createdAt: null,
        })),
        traceEvents: [],
      },
    ],
    warnings: [],
    errors: [],
  }
}

type TestMessage = string | { readonly role: AgentRole; readonly content: string }

function messageRole(message: TestMessage): AgentRole {
  return typeof message === "string" ? "user" : message.role
}

function messageContent(message: TestMessage): string {
  return typeof message === "string" ? message : message.content
}

async function writeHistory(name: string, content: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "scanner-spec-"))
  const filePath = join(root, name)
  await writeFile(filePath, content, "utf8")
  await stat(filePath)
  return filePath
}

function rootOf(filePath: string): string {
  return filePath.slice(0, filePath.lastIndexOf("/"))
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function readEnv(name: string): string | undefined {
  return process.env[name]
}

function writeEnv(name: string, value: string): void {
  process.env[name] = value
}

function deleteEnv(name: string): void {
  delete process.env[name]
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    deleteEnv(name)
  } else {
    writeEnv(name, value)
  }
}
