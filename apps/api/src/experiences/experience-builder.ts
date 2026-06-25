import path from "node:path"
import type { ExperienceOutcome } from "@agent-log-search/shared"
import { SecretRedactor } from "../evidence/redaction/secret-redactor.js"
import {
  EXPERIENCE_BUILDER_VERSION,
  EXPERIENCE_SEARCH_DOCUMENT_VERSION,
} from "../pipeline-versions.js"
import { buildAttempts } from "./attempt-builder.js"
import { segmentEpisodes } from "./episode-segmenter.js"
import type {
  AttemptDraft,
  BuiltExperienceDraft,
  EpisodeDraft,
  ExperienceTraceEvent,
} from "./experience.types.js"

export function buildExperiences(input: {
  readonly events: readonly ExperienceTraceEvent[]
  readonly sourceRevision: number
  readonly cwd: string | null
  readonly repoKey?: string | null
}): readonly BuiltExperienceDraft[] {
  const redactor = new SecretRedactor()
  return segmentEpisodes(input.events)
    .map((episode) => buildExperienceFromEpisode(episode, input, redactor))
    .filter((experience): experience is BuiltExperienceDraft => experience !== null)
}

function buildExperienceFromEpisode(
  episode: EpisodeDraft,
  input: {
    readonly sourceRevision: number
    readonly cwd: string | null
    readonly repoKey?: string | null
  },
  redactor: SecretRedactor,
): BuiltExperienceDraft | null {
  const attempts = buildAttempts(episode)
  const kind = classifyExperienceKind(episode, attempts)
  if (kind === "informational") {
    return null
  }
  const outcome = resolveExperienceOutcome(attempts)
  const pathTokens = unique(episode.events.flatMap((event) => event.pathTokens))
  const errorSignatures = unique(episode.events.flatMap((event) => event.errorSignatures))
  const errorCodes = unique(episode.events.flatMap((event) => event.errorCodes))
  const commandFamilies = unique(episode.events.flatMap((event) => event.commandFamilies))
  const failedAttemptCount = attempts.filter((attempt) => attempt.outcome === "FAILED").length
  const successfulAttemptCount = attempts.filter(
    (attempt) => attempt.outcome === "SUCCEEDED",
  ).length
  const unverifiedAttemptCount = attempts.filter(
    (attempt) => attempt.outcome === "UNVERIFIED",
  ).length
  const evidence = scoreEvidence(kind, episode, attempts)
  const title = buildTitle(outcome, episode, pathTokens, errorCodes)
  const templateSummary = buildSummary(
    kind,
    outcome,
    attempts,
    pathTokens,
    errorCodes,
    commandFamilies,
  )
  const searchText = buildSearchText({
    taskText: episode.taskText,
    outcome,
    errorCodes,
    errors: episode.events.flatMap(
      (event) =>
        event.facts.errors?.map((error) => error.normalizedMessage ?? "").filter(Boolean) ?? [],
    ),
    excerpts: episode.events.flatMap((event) => event.redactedExcerpt ?? []),
    paths: pathTokens,
    actionTokens: attempts.flatMap((attempt) => attempt.actionTokens),
    commandFamilies,
    failedAttemptCount,
    successfulAttemptCount,
    unverifiedAttemptCount,
    redactor,
  })

  return {
    episodeIndex: episode.episodeIndex,
    sourceRevision: input.sourceRevision,
    startSeq: episode.startSeq,
    endSeq: episode.endSeq,
    kind,
    title,
    taskText: episode.taskText,
    templateSummary,
    outcome,
    evidenceScore: evidence.score,
    evidenceLevel: evidence.level,
    evidenceReasonCodes: evidence.reasonCodes,
    repoKey: input.repoKey ?? null,
    cwd: input.cwd,
    pathTokens,
    symbolTokens: [],
    errorSignatures,
    errorCodes,
    commandFamilies,
    failedAttemptCount,
    successfulAttemptCount,
    unverifiedAttemptCount,
    searchText,
    attempts,
  }
}

function classifyExperienceKind(
  episode: EpisodeDraft,
  attempts: readonly AttemptDraft[],
): "change" | "diagnostic" | "informational" {
  if (attempts.length > 0) return "change"
  const hasEvidence = episode.events.some(
    (event) =>
      event.commandFamilies.length > 0 ||
      event.errorSignatures.length > 0 ||
      event.pathTokens.length > 0,
  )
  return hasEvidence ? "diagnostic" : "informational"
}

function resolveExperienceOutcome(attempts: readonly AttemptDraft[]): ExperienceOutcome {
  if (attempts.length === 0) return "UNKNOWN"
  if (attempts.every((attempt) => attempt.outcome === "UNVERIFIED")) return "UNKNOWN"
  const last = attempts[attempts.length - 1]
  switch (last?.outcome) {
    case "SUCCEEDED":
      return "SUCCEEDED"
    case "FAILED":
      return "FAILED"
    case "PARTIAL":
      return "PARTIAL"
    case "UNVERIFIED":
    case undefined:
      return "UNKNOWN"
  }
}

function buildTitle(
  outcome: ExperienceOutcome,
  episode: EpisodeDraft,
  paths: readonly string[],
  errorCodes: readonly string[],
): string {
  const topFile = paths[0]
  const errorCode = errorCodes[0]
  if (errorCode !== undefined && topFile !== undefined) {
    return `${errorCode} · ${path.basename(topFile)}`
  }
  if (topFile !== undefined) {
    return `${outcomeLabel(outcome)} · ${path.basename(topFile)}`
  }
  return truncate(firstSentence(episode.taskText), 80)
}

function buildSummary(
  kind: "change" | "diagnostic",
  outcome: ExperienceOutcome,
  attempts: readonly AttemptDraft[],
  paths: readonly string[],
  errorCodes: readonly string[],
  commandFamilies: readonly string[],
): string {
  if (kind === "diagnostic") {
    return `该记录包含 ${commandFamilies.length.toString()} 个命令和 ${errorCodes.length.toString()} 个错误证据，未发现文件修改。`
  }
  const topPaths = paths.slice(0, 3).join(", ") || "未识别文件"
  const validationLabel = commandFamilies.includes("test")
    ? "测试"
    : (commandFamilies.find((family) => family !== "package") ?? "验证")
  if (outcome === "SUCCEEDED") {
    return `该任务包含 ${attempts.length.toString()} 次修改尝试；最后一次涉及 ${topPaths}，随后 ${validationLabel} 验证通过。`
  }
  if (outcome === "FAILED") {
    const topErrors = errorCodes.slice(0, 3).join(", ") || "错误证据"
    return `该任务包含 ${attempts.length.toString()} 次修改尝试；最后一次涉及 ${topPaths}，随后验证失败，观察到 ${topErrors}。`
  }
  if (outcome === "PARTIAL") {
    return "该任务的部分验证通过，但仍存在更高范围或后续验证失败。"
  }
  return "该任务包含文件修改，但未发现修改后的测试、构建、类型检查或 lint 结果。"
}

function scoreEvidence(
  kind: "change" | "diagnostic",
  episode: EpisodeDraft,
  attempts: readonly AttemptDraft[],
): {
  readonly score: number
  readonly level: "A" | "B" | "C" | "D"
  readonly reasonCodes: readonly string[]
} {
  const hasExactPairing = episode.events.some((event) => event.pairingQuality === "EXACT")
  const hasCommand = episode.events.some((event) => event.commandFamilies.length > 0)
  const hasExitCode = episode.events.some(
    (event) => event.facts.processResult?.exitCode !== undefined,
  )
  const hasTestSummary = episode.events.some((event) => event.facts.testSummary !== undefined)
  const hasError = episode.events.some((event) => event.errorSignatures.length > 0)
  const hasPath = episode.events.some((event) => event.pathTokens.length > 0)
  const hasPostMutationValidation = attempts.some((attempt) =>
    attempt.evidenceLinks.some((link) => link.role === "VALIDATION"),
  )
  const hasRawPointer = episode.events.some((event) => event.rawPointer !== undefined)
  const score =
    kind === "change"
      ? weight(hasExactPairing, 0.1) +
        weight(hasPath, 0.15) +
        weight(hasCommand, 0.1) +
        weight(hasExitCode, 0.15) +
        weight(hasTestSummary, 0.2) +
        weight(hasError, 0.1) +
        weight(hasPostMutationValidation, 0.15) +
        weight(hasRawPointer, 0.05)
      : weight(hasExactPairing, 0.15) +
        weight(hasCommand, 0.2) +
        weight(hasExitCode, 0.2) +
        weight(hasTestSummary, 0.15) +
        weight(hasError, 0.2) +
        weight(hasRawPointer, 0.1)
  const reasonCodes = [
    ...(hasExactPairing ? ["HAS_EXACT_TOOL_PAIRING"] : ["MISSING_EXACT_TOOL_PAIRING"]),
    ...(hasPostMutationValidation
      ? ["HAS_POST_MUTATION_VALIDATION"]
      : ["MISSING_POST_MUTATION_VALIDATION"]),
    ...(hasTestSummary ? ["HAS_TEST_SUMMARY"] : []),
    ...(hasError ? ["HAS_ERROR_EVIDENCE"] : []),
  ]
  return { score, level: evidenceLevel(score), reasonCodes }
}

function buildSearchText(input: {
  readonly taskText: string
  readonly outcome: ExperienceOutcome
  readonly errorCodes: readonly string[]
  readonly errors: readonly string[]
  readonly excerpts: readonly string[]
  readonly paths: readonly string[]
  readonly actionTokens: readonly string[]
  readonly commandFamilies: readonly string[]
  readonly failedAttemptCount: number
  readonly successfulAttemptCount: number
  readonly unverifiedAttemptCount: number
  readonly redactor: SecretRedactor
}): string {
  const text = [
    "task:",
    input.taskText,
    "",
    "outcome:",
    input.outcome.toLocaleLowerCase("en-US"),
    "",
    "diagnostic excerpts:",
    ...prioritizedExcerpts(input.excerpts),
    "",
    "errors:",
    ...input.errorCodes,
    ...input.errors.slice(0, 10).map((error) => trimSearchLine(error)),
    "",
    "files:",
    ...input.paths,
    "",
    "actions:",
    ...input.actionTokens,
    "",
    "commands:",
    ...input.commandFamilies,
    "",
    "failed attempts:",
    input.failedAttemptCount.toString(),
    "successful attempts:",
    input.successfulAttemptCount.toString(),
    "unverified attempts:",
    input.unverifiedAttemptCount.toString(),
    "",
    `versions: ${EXPERIENCE_BUILDER_VERSION} ${EXPERIENCE_SEARCH_DOCUMENT_VERSION}`,
  ].join("\n")
  return input.redactor.redact(text.length > 8_000 ? text.slice(0, 8_000) : text).text
}

function prioritizedExcerpts(excerpts: readonly string[]): readonly string[] {
  const cleaned = unique(
    excerpts
      .map((excerpt) => excerpt.replace(/\s+/g, " ").trim())
      .filter((excerpt) => excerpt.length > 0),
  )
  const withSignals = cleaned.filter(hasSearchSignal)
  const withoutSignals = cleaned.filter((excerpt) => !hasSearchSignal(excerpt))
  return [...withSignals, ...withoutSignals].slice(0, 20).map((excerpt) => trimSearchLine(excerpt))
}

function hasSearchSignal(value: string): boolean {
  return (
    /\b(?:error|exception|invalid|failed|fail|prisma|findunique|ts\d{4})\b/i.test(value) ||
    /[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/.test(value)
  )
}

function trimSearchLine(value: string): string {
  return value.length <= 500 ? value : value.slice(0, 500)
}

function evidenceLevel(score: number): "A" | "B" | "C" | "D" {
  if (score >= 0.85) return "A"
  if (score >= 0.7) return "B"
  if (score >= 0.5) return "C"
  return "D"
}

function weight(present: boolean, value: number): number {
  return present ? value : 0
}

function outcomeLabel(outcome: ExperienceOutcome): string {
  switch (outcome) {
    case "SUCCEEDED":
      return "成功"
    case "FAILED":
      return "失败"
    case "PARTIAL":
      return "部分"
    case "UNKNOWN":
      return "未验证"
  }
}

function firstSentence(value: string): string {
  return value.split(/[。.!?\n]/)[0]?.trim() || value.trim() || "Untitled task"
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max)
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.length > 0))]
}
