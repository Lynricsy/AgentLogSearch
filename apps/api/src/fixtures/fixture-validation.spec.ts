import { AGENT_JSONL_FIXTURES } from "./fixture-metadata.js"
import {
  collectRoles,
  fixturePath,
  parseJson,
  readFixtureText,
  readJsonLines,
  requireRecord,
  validateAgentJsonlFixture,
  validateGenericSession,
  validateOpenCodeSqlite,
} from "./fixture-validation-support.js"

describe("sample-data fixture validation", () => {
  it("validates agent JSONL fixtures when read from disk", async () => {
    // 前提
    const parsedFixtures = await Promise.all(
      AGENT_JSONL_FIXTURES.map(async (fixture) => ({
        fixture,
        records: await readJsonLines(fixture.relativePath),
      })),
    )

    // 操作
    const summaries = parsedFixtures.map(({ fixture, records }) =>
      validateAgentJsonlFixture(fixture, records),
    )

    // 断言
    expect(summaries).toEqual([
      "codex/session-1.jsonl:4",
      "claude/session-1.jsonl:4",
      "pi-agent/session-1.jsonl:4",
    ])
  })

  it("validates generic JSONL, JSON, and Markdown fixtures when read from disk", async () => {
    // 前提
    const genericJsonl = await readJsonLines("generic/session-1.jsonl")
    const genericJson = requireRecord(
      parseJson(await readFixtureText("generic/session-1.json"), "generic/session-1.json"),
      "generic/session-1.json",
    )
    const markdown = await readFixtureText("generic/session-1.md")

    // 操作
    const jsonlSummary = validateGenericSession(genericJsonl[0], "generic/session-1.jsonl")
    const jsonSummary = validateGenericSession(genericJson, "generic/session-1.json")

    // 断言
    expect(jsonlSummary).toBe("generic-jsonl-thread-synthetic-001:3")
    expect(jsonSummary).toBe("generic-json-thread-synthetic-001:3")
    expect(markdown).toContain("threadId: generic-md-thread-synthetic-001")
    expect(markdown).toContain("cwd: /workspace/synthetic-generic")
    expect(markdown).toContain("title: Synthetic Generic Markdown Session")
    expect(markdown).toContain("### role: user")
    expect(markdown).toContain("### role: assistant")
    expect(markdown).toContain("### role: tool")
    expect(markdown).toContain("content: Parse a markdown transcript with synthetic content only.")
  })

  it("validates demo-agent JSONL and OpenCode SQLite fixtures when read from disk", async () => {
    // 前提
    const demoRecords = await readJsonLines("demo-agent/session-1.jsonl")
    const databasePath = fixturePath("opencode/opencode.db")

    // 操作
    const demoRoles = collectRoles(demoRecords)
    const sqliteSummary = validateOpenCodeSqlite(databasePath)

    // 断言
    expect(demoRoles).toEqual(["user", "assistant"])
    expect(sqliteSummary).toBe("opencode-thread-synthetic-001:/workspace/synthetic-opencode:3")
  })
})
