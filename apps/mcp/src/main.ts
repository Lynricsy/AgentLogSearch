#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { ApiClientError, createApiClient } from "./api-client.js"
import { createAgentLogSearchMcpServer } from "./server.js"

try {
  const server = createAgentLogSearchMcpServer({ apiClient: createApiClient() })
  await server.connect(new StdioServerTransport())
} catch (error) {
  console.error(formatStartupError(error))
  process.exit(1)
}

function formatStartupError(error: unknown): string {
  if (error instanceof ApiClientError) {
    return `AgentLogSearch MCP 启动失败：${error.message} (${error.code}, HTTP ${error.status})`
  }

  if (error instanceof Error) {
    return `AgentLogSearch MCP 启动失败：${error.message}`
  }

  return "AgentLogSearch MCP 启动失败。"
}
