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
      content: "**生产环境登录接口** 返回 500，用户无法登录，请帮我排查。",
      id: "message-user",
      parts: [
        {
          kind: "text",
          label: "用户",
          text: "**生产环境登录接口** 返回 500，用户无法登录，请帮我排查。",
        },
      ],
      role: "user",
      seqNo: 1,
    }),
    createMessage({
      content: "已定位到登录接口返回 500 的原因。",
      id: "message-assistant",
      parts: [
        { kind: "thinking", label: "思考", text: "先复核登录接口最近一次堆栈。" },
        {
          kind: "assistant_response",
          label: "Agent 回复",
          text: "已定位到 **登录接口返回 500** 的原因。",
        },
        { kind: "tool_call", label: "工具调用", text: "command=rg login apps/api" },
      ],
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
    expect(screen.queryByText(/\/sessions/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/GET/i)).not.toBeInTheDocument()
    expect(screen.getByText("用户")).toBeVisible()
    expect(screen.getByText("助手")).toBeVisible()
    expect(screen.getByText("工具")).toBeVisible()
    expect(screen.getByText("系统")).toBeVisible()
    expect(screen.getAllByText("未知").length).toBeGreaterThan(0)
    expect(screen.getByText("生产环境登录接口")).toBeVisible()
    const thinkingToggle = screen.getByLabelText("思考，点击展开")
    const toolCallToggle = screen.getByLabelText("工具调用，点击展开")
    expect(thinkingToggle).toBeVisible()
    expect(thinkingToggle).toHaveAttribute("aria-expanded", "false")
    expect(screen.getByTestId("message-part-assistant_response")).toBeVisible()
    expect(toolCallToggle).toBeVisible()
    expect(toolCallToggle).toHaveAttribute("aria-expanded", "false")
    expect(screen.getByText("登录接口返回 500")).toBeVisible()
    fireEvent.click(thinkingToggle)
    expect(thinkingToggle).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("先复核登录接口最近一次堆栈。")).toBeInTheDocument()
    fireEvent.click(toolCallToggle)
    expect(toolCallToggle).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("command=rg login apps/api")).toBeInTheDocument()
    expect(screen.getByTestId("message-bubble-user")).toHaveClass("justify-end")
    expect(screen.getByTestId("message-bubble-assistant")).toHaveClass("justify-start")
    expect(screen.getByTestId("message-bubble-tool")).toHaveClass("justify-center")
    expect(screen.getByText("通用")).toBeVisible()
    expect(screen.getByText("abc123")).toBeVisible()
    expect(screen.getByText("/workspace/clisearch-demo")).toBeVisible()
    expect(screen.getByText("5")).toBeVisible()
    expect(screen.getByText(formatDateTime("2026-06-15T10:04:00.000Z"))).toBeVisible()
    expect(
      screen.getByText("cd '/workspace/clisearch-demo' && codex resume 'abc123'"),
    ).toBeVisible()

    fireEvent.click(screen.getByRole("button", { name: "复制 abc123 的恢复命令" }))

    await waitFor(() => {
      expect(writes).toEqual(["cd '/workspace/clisearch-demo' && codex resume 'abc123'"])
    })
    expect(screen.getByText("已复制")).toBeVisible()
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

    expect(await screen.findByText("恢复命令")).toBeVisible()
    expect(screen.getByText("未记录")).toBeVisible()
    expect(screen.queryByRole("button", { name: "复制 abc123 的恢复命令" })).toBeNull()
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

    expect(await screen.findByText("会话暂不可用")).toBeVisible()
    expect(screen.getByText("Session not found.")).toBeVisible()
  })

  it("cleans internal session titles in the page header", async () => {
    const rawTitle = "Live Claude History tool_result filtered 1782035200000"
    render(
      <SessionDetailWorkspace
        client={createClient({
          getSession: async () => ({ ...baseSession, title: rawTitle }),
        })}
        sessionId="session-1"
      />,
    )

    expect(await screen.findByText("Claude")).toBeVisible()
    expect(screen.queryByText(rawTitle)).not.toBeInTheDocument()
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
