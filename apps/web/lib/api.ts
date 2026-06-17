import {
  type AgentSessionDetail,
  type AgentSource,
  type ApiErrorResponse,
  agentSessionDetailSchema,
  agentSourceSchema,
  apiErrorResponseSchema,
  type CreateSourceRequest,
  PAGINATION_DEFAULTS,
  type PaginatedResponse,
  paginationQuerySchema,
  type ScanJob,
  type ScanRunResponse,
  type SemanticSearchRequest,
  type SemanticSearchResponse,
  type SourcePresetMetadata,
  scanJobsResponseSchema,
  scanRunResponseSchema,
  semanticSearchResponseSchema,
  sourcePresetMetadataSchema,
  type UpdateSourceRequest,
} from "@agent-log-search/shared"
import ky, { isHTTPError, type Options } from "ky"
import { z } from "zod"

const DEFAULT_API_BASE_URL = "/api"

type ApiClientOptions = {
  readonly baseUrl?: string
  readonly fetcher?: typeof fetch
}

export type ScanJobsQuery = {
  readonly page?: number
  readonly pageSize?: number
}

export type ApiClient = {
  readonly baseUrl: string
  readonly searchSemantic: (payload: SemanticSearchRequest) => Promise<SemanticSearchResponse>
  readonly listSources: () => Promise<readonly AgentSource[]>
  readonly listSourcePresets: () => Promise<readonly SourcePresetMetadata[]>
  readonly createSource: (payload: CreateSourceRequest) => Promise<AgentSource>
  readonly updateSource: (id: string, payload: UpdateSourceRequest) => Promise<AgentSource>
  readonly deleteSource: (id: string) => Promise<void>
  readonly runSourceScan: (sourceId: string) => Promise<ScanRunResponse>
  readonly listScanJobs: (query?: ScanJobsQuery) => Promise<PaginatedResponse<ScanJob>>
  readonly getSession: (id: string) => Promise<AgentSessionDetail>
}

export class ApiClientError extends Error {
  readonly code: string
  readonly status: number
  readonly details: ApiErrorResponse["error"]["details"] | undefined

  constructor({
    code,
    details,
    message,
    status,
  }: {
    readonly code: string
    readonly details?: ApiErrorResponse["error"]["details"]
    readonly message: string
    readonly status: number
  }) {
    super(message)
    this.name = "ApiClientError"
    this.code = code
    this.status = status
    this.details = details
  }
}

export function getApiBaseUrl(): string {
  const NEXT_PUBLIC_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL
  return NEXT_PUBLIC_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseUrl = trimTrailingSlash(options.baseUrl?.trim() || getApiBaseUrl())
  const apiOptions: Options = {
    prefix: baseUrl,
    retry: 0,
    timeout: 10_000,
  }
  const api = ky.create(options.fetcher ? { ...apiOptions, fetch: options.fetcher } : apiOptions)

  return {
    baseUrl,
    searchSemantic: (payload) =>
      requestJson(api.post("search/semantic", { json: payload }), semanticSearchResponseSchema),
    listSources: () => requestJson(api.get("sources"), z.array(agentSourceSchema)),
    listSourcePresets: () =>
      requestJson(api.get("sources/presets"), z.array(sourcePresetMetadataSchema)),
    createSource: (payload) =>
      requestJson(api.post("sources", { json: payload }), agentSourceSchema),
    updateSource: (id, payload) =>
      requestJson(
        api.patch(`sources/${encodeURIComponent(id)}`, { json: payload }),
        agentSourceSchema,
      ),
    deleteSource: async (id) => {
      await api.delete(`sources/${encodeURIComponent(id)}`)
    },
    runSourceScan: (sourceId) =>
      requestJson(api.post(`scan/run/${encodeURIComponent(sourceId)}`), scanRunResponseSchema),
    listScanJobs: async (query) => {
      const response = await requestJson(
        api.get("scan-jobs", { searchParams: scanJobsSearchParams(query) }),
        scanJobsResponseSchema,
      )
      return {
        items: response.records,
        page: response.pagination.page,
        pageSize: response.pagination.pageSize,
        totalItems: response.pagination.totalItems,
        totalPages: response.pagination.totalPages,
      }
    },
    getSession: (id) =>
      requestJson(api.get(`sessions/${encodeURIComponent(id)}`), agentSessionDetailSchema),
  }
}

export const apiClient = createApiClient()

async function requestJson<Schema extends z.ZodType>(
  request: Promise<Response>,
  schema: Schema,
): Promise<z.infer<Schema>> {
  try {
    const response = await request
    const json = await response.json()
    return schema.parse(json)
  } catch (error) {
    if (isHTTPError(error)) {
      throw await toApiClientError(error)
    }

    if (error instanceof z.ZodError) {
      throw new ApiClientError({
        code: "invalid_response",
        message: "API response did not match the expected contract.",
        status: 0,
      })
    }

    throw error
  }
}

async function toApiClientError(error: unknown): Promise<ApiClientError> {
  if (!isHTTPError(error)) {
    throw error
  }

  const parsed = readApiError(error.data, error.response.status)
  return new ApiClientError({
    code: parsed.error.code,
    details: parsed.error.details,
    message: parsed.error.message,
    status: error.response.status,
  })
}

function readApiError(data: unknown, status: number): ApiErrorResponse {
  try {
    return apiErrorResponseSchema.parse(data)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        error: {
          code: "http_error",
          message: `API request failed with HTTP ${status}.`,
        },
      }
    }

    throw error
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "")
}

function scanJobsSearchParams(query: ScanJobsQuery = {}): Record<string, string> {
  const parsed = paginationQuerySchema.safeParse(query)
  if (!parsed.success) {
    throw new ApiClientError({
      code: "invalid_pagination_query",
      message: `Scan jobs pagination query must use integer page >= 1 and pageSize between 1 and ${PAGINATION_DEFAULTS.maxPageSize}.`,
      status: 0,
    })
  }

  return {
    page: String(parsed.data.page),
    pageSize: String(parsed.data.pageSize),
  }
}
