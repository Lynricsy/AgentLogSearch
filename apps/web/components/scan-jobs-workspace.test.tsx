import "@testing-library/jest-dom/vitest"
import type { PaginatedResponse, ScanJob } from "@agent-log-search/shared"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { type ApiClient, ApiClientError } from "../lib/api"
import { ScanJobsWorkspace } from "./scan-jobs-workspace"

const startedAt = "2026-06-16T09:00:01.000Z"
const finishedAt = "2026-06-16T09:05:06.000Z"
const longError =
  "Sensitive parser failure body with token sk-live-1234567890 and a very long stack trace ".repeat(
    4,
  )

describe("ScanJobsWorkspace", () => {
  afterEach(() => {
    cleanup()
  })

  it("shows loading state while scan jobs are fetched", async () => {
    // Given
    const pending = new Promise<PaginatedResponse<ScanJob>>(() => undefined)
    const client = createClient({ listScanJobs: async () => await pending })

    // When
    render(<ScanJobsWorkspace client={client} />)

    // Then
    expect(await screen.findByText("正在加载扫描任务")).toBeVisible()
  })

  it("shows empty state when the API returns no scan jobs", async () => {
    // Given
    const client = createClient({ listScanJobs: async () => pageResponse([]) })

    // When
    render(<ScanJobsWorkspace client={client} />)

    // Then
    expect(await screen.findByText("还没有扫描任务")).toBeVisible()
  })

  it("shows API error state without stale rows", async () => {
    // Given
    let shouldFail = false
    const client = createClient({
      listScanJobs: async () => {
        if (shouldFail) {
          throw new ApiClientError({
            code: "bad_gateway",
            message: "Scan jobs endpoint unavailable.",
            status: 502,
          })
        }
        return pageResponse([createScanJob()])
      },
    })
    render(<ScanJobsWorkspace client={client} />)
    await screen.findByText("Demo source")

    // When
    shouldFail = true
    fireEvent.click(screen.getByRole("button", { name: "刷新扫描任务" }))

    // Then
    expect(await screen.findByText("扫描任务暂不可用")).toBeVisible()
    expect(screen.getByText("Scan jobs endpoint unavailable.")).toBeVisible()
    expect(screen.queryByText("Demo source")).not.toBeInTheDocument()
  })

  it("renders successful rows with counts, source metadata, dates, and truncated error summary", async () => {
    // Given
    const client = createClient({
      listScanJobs: async () =>
        pageResponse([createScanJob({ errorMessage: longError, status: "failed" })]),
    })

    // When
    render(<ScanJobsWorkspace client={client} />)

    // Then
    expect((await screen.findAllByText("失败")).length).toBeGreaterThan(0)
    expect(screen.getByText("Demo source")).toBeVisible()
    expect(screen.queryByText(/\/scan-jobs/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/GET/i)).not.toBeInTheDocument()
    expect(screen.getByText("通用")).toBeVisible()
    expect(screen.getByText("通用 JSONL")).toBeVisible()
    expect(screen.getByText(formatDateTime(startedAt))).toBeVisible()
    expect(screen.getByText(formatDateTime(finishedAt))).toBeVisible()
    expect(screen.getByText("3")).toBeVisible()
    expect(screen.getByText("2")).toBeVisible()
    expect(screen.getByText("1")).toBeVisible()
    expect(screen.getByText("2 / 8")).toBeVisible()
    expect(screen.getByText("4")).toBeVisible()
    const summaryRows = screen.getAllByTestId("scan-summary-row")
    expect(summaryRows).toHaveLength(5)
    expect(summaryRows[0]).toHaveClass("bg-sky-50")
    expect(summaryRows[1]).toHaveClass("bg-emerald-50")
    expect(summaryRows[2]).toHaveClass("bg-rose-50")
    expect(summaryRows[3]).toHaveClass("bg-amber-50")
    expect(summaryRows[4]).toHaveClass("bg-violet-50")
    expect(screen.getByText(/^Sensitive parser failure body/)).toBeVisible()
    expect(screen.queryByText(fullErrorMatcher)).not.toBeInTheDocument()
  })

  it("loads previous and next pages with bounded page controls", async () => {
    // Given
    const calls: { readonly page: number; readonly pageSize: number }[] = []
    const client = createClient({
      listScanJobs: async (query) => {
        const requested = normalizeScanJobsQuery(query)
        calls.push(requested)
        return pageResponse([createScanJob({ id: `job-${requested.page}` })], {
          page: requested.page,
          pageSize: requested.pageSize,
          totalItems: 3,
          totalPages: 3,
        })
      },
    })
    render(<ScanJobsWorkspace client={client} />)
    expect(await screen.findByText("第 1 页，共 3 页")).toBeVisible()
    expect(screen.getByRole("button", { name: "上一页扫描任务" })).toBeDisabled()

    // When
    fireEvent.click(screen.getByRole("button", { name: "下一页扫描任务" }))
    await screen.findByText("第 2 页，共 3 页")
    fireEvent.click(screen.getByRole("button", { name: "下一页扫描任务" }))
    await screen.findByText("第 3 页，共 3 页")
    fireEvent.click(screen.getByRole("button", { name: "上一页扫描任务" }))

    // Then
    expect(await screen.findByText("第 2 页，共 3 页")).toBeVisible()
    expect(calls).toEqual([
      { page: 1, pageSize: 20 },
      { page: 2, pageSize: 20 },
      { page: 3, pageSize: 20 },
      { page: 2, pageSize: 20 },
    ])
  })

  it("reveals full error details only after explicit action", async () => {
    // Given
    const client = createClient({
      listScanJobs: async () => pageResponse([createScanJob({ errorMessage: longError })]),
    })

    // When
    render(<ScanJobsWorkspace client={client} />)
    await screen.findByText("Demo source")

    // Then
    expect(screen.queryByText(longError)).not.toBeInTheDocument()

    // When
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "查看扫描任务 77 的错误详情" }))
    })

    // Then
    expect(screen.getByText(fullErrorMatcher)).toBeVisible()
  })

  it("cleans internal source names in scan job rows", async () => {
    // Given
    const rawName = "Live Claude History tool_result filtered 1782035200000"
    const client = createClient({
      listScanJobs: async () =>
        pageResponse([
          createScanJob({
            source: {
              id: "12",
              name: rawName,
              parserType: "generic-jsonl",
              sourcePreset: "generic",
            },
          }),
        ]),
    })

    // When
    render(<ScanJobsWorkspace client={client} />)

    // Then
    expect(await screen.findByText("Claude")).toBeVisible()
    expect(screen.queryByText(rawName)).not.toBeInTheDocument()
  })

  it("cleans demo fixture names in scan job rows", async () => {
    // Given
    const rawName = "F3 demo-agent 2026-06-18T05:38:30.129Z"
    const client = createClient({
      listScanJobs: async () =>
        pageResponse([
          createScanJob({
            source: {
              id: "12",
              name: rawName,
              parserType: "generic-jsonl",
              sourcePreset: "generic",
            },
          }),
        ]),
    })

    // When
    render(<ScanJobsWorkspace client={client} />)

    // Then
    expect(await screen.findByText("F3")).toBeVisible()
    expect(screen.queryByText(rawName)).not.toBeInTheDocument()
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
    listScanJobs: async () => pageResponse([]),
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

function createScanJob(overrides: Partial<ScanJob> = {}): ScanJob {
  return {
    chunksCreated: 4,
    createdAt: "2026-06-16T09:00:00.000Z",
    errorMessage: null,
    filesDiscovered: 3,
    filesFailed: 1,
    filesParsed: 2,
    finishedAt,
    id: "77",
    messagesImported: 8,
    sessionsImported: 2,
    source: {
      id: "12",
      name: "Demo source",
      parserType: "generic-jsonl",
      sourcePreset: "generic",
    },
    sourceId: "12",
    startedAt,
    status: "completed",
    ...overrides,
  }
}

function pageResponse(
  items: readonly ScanJob[],
  pagination: {
    readonly page: number
    readonly pageSize: number
    readonly totalItems: number
    readonly totalPages: number
  } = { page: 1, pageSize: 20, totalItems: items.length, totalPages: items.length > 0 ? 1 : 0 },
): PaginatedResponse<ScanJob> {
  return {
    items,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalItems: pagination.totalItems,
    totalPages: pagination.totalPages,
  }
}

function normalizeScanJobsQuery(
  query: { readonly page?: number; readonly pageSize?: number } = {},
): { readonly page: number; readonly pageSize: number } {
  return {
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 20,
  }
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value))
}

function fullErrorMatcher(content: string): boolean {
  return content.trim() === longError.trim()
}
