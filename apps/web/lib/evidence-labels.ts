import type { AttemptOutcome, ExperienceOutcome, FailedAttemptRisk, OperationKind } from "@agent-log-search/shared"

const EXPERIENCE_OUTCOME_LABELS: Readonly<Record<ExperienceOutcome, string>> = {
  FAILED: "历史失败尝试",
  PARTIAL: "部分验证",
  SUCCEEDED: "经过验证",
  UNKNOWN: "证据不足",
}

const ATTEMPT_OUTCOME_LABELS: Readonly<Record<AttemptOutcome, string>> = {
  FAILED: "失败",
  PARTIAL: "部分验证",
  SUCCEEDED: "成功",
  UNVERIFIED: "未验证",
}

const OPERATION_KIND_LABELS: Readonly<Record<OperationKind, string>> = {
  BUILD: "构建",
  FILE_DELETE: "删除文件",
  FILE_PATCH: "修改补丁",
  FILE_READ: "读取文件",
  FILE_WRITE: "写入文件",
  GIT: "Git",
  LINT: "Lint",
  NONE: "无操作",
  OTHER: "其他",
  PACKAGE_CHANGE: "依赖变更",
  SEARCH: "搜索",
  SHELL: "Shell",
  TEST: "测试",
  TYPECHECK: "类型检查",
}

const FAILED_ATTEMPT_RISK_LABELS: Readonly<Record<FailedAttemptRisk, string>> = {
  high: "高相似风险",
  low: "低相似风险",
  medium: "中等相似风险",
  none: "未匹配历史失败",
}

const REASON_CODE_LABELS: Readonly<Record<string, string>> = {
  ASSISTANT_CLAIM_IGNORED: "未将 Agent 自述视为验证证据",
  HAS_FAILED_ATTEMPT: "观察到失败尝试",
  HAS_FILE_MUTATION: "观察到文件修改",
  HAS_TEST_SUMMARY: "观察到测试摘要",
  NO_POST_MUTATION_VALIDATION: "没有找到修改后的验证结果",
  TEST_SUMMARY_HAS_FAILURES: "测试摘要包含失败项",
  TEST_SUMMARY_ZERO_FAILURES: "测试摘要未发现失败项",
  TOOL_RESULT_MISSING: "缺少工具结果",
  VALIDATION_EXIT_CODE_NONZERO: "验证命令退出码非 0",
  VALIDATION_EXIT_CODE_ZERO: "验证命令退出码为 0",
  VALIDATION_FAILED: "验证结果失败",
  VALIDATION_PASSED: "验证结果通过",
}

export function formatExperienceOutcome(outcome: ExperienceOutcome): string {
  return EXPERIENCE_OUTCOME_LABELS[outcome]
}

export function formatAttemptOutcome(outcome: AttemptOutcome): string {
  return ATTEMPT_OUTCOME_LABELS[outcome]
}

export function formatOperationKind(kind: OperationKind): string {
  return OPERATION_KIND_LABELS[kind]
}

export function formatFailedAttemptRisk(risk: FailedAttemptRisk): string {
  return FAILED_ATTEMPT_RISK_LABELS[risk]
}

export function formatReasonCode(code: string): string {
  return REASON_CODE_LABELS[code] ?? code
}
