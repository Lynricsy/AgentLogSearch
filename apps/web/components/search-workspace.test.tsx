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

    fireEvent.click(screen.getByRole("button", { name: "Search" }))

    expect(await screen.findByText("Semantic query不能为空")).toBeVisible()
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

    fireEvent.change(screen.getByLabelText("Semantic query"), {
      target: { value: "之前修过登录接口 500 的那次" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Filters" }))
    fireEvent.change(screen.getByLabelText("Agent filter"), { target: { value: "generic" } })
    fireEvent.change(screen.getByLabelText("CWD keyword"), { target: { value: "CliSearch" } })
    fireEvent.click(screen.getByRole("button", { name: "Search" }))

    expect(await screen.findByText("登录接口 500 修复演示")).toBeVisible()
    expect(screen.getByText("Score 91.0%")).toBeVisible()
    expect(screen.getByText("generic")).toBeVisible()
    expect(screen.getByText("/workspace/clisearch-demo")).toBeVisible()
    expect(screen.getByText("abc123")).toBeVisible()
    expect(screen.getByText("登录接口返回 500，需要恢复 abc123 会话继续排查。")).toBeVisible()
    expect(
      screen.getByText("cd '/workspace/clisearch-demo' && codex resume 'abc123'"),
    ).toBeVisible()
    expect(
      screen.getByRole("link", { name: "Open detail for 登录接口 500 修复演示" }),
    ).toHaveAttribute("href", "/sessions/session-1")
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

    fireEvent.change(screen.getByLabelText("Semantic query"), { target: { value: "nothing" } })
    fireEvent.click(screen.getByRole("button", { name: "Search" }))

    expect(await screen.findByText("No matching sessions")).toBeVisible()
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

    fireEvent.change(screen.getByLabelText("Semantic query"), { target: { value: "login" } })
    fireEvent.click(screen.getByRole("button", { name: "Search" }))
    expect(await screen.findByText("登录接口 500 修复演示")).toBeVisible()

    shouldFail = true
    fireEvent.change(screen.getByLabelText("Semantic query"), { target: { value: "broken" } })
    fireEvent.click(screen.getByRole("button", { name: "Search" }))

    expect(await screen.findByText("Search unavailable")).toBeVisible()
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

    fireEvent.change(screen.getByLabelText("Semantic query"), { target: { value: "login" } })
    fireEvent.click(screen.getByRole("button", { name: "Search" }))
    fireEvent.click(await screen.findByRole("button", { name: "Copy resume command for abc123" }))

    await waitFor(() => {
      expect(writes).toEqual(["cd '/workspace/clisearch-demo' && codex resume 'abc123'"])
    })
    expect(screen.getByText("Copied")).toBeVisible()
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

    fireEvent.change(screen.getByLabelText("Semantic query"), { target: { value: "login" } })
    fireEvent.click(screen.getByRole("button", { name: "Search" }))
    fireEvent.click(await screen.findByRole("button", { name: "Copy resume command for abc123" }))

    expect(
      await screen.findByText("Clipboard unavailable. Select and copy the command manually."),
    ).toBeVisible()
    expect(screen.getByLabelText("Manual resume command for abc123")).toHaveValue(
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

    fireEvent.change(screen.getByLabelText("Semantic query"), { target: { value: "login" } })
    fireEvent.change(screen.getByLabelText("Top K"), { target: { value: "101" } })
    fireEvent.click(screen.getByRole("button", { name: "Search" }))

    expect(await screen.findByText("Top K must be between 1 and 100.")).toBeVisible()
    expect(calls).toEqual([])
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
