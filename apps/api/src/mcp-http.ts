import { randomUUID } from "node:crypto"
import type { IncomingMessage, ServerResponse } from "node:http"
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
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import type { INestApplication } from "@nestjs/common"
import { createAgentLogSearchMcpServer } from "mcp/server"

export const MCP_PATH = "/mcp"
const DEFAULT_MCP_SESSION_TTL_MS = 30 * 60 * 1000

type McpSession = {
  readonly server: McpServer
  readonly transport: StreamableHTTPServerTransport
  lastUsedAt: number
}

type McpHttpOptions = {
  readonly apiBaseUrl: string
  readonly fetcher?: typeof fetch
  readonly sessionTtlMs?: number
}

type McpApiClient = {
  readonly baseUrl: string
  readonly searchEngineeringHistory: (
    payload: ExperienceSearchRequest,
  ) => Promise<ExperienceSearchResponse>
  readonly checkFailedAttempt: (
    payload: ExperienceFailedAttemptCheckRequest,
  ) => Promise<ExperienceFailedAttemptCheckResponse>
  readonly getExperienceEvidence: (id: string) => Promise<ExperienceDetail>
}

type McpHttpRequest = IncomingMessage & {
  readonly body?: unknown
  readonly header?: (name: string) => string | undefined
}

export type McpHttpHandler = (request: McpHttpRequest, response: ServerResponse) => Promise<void>

export function configureMcpHttp(app: INestApplication, options: McpHttpOptions): void {
  const handler = createMcpHttpHandler(options)
  const expressApp = app.getHttpAdapter().getInstance()

  expressApp.all(MCP_PATH, handler)
}

export function createMcpHttpHandler(options: McpHttpOptions): McpHttpHandler {
  const sessions = new Map<string, McpSession>()
  const sessionTtlMs = options.sessionTtlMs ?? DEFAULT_MCP_SESSION_TTL_MS

  return async (request, response) => {
    cleanupExpiredSessions(sessions, sessionTtlMs)

    const sessionId = readSessionId(request)
    const session = sessionId === undefined ? undefined : sessions.get(sessionId)
    if (sessionId !== undefined && session === undefined) {
      writeJsonRpcError(response, 404, -32001, "Session not found")
      return
    }

    if (session !== undefined) {
      session.lastUsedAt = Date.now()
      await session.transport.handleRequest(request, response, request.body)
      return
    }

    const freshSession = await createMcpSession(options, sessions)
    await freshSession.transport.handleRequest(request, response, request.body)

    if (freshSession.transport.sessionId === undefined) {
      await freshSession.server.close()
    }
  }
}

async function createMcpSession(
  options: McpHttpOptions,
  sessions: Map<string, McpSession>,
): Promise<McpSession> {
  const server = createAgentLogSearchMcpServer({
    apiClient: createMcpApiClient(options.apiBaseUrl, options.fetcher),
  })
  const transport = new StreamableHTTPServerTransport({
    enableJsonResponse: true,
    onsessionclosed: (sessionId) => {
      const session = sessions.get(sessionId)
      sessions.delete(sessionId)
      void session?.server.close()
    },
    onsessioninitialized: (sessionId) => {
      sessions.set(sessionId, {
        server,
        transport,
        lastUsedAt: Date.now(),
      })
    },
    sessionIdGenerator: randomUUID,
  })

  await server.connect(transport as Transport)

  return {
    server,
    transport,
    lastUsedAt: Date.now(),
  }
}

function cleanupExpiredSessions(sessions: Map<string, McpSession>, sessionTtlMs: number): void {
  const now = Date.now()
  for (const [sessionId, session] of sessions) {
    if (now - session.lastUsedAt > sessionTtlMs) {
      sessions.delete(sessionId)
      void session.server.close()
    }
  }
}

function createMcpApiClient(baseUrl: string, fetcher: typeof fetch = fetch): McpApiClient {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "")

  return {
    baseUrl: normalizedBaseUrl,
    searchEngineeringHistory: (payload) =>
      requestJson(
        fetcher(`${normalizedBaseUrl}/experiences/search`, {
          body: JSON.stringify(experienceSearchRequestSchema.parse(payload)),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
        experienceSearchResponseSchema,
      ),
    checkFailedAttempt: (payload) =>
      requestJson(
        fetcher(`${normalizedBaseUrl}/experiences/check-failed-attempt`, {
          body: JSON.stringify(experienceFailedAttemptCheckRequestSchema.parse(payload)),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
        experienceFailedAttemptCheckResponseSchema,
      ),
    getExperienceEvidence: (id) =>
      requestJson(
        fetcher(`${normalizedBaseUrl}/experiences/${encodeURIComponent(id)}`),
        experienceDetailSchema,
      ),
  }
}

async function requestJson<Output>(
  responsePromise: Promise<Response>,
  schema: { readonly parse: (value: unknown) => Output },
): Promise<Output> {
  const response = await responsePromise
  const data: unknown = await response.json()

  if (!response.ok) {
    const parsed = apiErrorResponseSchema.safeParse(data)
    throw new McpHttpApiError(
      parsed.success ? parsed.data : fallbackApiError(response.status),
      response.status,
    )
  }

  return schema.parse(data)
}

class McpHttpApiError extends Error {
  public readonly code: string
  public readonly status: number
  public readonly details: ApiErrorResponse["error"]["details"] | undefined

  public constructor(response: ApiErrorResponse, status: number) {
    super(response.error.message)
    this.name = "ApiClientError"
    this.code = response.error.code
    this.status = status
    this.details = response.error.details
  }
}

function fallbackApiError(status: number): ApiErrorResponse {
  return {
    error: {
      code: "http_error",
      message: `API 请求失败，HTTP 状态码 ${status}。`,
    },
  }
}

function readSessionId(request: McpHttpRequest): string | undefined {
  const rawHeader = request.header?.("mcp-session-id") ?? request.headers["mcp-session-id"]
  const header = (Array.isArray(rawHeader) ? rawHeader[0] : rawHeader)?.trim()
  return header === "" ? undefined : header
}

function writeJsonRpcError(
  response: ServerResponse,
  status: number,
  code: number,
  message: string,
): void {
  response.statusCode = status
  response.setHeader("content-type", "application/json")
  response.end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code,
        message,
      },
      id: null,
    }),
  )
}
