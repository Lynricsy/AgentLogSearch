import { createHash } from "node:crypto"
import { mkdtemp, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Test } from "@nestjs/testing"
import { PrismaService } from "../database/prisma.service.js"
import type { ParseResult } from "../parsers/index.js"
import { ParseFailureError, ParserRegistry } from "../parsers/index.js"
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
    const service = await createScanner(
      prisma,
      createParserFake(makeParseResult(filePath, "thread-changed", "new message")),
    )

    // When
    const result = await service.runSource(source.id)

    // Then
    expect(result.filesParsed).toBe(1)
    expect(result.sessionsImported).toBe(1)
    expect(result.messagesImported).toBe(1)
    expect(prisma.messagesFor(session.id).map((message) => message.content)).toEqual([
      "new message",
    ])
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

function makeParseResult(filePath: string, threadId: string, content = "message"): ParseResult {
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
        messages: [{ role: "user", content, model: null, sequence: 0, createdAt: null }],
      },
    ],
    warnings: [],
    errors: [],
  }
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
