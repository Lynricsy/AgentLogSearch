import "@testing-library/jest-dom/vitest"
import type { AgentMessage, AgentSessionDetail } from "@agent-log-search/shared"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { type ApiClient, ApiClientError } from "../lib/api"
import { SessionDetailWorkspace } from "./session-detail-workspace"

const baseSession: AgentSessionDetail = {
  agentName: "generic",
  cwd: "/workspace/clisearch-demo",
  externalThreadId: "abc123",
  historyFileId: "history-1",
  id: "session-1",
  lastMessageAt: "2026-06-15T10:03:00.000Z",
  messageCount: 5,
  messages: [
    createMessage({
      content: "生产环境登录接口返回 500，用户无法登录，请帮我排查。",
      id: "message-user",
      role: "user",
      seqNo: 1,
    }),
    createMessage({
      content: "已定位到登录接口返回 500 的原因。",
      id: "message-assistant",
      role: "assistant",
      seqNo: 2,
    }),
    createMessage({ content: "tool output", id: "message-tool", role: "tool", seqNo: 3 }),
    createMessage({ content: "system prompt", id: "message-system", role: "system", seqNo: 4 }),
    createMessage({ content: "unknown event", id: "message-unknown", role: "unknown", seqNo: 5 }),
  ],
  resumeCommand: "cd '/workspace/clisearch-demo' && codex resume 'abc123'",
  sourceId: "source-1",
  startedAt: "2026-06-15T10:00:00.000Z",
  title: "登录接口 500 修复演示",
  updatedAt: "2026-06-15T10:04:00.000Z",
}

const unsafeSession: AgentSessionDetail = {
  ...baseSession,
  cwd: `</code><script>globalThis.dispatchEvent(new Event("session-xss"))</script>/tmp`,
  messages: [
    createMessage({
      content: `<img src=x onerror=globalThis.dispatchEvent(new Event("session-xss"))>`,
      id: "unsafe-message",
      role: "assistant",
      seqNo: 1,
    }),
  ],
  resumeCommand: `codex resume '<script>globalThis.dispatchEvent(new Event("session-xss"))</script>'`,
  title: `<img src=x onerror=globalThis.dispatchEvent(new Event("session-xss"))> unsafe title`,
}

describe("SessionDetailWorkspace", () => {
  afterEach(() => {
    cleanup()
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    })
  })

  it("loads a session and renders role bubbles, metadata, and copyable resume command", async () => {
    const writes: string[] = []
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          writes.push(value)
        },
      },
    })

    render(
      <SessionDetailWorkspace
        client={createClient({ getSession: async () => baseSession })}
        sessionId="session-1"
      />,
    )

    expect(await screen.findByText("登录接口 500 修复演示")).toBeVisible()
    expect(screen.getByText("user")).toBeVisible()
    expect(screen.getByText("assistant")).toBeVisible()
    expect(screen.getByText("tool")).toBeVisible()
    expect(screen.getByText("system")).toBeVisible()
    expect(screen.getByText("unknown")).toBeVisible()
    expect(screen.getByTestId("message-bubble-user")).toHaveClass("justify-end")
    expect(screen.getByTestId("message-bubble-assistant")).toHaveClass("justify-start")
    expect(screen.getByTestId("message-bubble-tool")).toHaveClass("justify-center")
    expect(screen.getByText("generic")).toBeVisible()
    expect(screen.getByText("abc123")).toBeVisible()
    expect(screen.getByText("/workspace/clisearch-demo")).toBeVisible()
    expect(screen.getByText("5")).toBeVisible()
    expect(screen.getByText(formatDateTime("2026-06-15T10:04:00.000Z"))).toBeVisible()
    expect(
      screen.getByText("cd '/workspace/clisearch-demo' && codex resume 'abc123'"),
    ).toBeVisible()

    fireEvent.click(screen.getByRole("button", { name: "Copy resume command for abc123" }))

    await waitFor(() => {
      expect(writes).toEqual(["cd '/workspace/clisearch-demo' && codex resume 'abc123'"])
    })
    expect(screen.getByText("Copied")).toBeVisible()
  })

  it("renders missing resume command as unavailable without enabling copy", async () => {
    render(
      <SessionDetailWorkspace
        client={createClient({
          getSession: async () => ({ ...baseSession, resumeCommand: null }),
        })}
        sessionId="session-1"
      />,
    )

    expect(await screen.findByText("Resume command")).toBeVisible()
    expect(screen.getByText("未记录")).toBeVisible()
    expect(screen.queryByRole("button", { name: "Copy resume command for abc123" })).toBeNull()
  })

  it("shows an API error state for malformed or missing sessions", async () => {
    render(
      <SessionDetailWorkspace
        client={createClient({
          getSession: async () => {
            throw new ApiClientError({
              code: "session_not_found",
              message: "Session not found.",
              status: 404,
            })
          },
        })}
        sessionId="not-a-number"
      />,
    )

    expect(await screen.findByText("Session unavailable")).toBeVisible()
    expect(screen.getByText("Session not found.")).toBeVisible()
  })

  it("does not let a stale session response replace the newest session", async () => {
    let resolveFirst: (value: AgentSessionDetail) => void = () => undefined
    const first = new Promise<AgentSessionDetail>((resolve) => {
      resolveFirst = resolve
    })
    const client = createClient({
      getSession: async (id) => {
        if (id === "session-1") {
          return await first
        }
        return { ...baseSession, id: "session-2", title: "第二个会话" }
      },
    })
    const { rerender } = render(<SessionDetailWorkspace client={client} sessionId="session-1" />)

    rerender(<SessionDetailWorkspace client={client} sessionId="session-2" />)
    expect(await screen.findByText("第二个会话")).toBeVisible()

    resolveFirst(baseSession)

    await waitFor(() => {
      expect(screen.getByText("第二个会话")).toBeVisible()
      expect(screen.queryByText("登录接口 500 修复演示")).not.toBeInTheDocument()
    })
  })

  it("renders untrusted session text without executable DOM", async () => {
    let sideEffectTriggered = false
    const recordSideEffect = () => {
      sideEffectTriggered = true
    }
    window.addEventListener("session-xss", recordSideEffect)
    const { container } = render(
      <SessionDetailWorkspace
        client={createClient({ getSession: async () => unsafeSession })}
        sessionId="session-unsafe"
      />,
    )

    expect(await screen.findByText(unsafeSession.title ?? "")).toBeVisible()
    expect(screen.getByText(unsafeSession.cwd ?? "")).toBeVisible()
    expect(screen.getByText(unsafeSession.resumeCommand ?? "")).toBeVisible()
    expect(screen.getByText(unsafeSession.messages[0]?.content ?? "")).toBeVisible()
    expect(container.querySelector("img")).not.toBeInTheDocument()
    expect(container.querySelector("script")).not.toBeInTheDocument()
    expect(sideEffectTriggered).toBe(false)

    window.removeEventListener("session-xss", recordSideEffect)
  })
})

function createClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    baseUrl: "http://api.test/api",
    createSource: async () => {
      throw new Error("not used")
    },
    deleteSource: async () => undefined,
    getSession: async () => baseSession,
    listScanJobs: async () => ({ items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 0 }),
    listSourcePresets: async () => [],
    listSources: async () => [],
    runSourceScan: async () => ({ records: [] }),
    searchSemantic: async () => ({ records: [] }),
    updateSource: async () => {
      throw new Error("not used")
    },
    ...overrides,
  }
}

function createMessage(overrides: Partial<AgentMessage>): AgentMessage {
  return {
    content: "",
    createdAt: "2026-06-15T10:00:00.000Z",
    id: "message-1",
    model: null,
    role: "assistant",
    seqNo: 1,
    sessionId: "session-1",
    ...overrides,
  }
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value))
}
