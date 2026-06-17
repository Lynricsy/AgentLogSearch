import { stat } from "node:fs/promises"
import { basename, resolve } from "node:path"
import {
  FileGlobSourceReader,
  ParseFailureError,
  ParserRegistry,
  SqliteSourceReader,
} from "./parsers/index.js"
import {
  assertFixtureSession,
  FIXTURE_CASES,
  only,
  readDirectTextSource,
  readSqliteSource,
  readTextSource,
  SAMPLE_DATA_ROOT,
  sha256,
  writeTempFile,
} from "./parsers-test-support.js"

describe("parsers fixture coverage", () => {
  const registry = ParserRegistry.createDefault()

  it("registers every supported parser type", () => {
    // 前提
    const expected = [
      "codex-jsonl",
      "claude-jsonl",
      "pi-jsonl",
      "opencode-sqlite",
      "generic-jsonl",
      "generic-json",
      "generic-markdown",
    ] as const

    // 操作
    const parserTypes = registry.listTypes()

    // 断言
    expect(parserTypes).toEqual(expected)
  })

  it.each(FIXTURE_CASES)(
    "parses $parserType fixture into one normalized session",
    async (fixture) => {
      // 前提
      const source = await readTextSource(fixture.relativePath)

      // 操作
      const result = await registry.parse(fixture.parserType, source)
      const session = only(result.sessions)

      // 断言
      assertFixtureSession(session, fixture)
      expect(result.warnings).toEqual([])
      expect(result.errors).toEqual([])
    },
  )

  it("parses OpenCode SQLite fixture without mutating the database file", async () => {
    // 前提
    const source = await readSqliteSource("opencode/opencode.db")
    const before = await stat(source.databasePath)

    // 操作
    const result = await registry.parse("opencode-sqlite", source)
    const after = await stat(source.databasePath)
    const session = only(result.sessions)

    // 断言
    assertFixtureSession(session, {
      parserType: "opencode-sqlite",
      relativePath: "opencode/opencode.db",
      threadId: "opencode-thread-synthetic-001",
      cwd: "/workspace/synthetic-opencode",
      title: "Synthetic OpenCode Session",
      model: "opencode-synthetic-model",
      contentSnippets: [
        "Open the synthetic project",
        "OpenCode fixture stores cwd",
        "synthetic-opencode-fixture",
      ],
    })
    expect(after.size).toBe(before.size)
    expect(after.mtimeMs).toBe(before.mtimeMs)
    expect(result.warnings).toEqual([])
    expect(result.errors).toEqual([])
  })

  it("uses fallback thread id, allows missing cwd, and skips empty content", async () => {
    // 前提
    const filePath = await writeTempFile(
      "missing-thread.json",
      JSON.stringify({
        title: "Synthetic Missing Fields",
        messages: [
          { role: "user", content: "", createdAt: "2026-01-02T03:11:00.000Z" },
          { role: "assistant", content: "Kept synthetic content" },
        ],
      }),
    )
    const source = await readDirectTextSource(filePath)

    // 操作
    const result = await registry.parse("generic-json", source)
    const session = only(result.sessions)

    // 断言
    expect(session.threadId).toBe(sha256(filePath))
    expect(session.cwd).toBeNull()
    expect(session.messages).toHaveLength(1)
    expect(session.messages[0]?.sequence).toBe(0)
    expect(session.messages[0]?.content).toBe("Kept synthetic content")
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      "missing_thread_id",
      "missing_cwd",
      "empty_content_skipped",
    ])
    expect(result.errors).toEqual([])
  })

  it("throws a typed parse failure for invalid generic JSONL lines", async () => {
    // 前提
    const filePath = await writeTempFile("invalid.jsonl", '{"threadId":"ok"}\n{invalid')
    const source = await readDirectTextSource(filePath)

    // 操作 / 断言
    await expect(registry.parse("generic-jsonl", source)).rejects.toBeInstanceOf(ParseFailureError)
    await expect(registry.parse("generic-jsonl", source)).rejects.toMatchObject({
      code: "invalid_json",
      filePath,
      line: 2,
    })
  })

  it("rejects OpenCode SQLite parser when it receives a text source", async () => {
    // 前提
    const source = await readTextSource("generic/session-1.json")

    // 操作 / 断言
    await expect(registry.parse("opencode-sqlite", source)).rejects.toBeInstanceOf(
      ParseFailureError,
    )
    await expect(registry.parse("opencode-sqlite", source)).rejects.toMatchObject({
      code: "wrong_source_kind",
      filePath: source.filePath,
    })
  })

  it("rejects text parsers when they receive a SQLite source", async () => {
    // 前提
    const source = await readSqliteSource("opencode/opencode.db")

    // 操作 / 断言
    await expect(registry.parse("generic-json", source)).rejects.toBeInstanceOf(ParseFailureError)
    await expect(registry.parse("generic-json", source)).rejects.toMatchObject({
      code: "wrong_source_kind",
      filePath: source.filePath,
    })
  })
})

describe("parsers source readers", () => {
  it("reads explicit file-glob roots as text parser sources", async () => {
    // 前提
    const reader = new FileGlobSourceReader()

    // 操作
    const sources = await reader.read({
      rootPath: resolve(SAMPLE_DATA_ROOT, "generic"),
      fileGlob: "*.{jsonl,json,md}",
    })

    // 断言
    expect(sources.map((source) => basename(source.filePath))).toEqual([
      "session-1.json",
      "session-1.jsonl",
      "session-1.md",
    ])
    expect(sources.map((source) => source.kind)).toEqual(["text", "text", "text"])
    expect(sources[0]?.content).toContain("Synthetic Generic")
  })

  it("reads explicit SQLite roots as read-only SQLite parser sources", async () => {
    // 前提
    const reader = new SqliteSourceReader()

    // 操作
    const sources = await reader.read({
      rootPath: resolve(SAMPLE_DATA_ROOT, "opencode"),
      fileGlob: "opencode.db",
    })

    // 断言
    const source = only(sources)
    expect(source.kind).toBe("sqlite")
    expect(source.databasePath).toBe(resolve(SAMPLE_DATA_ROOT, "opencode/opencode.db"))
  })
})
