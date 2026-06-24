import { resolve } from "node:path"
import { type FixtureShapeInventoryEntry, inspectAgentFixtures } from "./fixture-shape-inventory.js"

const SAMPLE_DATA_ROOT = resolve(process.cwd(), "../../sample-data")

describe("inspectAgentFixtures", () => {
  it("summarizes supported fixture shapes without retaining fixture body text", async () => {
    // 操作
    const inventory = await inspectAgentFixtures(SAMPLE_DATA_ROOT)
    const codex = findFixture(inventory.fixtures, "codex-jsonl")
    const claude = findFixture(inventory.fixtures, "claude-jsonl")
    const opencode = findFixture(inventory.fixtures, "opencode-sqlite")
    const serialized = JSON.stringify(inventory)

    // 断言
    expect(codex.recordTypeCounts).toEqual({ message: 3, session: 1 })
    expect(codex.contentBlockTypeCounts).toMatchObject({
      text: 2,
      tool_call: 1,
      tool_result: 1,
    })
    expect(codex.possibleExitCodeFields).toEqual(["content[].exitCode"])
    expect(claude.callIdFields).toContain("message.content[].id")
    expect(claude.resultIdFields).toContain("message.content[].tool_use_id")
    expect(opencode.opencodeTables).toEqual({
      messages: [
        "content",
        "content_type",
        "created_at",
        "id",
        "model",
        "role",
        "sequence",
        "session_id",
      ],
      sessions: ["created_at", "cwd", "id", "model", "resume_command", "title"],
    })
    expect(serialized).not.toContain("synthetic-codex-fixture")
    expect(serialized).not.toContain("synthetic file summary")
    expect(serialized).not.toContain("生产环境登录接口返回 500")
  })
})

function findFixture(
  fixtures: readonly FixtureShapeInventoryEntry[],
  parserType: string,
): FixtureShapeInventoryEntry {
  const fixture = fixtures.find((entry) => entry.parserType === parserType)
  if (fixture === undefined) {
    throw new Error(`Missing fixture inventory: ${parserType}`)
  }
  return fixture
}
