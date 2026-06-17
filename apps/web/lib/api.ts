import {
  type AgentSessionDetail,
  type AgentSource,
  type ApiErrorResponse,
  agentSessionDetailSchema,
  agentSourceSchema,
  apiErrorResponseSchema,
  type PaginatedResponse,
  paginatedResponseSchema,
  type ScanJob,
  type SemanticSearchRequest,
  type SemanticSearchResponse,
  scanJobSchema,
  semanticSearchResponseSchema,
} from "@agent-log-search/shared"
import ky, { isHTTPError, type Options } from "ky"
import { z } from "zod"

const DEFAULT_API_BASE_URL = "http://localhost:3001/api"

type ApiClientOptions = {
  readonly baseUrl?: string
  readonly fetcher?: typeof fetch
}

export type ApiClient = {
  readonly baseUrl: string
  readonly searchSemantic: (payload: SemanticSearchRequest) => Promise<SemanticSearchResponse>
  readonly listSources: () => Promise<PaginatedResponse<AgentSource>>
  readonly listScanJobs: () => Promise<PaginatedResponse<ScanJob>>
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
  const { NEXT_PUBLIC_API_BASE_URL } = process.env
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
    listSources: () => requestJson(api.get("sources"), paginatedResponseSchema(agentSourceSchema)),
    listScanJobs: () => requestJson(api.get("scan-jobs"), paginatedResponseSchema(scanJobSchema)),
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
