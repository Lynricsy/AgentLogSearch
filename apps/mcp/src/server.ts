import {
  type ExperienceDetail,
  type ExperienceFailedAttemptCheckResponse,
  type ExperienceSearchResponse,
  type ExperienceSummary,
  experienceFailedAttemptCheckRequestSchema,
  experienceSearchRequestSchema,
  type FailedAttemptMatch,
} from "@agent-log-search/shared"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"
import type { ApiClient } from "./api-client.js"

type ToolKind = "experience_search" | "failed_attempt_check" | "experience_evidence"
type ToolPayload =
  | ExperienceDetail
  | ExperienceFailedAttemptCheckResponse
  | ExperienceSearchResponse

export const HISTORY_RESULT_DISCLAIMER = "历史执行结果不等于当前环境中的操作建议。"

export type AgentLogSearchMcpServerOptions = {
  readonly apiClient: ApiClient
}

const experienceIdSchema = z.object({
  id: z.string().trim().regex(/^\d+$/, "id must be an unsigned integer string"),
})

export function createAgentLogSearchMcpServer(options: AgentLogSearchMcpServerOptions): McpServer {
  const server = new McpServer({
    name: "agent-log-search",
    version: "0.1.0",
  })
  const { apiClient } = options

  server.registerTool(
    "search_engineering_history",
    {
      annotations: {
        destructiveHint: false,
        readOnlyHint: true,
      },
      title: "Search Engineering History",
      description:
        "只读搜索历史工程经验。Agent 不知道怎么处理当前问题时优先调用：query 可直接写自然语言问题、报错片段、截图文字或文件/符号线索；先看 successful，再看 failedAttempts/partial，必要时用 get_experience_evidence 读取 top result 证据。不会执行命令或应用历史 patch。",
      inputSchema: experienceSearchRequestSchema,
    },
    async (input) => runTool("experience_search", () => apiClient.searchEngineeringHistory(input)),
  )

  server.registerTool(
    "check_failed_attempt",
    {
      annotations: {
        destructiveHint: false,
        readOnlyHint: true,
      },
      title: "Check Failed Attempt",
      description:
        "只读检查计划操作是否像历史失败尝试。适合在修改共享逻辑、迁移 schema、执行高风险命令前调用；命中表示需要避开旧失败路径或先读 get_experience_evidence，不代表禁止继续。",
      inputSchema: experienceFailedAttemptCheckRequestSchema,
    },
    async (input) => runTool("failed_attempt_check", () => apiClient.checkFailedAttempt(input)),
  )

  server.registerTool(
    "get_experience_evidence",
    {
      annotations: {
        destructiveHint: false,
        readOnlyHint: true,
      },
      title: "Get Experience Evidence",
      description:
        "只读获取单条 experience 的可读证据摘要。通常在 search_engineering_history 返回候选后调用，用于确认历史操作、验证命令、关键文件和 trace evidence；不要把历史 patch 当作可直接应用的当前修改。",
      inputSchema: experienceIdSchema,
    },
    async (input) =>
      runTool("experience_evidence", () => apiClient.getExperienceEvidence(input.id)),
  )

  return server
}

export async function runTool<T extends ToolPayload>(
  kind: ToolKind,
  callback: () => Promise<T>,
): Promise<CallToolResult> {
  try {
    return toToolResult(kind, await callback())
  } catch (error) {
    return toToolError(kind, error)
  }
}

export function toToolResult(kind: ToolKind, data: ToolPayload): CallToolResult {
  const summary = summarizeToolResult(kind, data)
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            data,
            disclaimer: HISTORY_RESULT_DISCLAIMER,
            guidance: guidanceFor(kind),
            kind,
            summary,
          },
          null,
          2,
        ),
      },
    ],
  }
}

export function toToolError(kind: ToolKind, error: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            disclaimer: HISTORY_RESULT_DISCLAIMER,
            error: describeError(error),
            guidance: guidanceFor(kind),
            kind,
          },
          null,
          2,
        ),
      },
    ],
    isError: true,
  }
}

function summarizeToolResult(kind: ToolKind, data: ToolPayload) {
  switch (kind) {
    case "experience_search":
      return summarizeExperienceSearch(data as ExperienceSearchResponse)
    case "failed_attempt_check":
      return summarizeFailedAttemptCheck(data as ExperienceFailedAttemptCheckResponse)
    case "experience_evidence":
      return summarizeExperienceDetail(data as ExperienceDetail)
  }
}

function summarizeExperienceSearch(data: ExperienceSearchResponse) {
  const groups = {
    failedAttempts: data.failedAttempts.map(summarizeExperience),
    partial: data.partial.map(summarizeExperience),
    successful: data.successful.map(summarizeExperience),
    unverified: data.unverified.map(summarizeExperience),
  }
  const best =
    data.successful[0] ?? data.failedAttempts[0] ?? data.partial[0] ?? data.unverified[0] ?? null
  return {
    best: best === null ? null : summarizeExperience(best),
    groups,
    nextSteps:
      best === null
        ? [
            "放宽 query：用自然语言描述目标、复制完整报错、补充文件路径或符号名。",
            "如果是在计划修改前避险，改用 check_failed_attempt 检查失败尝试。",
          ]
        : [
            `先调用 get_experience_evidence，id=${best.id}，确认历史证据是否真的适用。`,
            "优先复用 successful 的做法；同时阅读 failedAttempts/partial，避免重复踩坑。",
            "历史结果只提供上下文，当前仓库仍需重新验证。",
          ],
    totals: {
      failedAttempts: data.failedAttempts.length,
      partial: data.partial.length,
      successful: data.successful.length,
      unverified: data.unverified.length,
    },
  }
}

function summarizeFailedAttemptCheck(data: ExperienceFailedAttemptCheckResponse) {
  return {
    matches: data.matches.slice(0, 5).map(summarizeFailedAttemptMatch),
    message: data.message,
    nextSteps:
      data.matches.length === 0
        ? ["没有发现高相似历史失败；仍应按常规测试计划验证当前修改。"]
        : [
            "先读取最高风险 match 的 evidence，理解失败原因。",
            "修改方案应主动避开 matchedPaths/matchedSymbols/matchedErrors 指向的旧失败路径。",
            "命中只是历史风险信号，不代表当前操作一定失败。",
          ],
    risk: data.risk,
  }
}

function summarizeExperienceDetail(data: ExperienceDetail) {
  return {
    attempts: data.attempts.map((attempt) => ({
      commands: displayTokens(attempt.commandFamilies, 5),
      errorsAfter: displayTokens(attempt.errorAfter, 5),
      id: attempt.id,
      outcome: attempt.outcome,
      paths: displayTokens(attempt.affectedPaths, 5),
      summary: summarizeAttemptAction(attempt),
    })),
    evidence: data.evidenceEvents.slice(0, 8).map((event) => ({
      excerpt: cleanSentence(event.redactedExcerpt ?? ""),
      id: event.id,
      operationKind: event.operationKind,
      paths: displayTokens(event.pathTokens, 4),
      toolName: event.toolName,
    })),
    experience: summarizeExperience(data),
    nextSteps: [
      "用 evidence 判断历史结论是否可靠；不要只看标题。",
      "若要照历史方式处理，先检查当前仓库文件/依赖是否仍一致，再重新运行验证命令。",
      "如果 evidence 显示失败或部分验证，把它当作风险提示，而不是推荐做法。",
    ],
    session: {
      cwd: data.session.cwd,
      externalThreadId: data.session.externalThreadId,
      id: data.session.id,
    },
  }
}

function summarizeExperience(experience: ExperienceSummary) {
  return {
    commands: displayTokens(experience.commandFamilies, 5),
    evidence: {
      level: experience.evidenceLevel,
      score: round(experience.evidenceScore),
    },
    errors: displayTokens([...experience.matchedErrors, ...experience.errorCodes], 5),
    id: experience.id,
    outcome: experience.outcome,
    paths: displayTokens([...experience.matchedPaths, ...experience.pathTokens], 6, {
      preferPaths: true,
    }),
    score: round(experience.scoreBreakdown.finalScore),
    summary: bestSummary(experience),
    title: experience.title,
  }
}

function summarizeFailedAttemptMatch(match: FailedAttemptMatch) {
  return {
    attemptId: match.attempt.id,
    errors: displayTokens(match.matchedErrors, 5),
    experience: {
      id: match.experience.id,
      outcome: match.experience.outcome,
      title: match.experience.title,
    },
    paths: displayTokens(match.matchedPaths, 5, { preferPaths: true }),
    risk: match.risk,
    score: round(match.score),
    symbols: displayTokens(match.matchedSymbols, 5),
  }
}

function summarizeAttemptAction(attempt: ExperienceDetail["attempts"][number]): string {
  const paths = displayTokens(attempt.affectedPaths, 3, { preferPaths: true })
  if (paths.length > 0) return `修改 ${paths.join("、")}`
  const symbols = displayTokens(attempt.affectedSymbols, 3)
  if (symbols.length > 0) return `涉及 ${symbols.join("、")}`
  return cleanSentence(attempt.actionSignature) || `尝试 ${attempt.attemptIndex + 1}`
}

function guidanceFor(kind: ToolKind): readonly string[] {
  switch (kind) {
    case "experience_search":
      return [
        "适合在 Agent 不知道怎么做、看到报错、或准备复用历史经验时先调用。",
        "query 可以是自然语言，不必精确；有文件/符号时填 files/symbols 可提高精度。",
        "读取结果时优先看 summary.best 和 successful；若涉及风险，再看 failedAttempts/partial。",
      ]
    case "failed_attempt_check":
      return [
        "适合在动手前检查旧失败路径，尤其是数据库、扫描器、解析器、前端契约和构建流程。",
        "命中后应读取 evidence 并调整计划；未命中不代表当前方案安全。",
      ]
    case "experience_evidence":
      return [
        "适合确认单条经验的证据来源、尝试过程和验证结果。",
        "只有当前仓库重新验证通过，历史经验才算真正适用于当前任务。",
      ]
  }
}

function bestSummary(experience: Pick<ExperienceSummary, "taskText" | "templateSummary">): string {
  const summary = cleanSentence(experience.templateSummary)
  if (summary.length > 0 && !isBoilerplate(summary)) {
    return summary
  }
  return cleanSentence(experience.taskText)
}

function displayTokens(
  values: readonly string[],
  limit: number,
  options: { readonly preferPaths?: boolean } = {},
): readonly string[] {
  return [
    ...new Set(values.map(displayToken).filter((token) => isUsefulToken(token, options))),
  ].slice(0, limit)
}

function displayToken(value: string): string {
  return value
    .trim()
    .replaceAll("\\", "/")
    .replace(/^n(?=\/root\/)/, "")
    .replace(/(^|\s)([ab])\//g, "$1")
    .replace(/^n\/root\/Projects\/Cources\/ComprehensiveProject\/CliSearch\//, "")
    .replace(/^\/root\/Projects\/Cources\/ComprehensiveProject\/CliSearch\//, "")
    .replace(/^\/root\/Projects\/Cources\/ComprehensiveProject\//, "")
    .replace(/^\/host-history\//, "history/")
    .replace(/:\d+:\d+$/, "")
    .replace(/:\d+$/, "")
    .replace(/^['"`]+|['"`]+$/g, "")
}

function isUsefulToken(token: string, options: { readonly preferPaths?: boolean }): boolean {
  if (token.length < 2) return false
  if (/^\d+$/.test(token)) return false
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(token)) return false
  if (/^[a-f0-9]{12,}$/i.test(token)) return false
  if (/^[a-f0-9-]{16,}$/i.test(token)) return false
  if (/^message:\d+/i.test(token)) return false
  if (options.preferPaths) {
    return (token.includes("/") && hasPathShape(token)) || hasFileExtension(token)
  }
  return true
}

function cleanSentence(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/n\/root\/Projects\/Cources\/ComprehensiveProject\/CliSearch\//g, "")
    .replace(/\/root\/Projects\/Cources\/ComprehensiveProject\/CliSearch\//g, "")
    .replace(/\/root\/Projects\/Cources\/ComprehensiveProject\//g, "")
    .replace(/(^|\s)([ab])\//g, "$1")
    .replace(/# Files mentioned by the user:.*/i, "")
    .replace(/<subagent_notification>.*$/i, "")
    .trim()
}

function hasFileExtension(value: string): boolean {
  return /\.(?:[cm]?[jt]sx?|json|md|prisma|sql|ya?ml|toml|rs|go|py|java|kt|swift|php|rb)$/i.test(
    value,
  )
}

function hasPathShape(value: string): boolean {
  if (!/[./]/.test(value)) return false
  if (!/[a-z0-9_-]+\.[a-z0-9]+/i.test(value) && !value.includes("/src/")) return false
  return true
}

function isBoilerplate(value: string): boolean {
  return (
    /^该任务(的)?(部分验证通过|没有记录到|没有找到|未形成|证据不足)/.test(value) ||
    /^没有记录到(明确的)?(修改|验证|证据)/.test(value)
  )
}

function round(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000
}

function describeError(error: unknown) {
  if (isApiClientLikeError(error)) {
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

type ApiClientLikeError = Error & {
  readonly code: string
  readonly details?: unknown
  readonly status: number
}

function isApiClientLikeError(error: unknown): error is ApiClientLikeError {
  return (
    error instanceof Error &&
    typeof (error as { readonly code?: unknown }).code === "string" &&
    typeof (error as { readonly status?: unknown }).status === "number"
  )
}
