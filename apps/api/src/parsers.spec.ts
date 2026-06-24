import { mkdtemp, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
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

  it("sanitizes database-hostile control characters from parsed message content", async () => {
    // 前提
    const filePath = await writeTempFile(
      "control-characters.json",
      JSON.stringify({
        threadId: "thread-control",
        cwd: "/workspace",
        messages: [{ role: "user", content: "hello\u0000bad\u0007\tkept\nline" }],
      }),
    )
    const source = await readDirectTextSource(filePath)

    // 操作
    const result = await registry.parse("generic-json", source)
    const session = only(result.sessions)

    // 断言
    expect(session.messages[0]?.content).toBe("hellobad\tkept\nline")
  })

  it("normalizes tool result role aliases to tool", async () => {
    // 前提：Pi 等真实历史可能把工具返回标记为 toolResult，而不是标准 tool
    const filePath = await writeTempFile(
      "tool-result-alias.jsonl",
      [
        JSON.stringify({
          type: "session",
          threadId: "thread-tool-result-alias",
          cwd: "/workspace",
          title: "Tool alias",
        }),
        JSON.stringify({
          type: "message",
          threadId: "thread-tool-result-alias",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "调用工具读取配置" }],
          },
          createdAt: "2026-01-02T03:11:00.000Z",
        }),
        JSON.stringify({
          type: "message",
          threadId: "thread-tool-result-alias",
          message: {
            role: "toolResult",
            content: [{ type: "tool_result", content: "工具返回内容" }],
          },
          createdAt: "2026-01-02T03:11:01.000Z",
        }),
      ].join("\n"),
    )
    const source = await readDirectTextSource(filePath)

    // 操作
    const result = await registry.parse("pi-jsonl", source)
    const session = only(result.sessions)

    // 断言
    expect(session.messages.map((message) => message.role)).toEqual(["assistant", "tool"])
    expect(session.messages[1]?.content).toContain("工具返回内容")
  })

  it("normalizes Claude user tool_result content to tool", async () => {
    // 前提：Claude Code 真实历史会把工具返回写成 message.role=user + content.type=tool_result
    const filePath = await writeTempFile(
      "claude-user-tool-result.jsonl",
      [
        JSON.stringify({
          type: "summary",
          sessionId: "claude-tool-result-thread",
          cwd: "/workspace/claude",
          title: "Claude tool result",
        }),
        JSON.stringify({
          type: "assistant",
          sessionId: "claude-tool-result-thread",
          message: {
            role: "assistant",
            content: [{ type: "tool_use", name: "Grep", input: { pattern: "ScannerService" } }],
          },
          createdAt: "2026-01-02T03:11:00.000Z",
        }),
        JSON.stringify({
          type: "user",
          sessionId: "claude-tool-result-thread",
          message: {
            role: "user",
            content: [{ type: "tool_result", content: "No matches found" }],
          },
          createdAt: "2026-01-02T03:11:01.000Z",
        }),
      ].join("\n"),
    )
    const source = await readDirectTextSource(filePath)

    // 操作
    const result = await registry.parse("claude-jsonl", source)
    const session = only(result.sessions)

    // 断言
    expect(session.messages.map((message) => message.role)).toEqual(["assistant", "tool"])
    expect(session.messages[1]?.content).toContain("No matches found")
  })

  it("extracts Claude tool calls and results into trace events", async () => {
    // 前提
    const source = await readTextSource("evidence/claude-tool-success.jsonl")

    // 操作
    const result = await registry.parse("claude-jsonl", source)
    const session = only(result.sessions)

    // 断言
    expect(session.messages.map((message) => message.role)).toEqual(["user", "assistant", "tool"])
    expect(session.traceEvents.map((event) => event.kind)).toEqual([
      "user_message",
      "assistant_message",
      "tool_call",
      "tool_result",
    ])
    expect(session.traceEvents.find((event) => event.kind === "tool_call")).toMatchObject({
      callId: "toolu-success-1",
      toolName: "Bash",
    })
    expect(session.traceEvents.find((event) => event.kind === "tool_result")).toMatchObject({
      callId: "toolu-success-1",
      result: { text: expect.stringContaining("Tests passed") },
    })
  })

  it("keeps Claude tool_result out of user task trace events", async () => {
    // 前提
    const source = await readTextSource("evidence/claude-tool-failed-retry.jsonl")

    // 操作
    const result = await registry.parse("claude-jsonl", source)
    const session = only(result.sessions)

    // 断言
    const userEvents = session.traceEvents.filter((event) => event.kind === "user_message")
    expect(userEvents).toHaveLength(1)
    expect(userEvents[0]).toMatchObject({ text: "Fix the failing typecheck" })
    expect(session.traceEvents.filter((event) => event.kind === "tool_result")).toHaveLength(2)
  })

  it("accepts Claude tool calls with missing tool results", async () => {
    // 前提
    const source = await readTextSource("evidence/claude-missing-tool-result.jsonl")

    // 操作
    const result = await registry.parse("claude-jsonl", source)
    const session = only(result.sessions)

    // 断言
    expect(result.errors).toEqual([])
    expect(session.traceEvents.some((event) => event.kind === "tool_call")).toBe(true)
    expect(session.traceEvents.some((event) => event.kind === "tool_result")).toBe(false)
  })

  it("parses current Codex rollout JSONL without retaining tool return bodies as calls", async () => {
    // 前提：新版 Codex JSONL 使用 session_meta + payload.type 记录
    const filePath = await writeTempFile(
      "codex-rollout.jsonl",
      [
        JSON.stringify({
          timestamp: "2026-01-02T03:10:00.000Z",
          type: "session_meta",
          payload: {
            id: "codex-rollout-thread-001",
            timestamp: "2026-01-02T03:10:00.000Z",
            cwd: "/workspace/current-codex",
            model_provider: "openai",
          },
        }),
        JSON.stringify({
          timestamp: "2026-01-02T03:11:00.000Z",
          type: "event_msg",
          payload: {
            type: "user_message",
            message: [
              "# Context from my IDE setup:",
              "",
              "## Open tabs:",
              "- scanner.service.ts: apps/api/src/scanner/scanner.service.ts",
              "",
              "## My request for Codex:",
              "帮我找一下 scanner 的入口",
            ].join("\n"),
          },
        }),
        JSON.stringify({
          timestamp: "2026-01-02T03:11:01.000Z",
          type: "response_item",
          payload: {
            type: "function_call",
            name: "shell",
            call_id: "call-1",
            arguments: '{"cmd":"rg scanner"}',
          },
        }),
        JSON.stringify({
          timestamp: "2026-01-02T03:11:02.000Z",
          type: "event_msg",
          payload: {
            type: "mcp_tool_call_end",
            call_id: "call-2",
            invocation: {
              server: "agent_logs",
              tool: "search_logs",
              arguments: { query: "scanner 入口" },
            },
            result: { Ok: { content: "SECRET_TOOL_OUTPUT_SHOULD_NOT_BE_INDEXED" } },
          },
        }),
        JSON.stringify({
          timestamp: "2026-01-02T03:11:03.000Z",
          type: "response_item",
          payload: {
            type: "function_call_output",
            call_id: "call-1",
            output: "SECRET_FUNCTION_OUTPUT",
          },
        }),
      ].join("\n"),
    )
    const source = await readDirectTextSource(filePath)

    // 操作
    const result = await registry.parse("codex-jsonl", source)
    const session = only(result.sessions)
    const searchableContent = session.messages
      .filter((message) => message.role !== "tool")
      .map((message) => message.content)
      .join("\n")

    // 断言
    expect(session.threadId).toBe("codex-rollout-thread-001")
    expect(session.cwd).toBe("/workspace/current-codex")
    expect(session.title).toBe("帮我找一下 scanner 的入口")
    expect(session.messages.map((message) => message.role)).toEqual(["user", "assistant", "tool"])
    expect(searchableContent).toContain("shell")
    expect(searchableContent).toContain("rg scanner")
    expect(searchableContent).not.toContain("SECRET_TOOL_OUTPUT_SHOULD_NOT_BE_INDEXED")
    expect(searchableContent).not.toContain("SECRET_FUNCTION_OUTPUT")
  })

  it("uses current Claude slug as the native session title", async () => {
    // 前提：当前 Claude Code JSONL 没有 summary 记录，标题存在于每条消息的 slug 字段
    const filePath = await writeTempFile(
      "claude-slug-title.jsonl",
      [
        JSON.stringify({
          type: "user",
          sessionId: "claude-slug-thread",
          cwd: "/workspace/claude-slug",
          slug: "logical-crafting-engelbart",
          message: { role: "user", content: [{ type: "text", text: "真实用户请求" }] },
          timestamp: "2026-01-02T03:11:00.000Z",
        }),
        JSON.stringify({
          type: "assistant",
          sessionId: "claude-slug-thread",
          cwd: "/workspace/claude-slug",
          slug: "logical-crafting-engelbart",
          message: {
            role: "assistant",
            model: "claude-sonnet",
            content: [{ type: "text", text: "处理完成" }],
          },
          timestamp: "2026-01-02T03:11:01.000Z",
        }),
      ].join("\n"),
    )
    const source = await readDirectTextSource(filePath)

    // 操作
    const result = await registry.parse("claude-jsonl", source)
    const session = only(result.sessions)

    // 断言
    expect(session.threadId).toBe("claude-slug-thread")
    expect(session.title).toBe("logical-crafting-engelbart")
  })

  it("derives Pi titles from the first user message when native title fields are missing", async () => {
    // 前提：当前 Pi Agent session 记录只有 id/timestamp/cwd/version，没有 title 字段
    const filePath = await writeTempFile(
      "pi-derived-title.jsonl",
      [
        JSON.stringify({
          type: "session",
          id: "pi-derived-thread",
          timestamp: "2026-01-02T03:10:00.000Z",
          cwd: "/workspace/pi-derived",
          version: "0.1.0",
        }),
        JSON.stringify({
          type: "message",
          id: "pi-message-user",
          parentId: "pi-derived-thread",
          timestamp: "2026-01-02T03:11:00.000Z",
          message: {
            role: "user",
            content: [{ type: "text", text: "测试下网络搜索工具能用吗" }],
            timestamp: "2026-01-02T03:11:00.000Z",
          },
        }),
        JSON.stringify({
          type: "message",
          id: "pi-message-assistant",
          parentId: "pi-message-user",
          timestamp: "2026-01-02T03:11:01.000Z",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "可以，我会帮你验证。" }],
            timestamp: "2026-01-02T03:11:01.000Z",
          },
        }),
      ].join("\n"),
    )
    const source = await readDirectTextSource(filePath)

    // 操作
    const result = await registry.parse("pi-jsonl", source)
    const session = only(result.sessions)

    // 断言
    expect(session.threadId).toBe("pi-derived-thread")
    expect(session.title).toBe("测试下网络搜索工具能用吗")
  })

  it("parses current OpenCode SQLite schema and keeps tool inputs without outputs", async () => {
    // 前提：新版 OpenCode 使用 session/message/part 表
    const root = await mkdtemp(join(tmpdir(), "clisearch-opencode-"))
    const databasePath = join(root, "opencode.db")
    const database = new DatabaseSync(databasePath)
    try {
      database.exec(`
        CREATE TABLE session (
          id TEXT PRIMARY KEY,
          directory TEXT NOT NULL,
          title TEXT NOT NULL,
          model TEXT,
          time_created INTEGER NOT NULL,
          time_updated INTEGER NOT NULL
        );
        CREATE TABLE message (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          time_created INTEGER NOT NULL,
          time_updated INTEGER NOT NULL,
          data TEXT NOT NULL
        );
        CREATE TABLE part (
          id TEXT PRIMARY KEY,
          message_id TEXT NOT NULL,
          session_id TEXT NOT NULL,
          time_created INTEGER NOT NULL,
          time_updated INTEGER NOT NULL,
          data TEXT NOT NULL
        );
      `)
      database
        .prepare("INSERT INTO session VALUES (?, ?, ?, ?, ?, ?)")
        .run(
          "opencode-current-thread-001",
          "/workspace/current-opencode",
          "Current OpenCode Session",
          "qwen-current",
          1760000000000,
          1760000002000,
        )
      database
        .prepare("INSERT INTO message VALUES (?, ?, ?, ?, ?)")
        .run(
          "message-user",
          "opencode-current-thread-001",
          1760000000100,
          1760000000100,
          JSON.stringify({ role: "user" }),
        )
      database
        .prepare("INSERT INTO message VALUES (?, ?, ?, ?, ?)")
        .run(
          "message-assistant",
          "opencode-current-thread-001",
          1760000000200,
          1760000000200,
          JSON.stringify({ role: "assistant", modelID: "qwen-current" }),
        )
      const insertPart = database.prepare("INSERT INTO part VALUES (?, ?, ?, ?, ?, ?)")
      insertPart.run(
        "part-user-text",
        "message-user",
        "opencode-current-thread-001",
        1760000000100,
        1760000000100,
        JSON.stringify({ type: "text", text: "请搜索 scanner service" }),
      )
      insertPart.run(
        "part-assistant-text",
        "message-assistant",
        "opencode-current-thread-001",
        1760000000200,
        1760000000200,
        JSON.stringify({ type: "text", text: "我会调用 grep 工具查找入口" }),
      )
      insertPart.run(
        "part-assistant-tool",
        "message-assistant",
        "opencode-current-thread-001",
        1760000000210,
        1760000000210,
        JSON.stringify({
          type: "tool",
          tool: "grep",
          callID: "tool-call-1",
          state: {
            status: "completed",
            input: { pattern: "ScannerService" },
            output: "SECRET_OPENCODE_TOOL_OUTPUT",
          },
        }),
      )
    } finally {
      database.close()
    }
    const source = { kind: "sqlite", filePath: databasePath, databasePath } as const

    // 操作
    const result = await registry.parse("opencode-sqlite", source)
    const session = only(result.sessions)
    const assistant = session.messages.find((message) => message.role === "assistant")

    // 断言
    expect(session.threadId).toBe("opencode-current-thread-001")
    expect(session.cwd).toBe("/workspace/current-opencode")
    expect(session.messages.map((message) => message.role)).toEqual(["user", "assistant"])
    expect(assistant?.content).toContain("grep")
    expect(assistant?.content).toContain("ScannerService")
    expect(assistant?.content).not.toContain("SECRET_OPENCODE_TOOL_OUTPUT")
    expect(result.warnings).toEqual([])
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
