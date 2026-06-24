import "@testing-library/jest-dom/vitest"
import {
  SEMANTIC_SEARCH_DEFAULTS,
  type SemanticSearchRequest,
  type SemanticSearchResponse,
} from "@agent-log-search/shared"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import type { ApiClient } from "../lib/api"
import { SearchWorkspace } from "./search-workspace"

type FieldLabel = "Agent 筛选" | "会话上限" | "工作目录关键词" | "召回片段数" | "语义查询"

type MalformedCase = {
  readonly expectedError: string
  readonly fieldLabel: FieldLabel
  readonly name: string
  readonly value: string
}

const malformedCases = [
  {
    expectedError: `语义查询不能超过 ${SEMANTIC_SEARCH_DEFAULTS.maxQueryLength} 个字符。`,
    fieldLabel: "语义查询",
    name: "an overlong query",
    value: "q".repeat(SEMANTIC_SEARCH_DEFAULTS.maxQueryLength + 1),
  },
  {
    expectedError: `召回片段数必须在 1 到 ${SEMANTIC_SEARCH_DEFAULTS.maxTopK} 之间。`,
    fieldLabel: "召回片段数",
    name: "a non-integer Top K",
    value: "1.5",
  },
  {
    expectedError: `召回片段数必须在 1 到 ${SEMANTIC_SEARCH_DEFAULTS.maxTopK} 之间。`,
    fieldLabel: "召回片段数",
    name: "zero Top K",
    value: "0",
  },
  {
    expectedError: `会话上限必须在 1 到 ${SEMANTIC_SEARCH_DEFAULTS.maxSessionLimit} 之间。`,
    fieldLabel: "会话上限",
    name: "a non-integer session limit",
    value: "2.5",
  },
  {
    expectedError: `会话上限必须在 1 到 ${SEMANTIC_SEARCH_DEFAULTS.maxSessionLimit} 之间。`,
    fieldLabel: "会话上限",
    name: "zero session limit",
    value: "0",
  },
  {
    expectedError: `会话上限必须在 1 到 ${SEMANTIC_SEARCH_DEFAULTS.maxSessionLimit} 之间。`,
    fieldLabel: "会话上限",
    name: "a session limit above the maximum",
    value: String(SEMANTIC_SEARCH_DEFAULTS.maxSessionLimit + 1),
  },
] satisfies readonly MalformedCase[]

const unsafeText = {
  cwd: `</code><script>globalThis.dispatchEvent(new Event("search-xss"))</script>/tmp`,
  resumeCommand: `codex resume '<img src=x onerror=globalThis.dispatchEvent(new Event("search-xss"))>'`,
  snippet: `<script>globalThis.dispatchEvent(new Event("search-xss"))</script> matched chunk`,
  threadId: `<script>globalThis.dispatchEvent(new Event("search-xss"))</script>`,
  title: `<img src=x onerror=globalThis.dispatchEvent(new Event("search-xss"))> unsafe title`,
} as const

const unsafeResponse: SemanticSearchResponse = {
  records: [
    {
      agentName: "generic",
      cwd: unsafeText.cwd,
      lastMessageAt: null,
      matchedChunks: [
        {
          chunkId: "chunk-unsafe",
          score: 0.77,
          snippet: unsafeText.snippet,
        },
      ],
      messageCount: 1,
      resumeCommand: unsafeText.resumeCommand,
      score: 0.77,
      sessionId: "session-unsafe",
      threadId: unsafeText.threadId,
      title: unsafeText.title,
    },
  ],
}

describe("SearchWorkspace adversarial input handling", () => {
  afterEach(() => {
    cleanup()
  })

  it.each(malformedCases)(
    "rejects $name before calling semantic search",
    async ({ expectedError, fieldLabel, value }) => {
      let searchCalls = 0
      render(
        <SearchWorkspace
          client={createClient({
            searchSemantic: async () => {
              searchCalls += 1
              return { records: [] }
            },
          })}
        />,
      )

      if (fieldLabel !== "语义查询") {
        fireEvent.change(screen.getByLabelText("语义查询"), { target: { value: "login" } })
      }
      const field = screen.getByLabelText(fieldLabel)
      fireEvent.change(field, { target: { value } })
      fireEvent.click(screen.getByRole("button", { name: "搜索" }))

      expect(await screen.findByText(expectedError)).toBeVisible()
      expect(field).toHaveAttribute("aria-invalid", "true")
      const describedBy = field.getAttribute("aria-describedby")
      expect(describedBy).not.toBeNull()
      if (describedBy !== null) {
        expect(document.getElementById(describedBy)).toHaveTextContent(expectedError)
      }
      expect(searchCalls).toBe(0)
    },
  )

  it("omits blank optional filters from the semantic search payload", async () => {
    const calls: SemanticSearchRequest[] = []
    render(
      <SearchWorkspace
        client={createClient({
          searchSemantic: async (payload) => {
            calls.push(payload)
            return { records: [] }
          },
        })}
      />,
    )

    fireEvent.change(screen.getByLabelText("语义查询"), { target: { value: "login" } })
    fireEvent.click(screen.getByRole("button", { name: "筛选条件" }))
    fireEvent.change(screen.getByLabelText("Agent 筛选"), { target: { value: "   " } })
    fireEvent.change(screen.getByLabelText("工作目录关键词"), { target: { value: "\t  " } })
    fireEvent.click(screen.getByRole("button", { name: "搜索" }))

    expect(await screen.findByText("没有匹配的会话")).toBeVisible()
    expect(calls).toEqual([
      {
        query: "login",
        sessionLimit: SEMANTIC_SEARCH_DEFAULTS.sessionLimit,
        topK: SEMANTIC_SEARCH_DEFAULTS.topK,
      },
    ])
  })

  it("renders untrusted result text without creating executable DOM", async () => {
    let sideEffectTriggered = false
    const recordSideEffect = () => {
      sideEffectTriggered = true
    }
    window.addEventListener("search-xss", recordSideEffect)
    const { container } = render(
      <SearchWorkspace
        client={createClient({
          searchSemantic: async () => unsafeResponse,
        })}
      />,
    )

    fireEvent.change(screen.getByLabelText("语义查询"), { target: { value: "unsafe" } })
    fireEvent.click(screen.getByRole("button", { name: "搜索" }))

    expect(await screen.findByText(unsafeText.title)).toBeVisible()
    expect(screen.getByText(unsafeText.snippet)).toBeVisible()
    expect(screen.getByText(unsafeText.resumeCommand)).toBeVisible()
    expect(screen.getByText(unsafeText.cwd)).toBeVisible()
    expect(screen.getByText(unsafeText.threadId)).toBeVisible()
    expect(container.querySelector("img")).not.toBeInTheDocument()
    expect(container.querySelector("script")).not.toBeInTheDocument()
    expect(sideEffectTriggered).toBe(false)

    window.removeEventListener("search-xss", recordSideEffect)
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
