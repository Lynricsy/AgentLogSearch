#!/usr/bin/env node
import {
  type ExperienceDetail,
  type ExperienceFailedAttemptCheckResponse,
  type ExperienceSearchResponse,
  experienceFailedAttemptCheckRequestSchema,
  experienceSearchRequestSchema,
} from "@agent-log-search/shared"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"
import { ApiClientError, createApiClient, HISTORY_RESULT_DISCLAIMER } from "./api-client.js"

type ToolKind = "experience_search" | "failed_attempt_check" | "experience_evidence"
type ToolPayload =
  | ExperienceDetail
  | ExperienceFailedAttemptCheckResponse
  | ExperienceSearchResponse

const server = new McpServer({
  name: "agent-log-search",
  version: "0.1.0",
})
const apiClient = createApiClient()

const experienceIdSchema = z.object({
  id: z.string().trim().regex(/^\d+$/, "id must be an unsigned integer string"),
})

server.registerTool(
  "search_engineering_history",
  {
    title: "Search Engineering History",
    description:
      "只读搜索历史工程经验，返回按成功、失败尝试、部分成功和未验证分组的证据摘要；不会执行命令或应用历史 patch。",
    inputSchema: experienceSearchRequestSchema,
  },
  async (input) => runTool("experience_search", () => apiClient.searchEngineeringHistory(input)),
)

server.registerTool(
  "check_failed_attempt",
  {
    title: "Check Failed Attempt",
    description:
      "只读检查计划操作是否与历史失败尝试相似，返回风险等级和证据摘要；结果仅作为历史上下文。",
    inputSchema: experienceFailedAttemptCheckRequestSchema,
  },
  async (input) => runTool("failed_attempt_check", () => apiClient.checkFailedAttempt(input)),
)

server.registerTool(
  "get_experience_evidence",
  {
    title: "Get Experience Evidence",
    description:
      "只读获取单条 experience 的尝试、会话元数据和脱敏 evidence event 摘要；不会返回完整原始工具输出。",
    inputSchema: experienceIdSchema,
  },
  async (input) => runTool("experience_evidence", () => apiClient.getExperienceEvidence(input.id)),
)

try {
  await server.connect(new StdioServerTransport())
} catch (error) {
  console.error(formatStartupError(error))
  process.exit(1)
}

async function runTool<T extends ToolPayload>(
  kind: ToolKind,
  callback: () => Promise<T>,
): Promise<CallToolResult> {
  try {
    return toToolResult(kind, await callback())
  } catch (error) {
    return toToolError(kind, error)
  }
}

function toToolResult(kind: ToolKind, data: ToolPayload): CallToolResult {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            disclaimer: HISTORY_RESULT_DISCLAIMER,
            kind,
            data,
          },
          null,
          2,
        ),
      },
    ],
  }
}

function toToolError(kind: ToolKind, error: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            disclaimer: HISTORY_RESULT_DISCLAIMER,
            kind,
            error: describeError(error),
          },
          null,
          2,
        ),
      },
    ],
    isError: true,
  }
}

function describeError(error: unknown) {
  if (error instanceof ApiClientError) {
    return {
      code: error.code,
      details: error.details,
      message: error.message,
      status: error.status,
    }
  }

  if (error instanceof Error) {
    return {
      code: "mcp_tool_error",
      message: error.message,
      status: 0,
    }
  }

  return {
    code: "mcp_tool_error",
    message: "MCP 工具调用失败。",
    status: 0,
  }
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
