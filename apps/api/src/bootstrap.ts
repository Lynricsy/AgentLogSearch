import type { INestApplication } from "@nestjs/common"
import { configureMcpHttp } from "./mcp-http.js"

const WEB_APP_ORIGINS = ["http://127.0.0.1:3000", "http://localhost:3000"] as const
const DEFAULT_API_PORT = "3001"

export function configureApp(app: INestApplication): void {
  app.enableCors({
    origin: [...WEB_APP_ORIGINS],
  })
  configureMcpHttp(app, {
    apiBaseUrl: resolveMcpApiBaseUrl(),
  })
  app.setGlobalPrefix("api")
}

function resolveMcpApiBaseUrl(): string {
  const explicitBaseUrl =
    process.env.AGENT_LOG_SEARCH_MCP_API_BASE_URL?.trim() ||
    process.env.AGENT_LOG_SEARCH_API_BASE_URL?.trim() ||
    process.env.AGENT_LOG_SEARCH_API_URL?.trim()
  if (explicitBaseUrl !== undefined && explicitBaseUrl !== "") {
    return explicitBaseUrl.replace(/\/+$/, "")
  }

  return `http://127.0.0.1:${process.env.API_PORT ?? DEFAULT_API_PORT}/api`
}
