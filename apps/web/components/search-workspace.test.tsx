import "@testing-library/jest-dom/vitest"
import type { SemanticSearchRequest, SemanticSearchResponse } from "@agent-log-search/shared"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { type ApiClient, ApiClientError } from "../lib/api"
import { SearchWorkspace } from "./search-workspace"

const successfulResponse: SemanticSearchResponse = {
  records: [
    {
      agentName: "generic",
      cwd: "/workspace/clisearch-demo",
      lastMessageAt: "2026-01-02T03:04:08.000Z",
      matchedChunks: [
        {
          chunkId: "chunk-1",
          messageEndSequence: 2,
          messageStartSequence: 1,
          messages: [
            {
              createdAt: "2026-01-02T03:04:06.000Z",
              id: "message-user",
              model: null,
              parts: [
                {
                  kind: "text",
                  label: "用户",
                  text: "**登录接口** 返回 500，需要恢复 `abc123` 会话继续排查。",
                },
              ],
              role: "user",
              seqNo: 1,
            },
            {
              createdAt: "2026-01-02T03:04:07.000Z",
              id: "message-assistant",
              model: "gpt-5",
              parts: [
                { kind: "thinking", label: "思考", text: "先确认最近一次错误日志。" },
                {
                  kind: "assistant_response",
                  label: "Agent 回复",
                  text: "已定位到 **登录接口返回 500** 的原因。",
                },
                { kind: "tool_call", label: "工具调用", text: "command=rg login apps/api" },
              ],
              role: "assistant",
              seqNo: 2,
            },
          ],
          metadata: {
            agentName: "generic",
            cwd: "/workspace/clisearch-demo",
            part: null,
            threadId: "abc123",
          },
          score: 0.91,
          snippet: "登录接口返回 500，需要恢复 abc123 会话继续排查。",
        },
      ],
      messageCount: 4,
      resumeCommand: "cd '/workspace/clisearch-demo' && codex resume 'abc123'",
      score: 0.91,
      sessionId: "session-1",
      threadId: "abc123",
      title: "登录接口 500 修复演示",
    },
  ],
}

describe("SearchWorkspace", () => {
  afterEach(() => {
    cleanup()
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    })
  })

  it("shows validation feedback when the query is blank", async () => {
    render(<SearchWorkspace client={createClient()} />)

    fireEvent.click(screen.getByRole("button", { name: "搜索" }))

    expect(await screen.findByText("语义查询不能为空")).toBeVisible()
  })

  it("renders a result-shaped skeleton while semantic search is loading", async () => {
    const client = createClient({
      searchSemantic: async () => new Promise<SemanticSearchResponse>(() => undefined),
    })
    render(<SearchWorkspace client={client} />)

    fireEvent.change(screen.getByLabelText("语义查询"), { target: { value: "login" } })
    fireEvent.click(screen.getByRole("button", { name: "搜索" }))

    expect(await screen.findByRole("status", { name: "正在加载搜索结果" })).toBeVisible()
    expect(screen.getAllByText("匹配片段")).toHaveLength(2)
    expect(screen.getAllByText("恢复命令")).toHaveLength(2)
  })

  it("submits query and filters with defaults, then renders search result details", async () => {
    const calls: SemanticSearchRequest[] = []
    const client = createClient({
      searchSemantic: async (payload) => {
        calls.push(payload)
        return successfulResponse
      },
    })
    render(<SearchWorkspace client={client} />)

    fireEvent.change(screen.getByLabelText("语义查询"), {
      target: { value: "之前修过登录接口 500 的那次" },
    })
    fireEvent.click(screen.getByRole("button", { name: "筛选条件" }))
    fireEvent.change(screen.getByLabelText("Agent 筛选"), { target: { value: "generic" } })
    fireEvent.change(screen.getByLabelText("工作目录关键词"), { target: { value: "CliSearch" } })
    fireEvent.click(screen.getByRole("button", { name: "搜索" }))

    expect(await screen.findByText("登录接口 500 修复演示")).toBeVisible()
    expect(screen.getByText("匹配度 91.0%")).toBeVisible()
    expect(screen.getAllByText("通用").length).toBeGreaterThan(0)
    expect(screen.getByText("/workspace/clisearch-demo")).toBeVisible()
    expect(screen.getAllByText("abc123").length).toBeGreaterThan(0)
    expect(screen.getByText("登录接口")).toBeVisible()
    expect(screen.getByText("abc123", { selector: "code" })).toBeVisible()
    const thinkingToggle = screen.getByLabelText("思考，点击展开")
    const toolCallToggle = screen.getByLabelText("工具调用，点击展开")
    expect(thinkingToggle).toBeVisible()
    expect(thinkingToggle).toHaveAttribute("aria-expanded", "false")
    expect(screen.getByTestId("snippet-part-assistant_response")).toBeVisible()
    expect(toolCallToggle).toBeVisible()
    expect(toolCallToggle).toHaveAttribute("aria-expanded", "false")
    expect(screen.getByText("登录接口返回 500")).toBeVisible()
    fireEvent.click(thinkingToggle)
    expect(thinkingToggle).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("先确认最近一次错误日志。")).toBeInTheDocument()
    fireEvent.click(toolCallToggle)
    expect(toolCallToggle).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("command=rg login apps/api")).toBeInTheDocument()
    expect(
      screen.getByText("cd '/workspace/clisearch-demo' && codex resume 'abc123'"),
    ).toBeVisible()
    expect(screen.queryByText(/\/api\/search\/semantic/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/POST/i)).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "打开 登录接口 500 修复演示 的详情" })).toHaveAttribute(
      "href",
      "/sessions/session-1",
    )
    expect(calls).toEqual([
      {
        agentName: "generic",
        cwdKeyword: "CliSearch",
        query: "之前修过登录接口 500 的那次",
        sessionLimit: 10,
        topK: 50,
      },
    ])
  })

  it("shows an empty state when semantic search returns no records", async () => {
    render(<SearchWorkspace client={createClient()} />)

    fireEvent.change(screen.getByLabelText("语义查询"), { target: { value: "nothing" } })
    fireEvent.click(screen.getByRole("button", { name: "搜索" }))

    expect(await screen.findByText("没有匹配的会话")).toBeVisible()
  })

  it("shows a clear error state and replaces stale results after API failure", async () => {
    let shouldFail = false
    const client = createClient({
      searchSemantic: async () => {
        if (shouldFail) {
          throw new ApiClientError({
            code: "bad_request",
            message: "Search request rejected.",
            status: 400,
          })
        }
        return successfulResponse
      },
    })
    render(<SearchWorkspace client={client} />)

    fireEvent.change(screen.getByLabelText("语义查询"), { target: { value: "login" } })
    fireEvent.click(screen.getByRole("button", { name: "搜索" }))
    expect(await screen.findByText("登录接口 500 修复演示")).toBeVisible()

    shouldFail = true
    fireEvent.change(screen.getByLabelText("语义查询"), { target: { value: "broken" } })
    fireEvent.click(screen.getByRole("button", { name: "搜索" }))

    expect(await screen.findByText("搜索暂不可用")).toBeVisible()
    expect(screen.getByText("Search request rejected.")).toBeVisible()
    expect(screen.queryByText("登录接口 500 修复演示")).not.toBeInTheDocument()
  })

  it("copies resume command with Clipboard API and shows success state", async () => {
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
      <SearchWorkspace client={createClient({ searchSemantic: async () => successfulResponse })} />,
    )

    fireEvent.change(screen.getByLabelText("语义查询"), { target: { value: "login" } })
    fireEvent.click(screen.getByRole("button", { name: "搜索" }))
    fireEvent.click(await screen.findByRole("button", { name: "复制 abc123 的恢复命令" }))

    await waitFor(() => {
      expect(writes).toEqual(["cd '/workspace/clisearch-demo' && codex resume 'abc123'"])
    })
    expect(screen.getByText("已复制")).toBeVisible()
  })

  it("shows copy fallback text when Clipboard API fails", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new DOMException("denied", "NotAllowedError")
        },
      },
    })
    render(
      <SearchWorkspace client={createClient({ searchSemantic: async () => successfulResponse })} />,
    )

    fireEvent.change(screen.getByLabelText("语义查询"), { target: { value: "login" } })
    fireEvent.click(screen.getByRole("button", { name: "搜索" }))
    fireEvent.click(await screen.findByRole("button", { name: "复制 abc123 的恢复命令" }))

    expect(await screen.findByText("剪贴板不可用，请手动选择并复制命令。")).toBeVisible()
    expect(screen.getByLabelText("abc123 的手动恢复命令")).toHaveValue(
      "cd '/workspace/clisearch-demo' && codex resume 'abc123'",
    )
  })

  it("validates numeric filters before calling the API", async () => {
    const calls: SemanticSearchRequest[] = []
    render(
      <SearchWorkspace
        client={createClient({
          searchSemantic: async (payload) => {
            calls.push(payload)
            return successfulResponse
          },
        })}
      />,
    )

    fireEvent.change(screen.getByLabelText("语义查询"), { target: { value: "login" } })
    fireEvent.change(screen.getByLabelText("召回片段数"), { target: { value: "101" } })
    fireEvent.click(screen.getByRole("button", { name: "搜索" }))

    expect(await screen.findByText("召回片段数必须在 1 到 100 之间。")).toBeVisible()
    expect(calls).toEqual([])
  })

  it("cleans internal session titles before rendering results", async () => {
    const [record] = successfulResponse.records
    if (!record) throw new Error("Missing semantic search fixture.")
    const response: SemanticSearchResponse = {
      records: [
        {
          ...record,
          title: "Live Claude History tool_result filtered 1782035200000",
        },
      ],
    }
    render(<SearchWorkspace client={createClient({ searchSemantic: async () => response })} />)

    fireEvent.change(screen.getByLabelText("语义查询"), { target: { value: "claude history" } })
    fireEvent.click(screen.getByRole("button", { name: "搜索" }))

    expect(await screen.findByText("Claude")).toBeVisible()
    expect(
      screen.queryByText("Live Claude History tool_result filtered 1782035200000"),
    ).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "打开 Claude 的详情" })).toHaveAttribute(
      "href",
      "/sessions/session-1",
    )
  })
})

function createClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    baseUrl: "http://api.test/api",
    createSource: async () => {
      throw new Error("not used")
    },
    deleteSource: async () => undefined,
    getSession: async () => {
      throw new Error("not used")
    },
    getExperience: async () => {
      throw new Error("not used")
    },
    searchExperiences: async () => ({
      failedAttempts: [],
      partial: [],
      successful: [],
      unverified: [],
    }),
    rebuildExperiences: async () => ({ affectedSessions: 0 }),
    checkFailedAttempt: async () => ({ matches: [], message: null, risk: "none" }),
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
