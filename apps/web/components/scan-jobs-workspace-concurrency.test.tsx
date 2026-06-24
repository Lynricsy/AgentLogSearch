import "@testing-library/jest-dom/vitest"
import type { PaginatedResponse, ScanJob } from "@agent-log-search/shared"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import type { ApiClient } from "../lib/api"
import { ScanJobsWorkspace } from "./scan-jobs-workspace"

describe("ScanJobsWorkspace request ordering", () => {
  afterEach(() => {
    cleanup()
  })

  it("keeps page 2 visible when an older page 1 refresh resolves later", async () => {
    // Given
    const pageOneRefresh = createDeferred<PaginatedResponse<ScanJob>>()
    const pageTwoLoad = createDeferred<PaginatedResponse<ScanJob>>()
    let pageOneCalls = 0
    const client = createClient({
      listScanJobs: async (query) => {
        const page = query?.page ?? 1
        if (page === 1) {
          pageOneCalls += 1
          if (pageOneCalls === 1) {
            return pageResponse([createScanJob({ id: "job-1" })], { page: 1, totalPages: 2 })
          }
          return await pageOneRefresh.promise
        }
        if (page === 2) {
          return await pageTwoLoad.promise
        }
        throw new Error(`Unexpected scan jobs page ${page}.`)
      },
    })
    render(<ScanJobsWorkspace client={client} />)
    expect(await screen.findByText("第 1 页，共 2 页")).toBeVisible()

    // When
    fireEvent.click(screen.getByRole("button", { name: "刷新扫描任务" }))
    fireEvent.click(screen.getByRole("button", { name: "下一页扫描任务" }))
    await act(async () => {
      pageTwoLoad.resolve(
        pageResponse([createScanJob({ id: "job-2" })], { page: 2, totalPages: 2 }),
      )
      await pageTwoLoad.promise
    })

    // Then
    expect(await screen.findByText("第 2 页，共 2 页")).toBeVisible()

    // When
    await act(async () => {
      pageOneRefresh.resolve(
        pageResponse([createScanJob({ id: "job-1-refresh" })], { page: 1, totalPages: 2 }),
      )
      await pageOneRefresh.promise
    })

    // Then
    expect(screen.getByText("第 2 页，共 2 页")).toBeVisible()
    expect(screen.queryByText("第 1 页，共 2 页")).not.toBeInTheDocument()
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
    finishedAt: "2026-06-16T09:05:06.000Z",
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
    startedAt: "2026-06-16T09:00:01.000Z",
    status: "completed",
    ...overrides,
  }
}

function pageResponse(
  items: readonly ScanJob[],
  pagination: {
    readonly page: number
    readonly totalPages: number
  } = { page: 1, totalPages: 1 },
): PaginatedResponse<ScanJob> {
  return {
    items,
    page: pagination.page,
    pageSize: 20,
    totalItems: pagination.totalPages,
    totalPages: pagination.totalPages,
  }
}

type Deferred<Value> = {
  readonly promise: Promise<Value>
  readonly resolve: (value: Value) => void
}

function createDeferred<Value>(): Deferred<Value> {
  let resolveDeferred: (value: Value) => void = () => {
    throw new Error("Deferred promise resolved before initialization.")
  }
  const promise = new Promise<Value>((resolve) => {
    resolveDeferred = resolve
  })
  return {
    promise,
    resolve: resolveDeferred,
  }
}
