import {
  type ApiErrorResponse,
  apiErrorResponseSchema,
  type ExperienceDetail,
  type ExperienceFailedAttemptCheckRequest,
  type ExperienceFailedAttemptCheckResponse,
  type ExperienceSearchRequest,
  type ExperienceSearchResponse,
  experienceDetailSchema,
  experienceFailedAttemptCheckRequestSchema,
  experienceFailedAttemptCheckResponseSchema,
  experienceSearchRequestSchema,
  experienceSearchResponseSchema,
} from "@agent-log-search/shared"
import ky, { isHTTPError, type Options } from "ky"
import { z } from "zod"

export const DEFAULT_API_BASE_URL = "http://127.0.0.1:3000/api"
export const DEFAULT_API_TIMEOUT_MS = 120_000

export type ApiClientOptions = {
  readonly baseUrl?: string
  readonly fetcher?: typeof fetch
}

export type ApiClient = {
  readonly baseUrl: string
  readonly searchEngineeringHistory: (
    payload: ExperienceSearchRequest,
  ) => Promise<ExperienceSearchResponse>
  readonly checkFailedAttempt: (
    payload: ExperienceFailedAttemptCheckRequest,
  ) => Promise<ExperienceFailedAttemptCheckResponse>
  readonly getExperienceEvidence: (id: string) => Promise<ExperienceDetail>
}

export class ApiClientError extends Error {
  public readonly code: string
  public readonly status: number
  public readonly details: ApiErrorResponse["error"]["details"] | undefined

  public constructor({
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
  const { AGENT_LOG_SEARCH_API_BASE_URL, AGENT_LOG_SEARCH_API_URL } = process.env
  return (
    AGENT_LOG_SEARCH_API_BASE_URL?.trim() ||
    AGENT_LOG_SEARCH_API_URL?.trim() ||
    DEFAULT_API_BASE_URL
  )
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseUrl = trimTrailingSlash(options.baseUrl?.trim() || getApiBaseUrl())
  const apiOptions: Options = {
    prefix: baseUrl,
    retry: 0,
    timeout: DEFAULT_API_TIMEOUT_MS,
  }
  const api = ky.create(options.fetcher ? { ...apiOptions, fetch: options.fetcher } : apiOptions)

  return {
    baseUrl,
    searchEngineeringHistory: (payload) =>
      requestJson(
        api.post("experiences/search", { json: experienceSearchRequestSchema.parse(payload) }),
        experienceSearchResponseSchema,
      ),
    checkFailedAttempt: (payload) =>
      requestJson(
        api.post("experiences/check-failed-attempt", {
          json: experienceFailedAttemptCheckRequestSchema.parse(payload),
        }),
        experienceFailedAttemptCheckResponseSchema,
      ),
    getExperienceEvidence: (id) =>
      requestJson(api.get(`experiences/${encodeURIComponent(id)}`), experienceDetailSchema),
  }
}

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
        message: "API 响应不符合预期契约。",
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
  const parsed = apiErrorResponseSchema.safeParse(data)
  if (parsed.success) {
    return parsed.data
  }

  return {
    error: {
      code: "http_error",
      message: `API 请求失败，HTTP 状态码 ${status}。`,
    },
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "")
}
