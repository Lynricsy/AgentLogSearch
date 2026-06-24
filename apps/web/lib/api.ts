import {
  type AgentSessionDetail,
  type AgentSource,
  type ApiErrorResponse,
  agentSessionDetailSchema,
  agentSourceSchema,
  apiErrorResponseSchema,
  type CreateSourceRequest,
  type ExperienceDetail,
  type ExperienceFailedAttemptCheckRequest,
  type ExperienceFailedAttemptCheckResponse,
  type ExperienceRebuildRequest,
  type ExperienceRebuildResponse,
  type ExperienceSearchRequest,
  type ExperienceSearchResponse,
  experienceDetailSchema,
  experienceFailedAttemptCheckResponseSchema,
  experienceRebuildResponseSchema,
  experienceSearchResponseSchema,
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
const DEFAULT_API_TIMEOUT_MS = 120_000

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
  readonly searchExperiences: (
    payload: ExperienceSearchClientRequest,
  ) => Promise<ExperienceSearchResponse>
  readonly getExperience: (id: string) => Promise<ExperienceDetail>
  readonly rebuildExperiences: (
    payload?: ExperienceRebuildClientRequest,
  ) => Promise<ExperienceRebuildResponse>
  readonly checkFailedAttempt: (
    payload: ExperienceFailedAttemptCheckClientRequest,
  ) => Promise<ExperienceFailedAttemptCheckResponse>
}

export type ExperienceSearchClientRequest = Omit<
  ExperienceSearchRequest,
  "files" | "mode" | "symbols" | "topK"
> &
  Partial<Pick<ExperienceSearchRequest, "files" | "mode" | "symbols" | "topK">>
export type ExperienceRebuildClientRequest = Partial<ExperienceRebuildRequest>
export type ExperienceFailedAttemptCheckClientRequest = Omit<
  ExperienceFailedAttemptCheckRequest,
  "files" | "operationKinds" | "symbols" | "topK"
> &
  Partial<
    Pick<ExperienceFailedAttemptCheckRequest, "files" | "operationKinds" | "symbols" | "topK">
  >

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
    timeout: DEFAULT_API_TIMEOUT_MS,
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
    searchExperiences: (payload) =>
      requestJson(
        api.post("experiences/search", { json: experienceSearchPayload(payload) }),
        experienceSearchResponseSchema,
      ),
    getExperience: (id) =>
      requestJson(api.get(`experiences/${encodeURIComponent(id)}`), experienceDetailSchema),
    rebuildExperiences: (payload = {}) =>
      requestJson(
        api.post("experiences/rebuild", { json: experienceRebuildPayload(payload) }),
        experienceRebuildResponseSchema,
      ),
    checkFailedAttempt: (payload) =>
      requestJson(
        api.post("experiences/check-failed-attempt", {
          json: experienceFailedAttemptCheckPayload(payload),
        }),
        experienceFailedAttemptCheckResponseSchema,
      ),
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
  try {
    return apiErrorResponseSchema.parse(data)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        error: {
          code: "http_error",
          message: `API 请求失败，HTTP 状态码 ${status}。`,
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
      message: `扫描任务分页查询必须使用大于等于 1 的整数页码，且 pageSize 必须在 1 到 ${PAGINATION_DEFAULTS.maxPageSize} 之间。`,
      status: 0,
    })
  }

  return {
    page: String(parsed.data.page),
    pageSize: String(parsed.data.pageSize),
  }
}

function experienceSearchPayload(payload: ExperienceSearchClientRequest): ExperienceSearchRequest {
  const repositoryPath = payload.repositoryPath?.trim()
  return {
    files: payload.files ?? [],
    mode: payload.mode ?? "all",
    query: payload.query,
    ...(repositoryPath === undefined || repositoryPath.length === 0 ? {} : { repositoryPath }),
    symbols: payload.symbols ?? [],
    topK: payload.topK ?? 10,
    ...(payload.errorText === undefined ? {} : { errorText: payload.errorText }),
  }
}

function experienceRebuildPayload(
  payload: ExperienceRebuildClientRequest,
): ExperienceRebuildRequest {
  return {
    includeReady: payload.includeReady ?? false,
    ...(payload.sessionId === undefined ? {} : { sessionId: payload.sessionId }),
    ...(payload.sourceId === undefined ? {} : { sourceId: payload.sourceId }),
  }
}

function experienceFailedAttemptCheckPayload(
  payload: ExperienceFailedAttemptCheckClientRequest,
): ExperienceFailedAttemptCheckRequest {
  return {
    files: payload.files ?? [],
    operationKinds: payload.operationKinds ?? [],
    symbols: payload.symbols ?? [],
    task: payload.task,
    topK: payload.topK ?? 5,
    ...(payload.plannedCommand === undefined ? {} : { plannedCommand: payload.plannedCommand }),
  }
}
