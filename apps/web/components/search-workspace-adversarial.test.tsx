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

type FieldLabel = "CWD keyword" | "Agent filter" | "Semantic query" | "Session limit" | "Top K"

type MalformedCase = {
  readonly expectedError: string
  readonly fieldLabel: FieldLabel
  readonly name: string
  readonly value: string
}

const malformedCases = [
  {
    expectedError: `Semantic query cannot exceed ${SEMANTIC_SEARCH_DEFAULTS.maxQueryLength} characters.`,
    fieldLabel: "Semantic query",
    name: "an overlong query",
    value: "q".repeat(SEMANTIC_SEARCH_DEFAULTS.maxQueryLength + 1),
  },
  {
    expectedError: `Top K must be between 1 and ${SEMANTIC_SEARCH_DEFAULTS.maxTopK}.`,
    fieldLabel: "Top K",
    name: "a non-integer Top K",
    value: "1.5",
  },
  {
    expectedError: `Top K must be between 1 and ${SEMANTIC_SEARCH_DEFAULTS.maxTopK}.`,
    fieldLabel: "Top K",
    name: "zero Top K",
    value: "0",
  },
  {
    expectedError: `Session limit must be between 1 and ${SEMANTIC_SEARCH_DEFAULTS.maxSessionLimit}.`,
    fieldLabel: "Session limit",
    name: "a non-integer session limit",
    value: "2.5",
  },
  {
    expectedError: `Session limit must be between 1 and ${SEMANTIC_SEARCH_DEFAULTS.maxSessionLimit}.`,
    fieldLabel: "Session limit",
    name: "zero session limit",
    value: "0",
  },
  {
    expectedError: `Session limit must be between 1 and ${SEMANTIC_SEARCH_DEFAULTS.maxSessionLimit}.`,
    fieldLabel: "Session limit",
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

      if (fieldLabel !== "Semantic query") {
        fireEvent.change(screen.getByLabelText("Semantic query"), { target: { value: "login" } })
      }
      const field = screen.getByLabelText(fieldLabel)
      fireEvent.change(field, { target: { value } })
      fireEvent.click(screen.getByRole("button", { name: "Search" }))

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

    fireEvent.change(screen.getByLabelText("Semantic query"), { target: { value: "login" } })
    fireEvent.click(screen.getByRole("button", { name: "Filters" }))
    fireEvent.change(screen.getByLabelText("Agent filter"), { target: { value: "   " } })
    fireEvent.change(screen.getByLabelText("CWD keyword"), { target: { value: "\t  " } })
    fireEvent.click(screen.getByRole("button", { name: "Search" }))

    expect(await screen.findByText("No matching sessions")).toBeVisible()
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

    fireEvent.change(screen.getByLabelText("Semantic query"), { target: { value: "unsafe" } })
    fireEvent.click(screen.getByRole("button", { name: "Search" }))

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
