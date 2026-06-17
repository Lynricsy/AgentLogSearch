export type FixtureRole = "user" | "assistant" | "tool"

export type AgentJsonlFixture = {
  readonly relativePath: string
  readonly threadField: "threadId" | "sessionId"
  readonly threadId: string
  readonly cwd: string
  readonly model: string
  readonly resumeCommandFragment: string
}

export const AGENT_JSONL_FIXTURES = [
  {
    relativePath: "codex/session-1.jsonl",
    threadField: "threadId",
    threadId: "codex-thread-synthetic-001",
    cwd: "/workspace/synthetic-codex",
    model: "gpt-5-codex-synthetic",
    resumeCommandFragment: "codex resume codex-thread-synthetic-001",
  },
  {
    relativePath: "claude/session-1.jsonl",
    threadField: "sessionId",
    threadId: "claude-thread-synthetic-001",
    cwd: "/workspace/synthetic-claude",
    model: "claude-sonnet-synthetic",
    resumeCommandFragment: "claude --resume claude-thread-synthetic-001",
  },
  {
    relativePath: "pi-agent/session-1.jsonl",
    threadField: "threadId",
    threadId: "pi-thread-synthetic-001",
    cwd: "/workspace/synthetic-pi",
    model: "pi-agent-synthetic",
    resumeCommandFragment: "pi --session pi-thread-synthetic-001",
  },
] as const satisfies readonly AgentJsonlFixture[]

export const REQUIRED_ROLES = [
  "user",
  "assistant",
  "tool",
] as const satisfies readonly FixtureRole[]
