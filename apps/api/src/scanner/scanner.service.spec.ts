import { createHash } from "node:crypto"
import { mkdtemp, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AgentRole } from "@agent-log-search/shared"
import { Test } from "@nestjs/testing"
import { PrismaService } from "../database/prisma.service.js"
import type { ParseResult } from "../parsers/index.js"
import { ParseFailureError, ParserRegistry } from "../parsers/index.js"
import { ChunkerService } from "../scanner/chunker.service.js"
import { ScannerConflictError, ScannerService } from "./scanner.service.js"
import { ScannerFileRunner } from "./scanner-file-runner.js"
import { fingerprintSource } from "./scanner-fingerprint.js"
import { ScannerImporter } from "./scanner-importer.js"
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
    prisma.addHistoryFile({ fileHash: fingerprint, filePath, sourceId: source.id })
    const parser = createParserFake(makeParseResult(filePath, "thread-unchanged"))
    const service = await createScanner(prisma, parser)

    // When
    const result = await service.runSource(source.id)

    // Then
    expect(result.filesDiscovered).toBe(1)
    expect(result.filesParsed).toBe(0)
    expect(parser.calls).toBe(0)
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
