"use client"

import type { ExperienceAttempt, ExperienceSummary } from "@agent-log-search/shared"

export function displayToken(value: string): string {
  return value
    .trim()
    .replaceAll("\\", "/")
    .replace(/^n\/root\/Projects\/Cources\/ComprehensiveProject\/CliSearch\//, "")
    .replace(/^\/root\/Projects\/Cources\/ComprehensiveProject\/CliSearch\//, "")
    .replace(/^\/root\/Projects\/Cources\/ComprehensiveProject\//, "")
    .replace(/^\/host-history\//, "history/")
    .replace(/^['"`]+|['"`]+$/g, "")
}

export function displayTokens(
  values: readonly string[],
  options: {
    readonly limit?: number
    readonly preferPaths?: boolean
  } = {},
): readonly string[] {
  const limit = options.limit ?? 8
  const cleaned = values
    .map(displayToken)
    .filter((token) => isUsefulDisplayToken(token, options.preferPaths ?? false))
  return [...new Set(cleaned)].slice(0, limit)
}

export function compactSummary(
  experience: Pick<ExperienceSummary, "taskText" | "templateSummary">,
) {
  const summary = cleanSentence(experience.templateSummary)
  if (summary.length > 0 && !isBoilerplateSummary(summary)) {
    return summary
  }
  return cleanSentence(experience.taskText)
}

export function describeAttempt(attempt: ExperienceAttempt): string {
  const paths = displayTokens(attempt.affectedPaths, { limit: 3, preferPaths: true })
  const symbols = displayTokens(attempt.affectedSymbols, { limit: 3 })
  const commands = displayTokens(attempt.commandFamilies, { limit: 3 })
  if (paths.length > 0) {
    return `修改 ${paths.join("、")}`
  }
  if (symbols.length > 0) {
    return `涉及 ${symbols.join("、")}`
  }
  if (commands.length > 0) {
    return `执行 ${commands.join("、")}`
  }
  return displayToken(attempt.actionSignature)
}

export function validationSummary(attempt: ExperienceAttempt): readonly string[] {
  return displayTokens([...attempt.commandFamilies, ...attempt.errorAfter], { limit: 5 })
}

export function relevantExperiencePaths(experience: ExperienceSummary): readonly string[] {
  return displayTokens(
    [
      ...experience.matchedPaths,
      ...experience.attempts.flatMap((attempt) => attempt.affectedPaths),
      ...experience.pathTokens,
    ],
    { limit: 8, preferPaths: true },
  )
}

export function relevantExperienceErrors(experience: ExperienceSummary): readonly string[] {
  return displayTokens(
    [...experience.matchedErrors, ...experience.errorCodes, ...experience.errorSignatures],
    { limit: 6 },
  )
}

export function relevantCommands(experience: ExperienceSummary): readonly string[] {
  return displayTokens(
    [
      ...experience.attempts.flatMap((attempt) => attempt.commandFamilies),
      ...experience.commandFamilies,
    ],
    { limit: 5 },
  )
}

export function isUsefulDisplayToken(token: string, preferPath: boolean): boolean {
  if (token.length < 2) return false
  if (/^\d+$/.test(token)) return false
  if (/^[a-f0-9]{12,}$/i.test(token)) return false
  if (/^[a-f0-9-]{16,}$/i.test(token)) return false
  if (/^message:\d+/i.test(token)) return false
  if (preferPath) {
    return token.includes("/") || hasFileExtension(token)
  }
  return true
}

export function cleanSentence(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/# Files mentioned by the user:.*/i, "")
    .replace(/<subagent_notification>.*$/i, "")
    .trim()
}

export function hiddenCount(values: readonly string[], shown: readonly string[]): number {
  return Math.max(0, new Set(values.map(displayToken)).size - shown.length)
}

function isBoilerplateSummary(value: string): boolean {
  return (
    /^该任务(的)?(部分验证通过|没有记录到|没有找到|未形成|证据不足)/.test(value) ||
    /^没有记录到(明确的)?(修改|验证|证据)/.test(value)
  )
}

function hasFileExtension(value: string): boolean {
  return /\.(?:[cm]?[jt]sx?|json|md|prisma|sql|ya?ml|toml|rs|go|py|java|kt|swift|php|rb)$/i.test(
    value,
  )
}
