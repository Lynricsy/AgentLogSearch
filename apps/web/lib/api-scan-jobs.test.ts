// @vitest-environment node

import { describe, expect, it } from "vitest"

import { ApiClientError, createApiClient, type ScanJobsQuery } from "./api"

const scanJobRecord = {
  chunksCreated: 4,
  createdAt: "2026-06-16T09:00:00.000Z",
  errorMessage: null,
  filesDiscovered: 3,
  filesFailed: 1,
  filesParsed: 2,
  finishedAt: "2026-06-16T09:00:06.000Z",
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
} as const

describe("createApiClient scan jobs", () => {
  it("requests scan jobs with page and page size query parameters", async () => {
    // Given
    const trackedCalls: string[] = []
    const client = createApiClient({
      baseUrl: "http://api.test/api",
      fetcher: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init)
        trackedCalls.push(request.url)
        return scanJobsResponse([])
      },
    })

    // When
    await client.listScanJobs({ page: 2, pageSize: 10 })

    // Then
    expect(trackedCalls).toEqual(["http://api.test/api/scan-jobs?page=2&pageSize=10"])
  })

  it("requests scan jobs with default pagination when query is omitted", async () => {
    // Given
    const trackedCalls: string[] = []
    const client = createApiClient({
      baseUrl: "http://api.test/api",
      fetcher: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init)
        trackedCalls.push(request.url)
        return scanJobsResponse([])
      },
    })

    // When
    await client.listScanJobs()

    // Then
    expect(trackedCalls).toEqual(["http://api.test/api/scan-jobs?page=1&pageSize=20"])
  })

  it("maps scan jobs records and pagination into the web pagination shape", async () => {
    // Given
    const client = createApiClient({
      baseUrl: "http://api.test/api",
      fetcher: async () =>
        scanJobsResponse([scanJobRecord], {
          page: 2,
          pageSize: 10,
          totalItems: 21,
          totalPages: 3,
        }),
    })

    // When
    const result = await client.listScanJobs({ page: 2, pageSize: 10 })

    // Then
    expect(result).toEqual({
      items: [scanJobRecord],
      page: 2,
      pageSize: 10,
      totalItems: 21,
      totalPages: 3,
    })
  })

  it("throws typed invalid_response when scan jobs response is malformed", async () => {
    // Given
    const client = createApiClient({
      baseUrl: "http://api.test/api",
      fetcher: async () => scanJobsResponse([{ ...scanJobRecord, filesDiscovered: -1 }]),
    })

    // When / Then
    await expect(client.listScanJobs({ page: 1, pageSize: 20 })).rejects.toMatchObject({
      code: "invalid_response",
      message: "API 响应不符合预期契约。",
      name: ApiClientError.name,
      status: 0,
    })
  })

  it("rejects invalid pagination without sending a scan jobs request", async () => {
    // Given
    const invalidQueries = [
      { label: "NaN page", query: { page: Number.NaN } },
      { label: "infinite page", query: { page: Number.POSITIVE_INFINITY } },
      { label: "non-integer page", query: { page: 1.5 } },
      { label: "zero page", query: { page: 0 } },
      { label: "negative page", query: { page: -1 } },
      { label: "NaN pageSize", query: { pageSize: Number.NaN } },
      { label: "infinite pageSize", query: { pageSize: Number.POSITIVE_INFINITY } },
      { label: "non-integer pageSize", query: { pageSize: 10.5 } },
      { label: "zero pageSize", query: { pageSize: 0 } },
      { label: "negative pageSize", query: { pageSize: -1 } },
      { label: "oversized pageSize", query: { pageSize: 101 } },
    ] satisfies readonly { readonly label: string; readonly query: ScanJobsQuery }[]

    for (const invalidQuery of invalidQueries) {
      const trackedCalls: string[] = []
      const client = createApiClient({
        baseUrl: "http://api.test/api",
        fetcher: async (input, init) => {
          const request = input instanceof Request ? input : new Request(input, init)
          trackedCalls.push(request.url)
          return scanJobsResponse([])
        },
      })

      // When / Then
      await expect(
        client.listScanJobs(invalidQuery.query),
        invalidQuery.label,
      ).rejects.toMatchObject({
        code: "invalid_pagination_query",
        name: ApiClientError.name,
        status: 0,
      })
      expect(trackedCalls, invalidQuery.label).toEqual([])
    }
  })
})

function scanJobsResponse(
  records: readonly unknown[],
  pagination: {
    readonly page: number
    readonly pageSize: number
    readonly totalItems: number
    readonly totalPages: number
  } = { page: 1, pageSize: 20, totalItems: records.length, totalPages: records.length > 0 ? 1 : 0 },
): Response {
  return new Response(JSON.stringify({ pagination, records }), {
    headers: { "content-type": "application/json" },
  })
}
