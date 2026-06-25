import type {
  ExperienceFailedAttemptCheckRequest,
  ExperienceFailedAttemptCheckResponse,
  FailedAttemptMatch,
  FailedAttemptMatchRisk,
  FailedAttemptRisk,
  FailedAttemptScoreBreakdown,
} from "@agent-log-search/shared"
import { Injectable } from "@nestjs/common"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { PrismaService } from "../database/prisma.service.js"
import {
  assertExperienceSearchEnabled,
  toEvidenceEventSummary,
  toExperienceAttempt,
} from "./experience-search.service.js"
import { extractFailedAttemptCheckFeatures } from "./query-feature-extractor.js"

type FailedAttemptRecord = Awaited<
  ReturnType<FailedAttemptSearchService["readFailedAttemptCandidates"]>
>[number]
type EvidenceEventRecord = Awaited<
  ReturnType<FailedAttemptSearchService["readEvidenceEvents"]>
>[number]

type ScoredFailedAttempt = {
  readonly record: FailedAttemptRecord
  readonly score: number
  readonly risk: FailedAttemptMatchRisk
  readonly matchedActionTokens: readonly string[]
  readonly matchedPaths: readonly string[]
  readonly matchedSymbols: readonly string[]
  readonly matchedCommandFamilies: readonly string[]
  readonly matchedErrors: readonly string[]
  readonly scoreBreakdown: FailedAttemptScoreBreakdown
}

const SIMILAR_FAILED_ATTEMPT_MESSAGE = "计划操作与一条历史失败尝试高度相似。"

@Injectable()
export class FailedAttemptSearchService {
  public constructor(private readonly prisma: PrismaService) {}

  public async check(
    input: ExperienceFailedAttemptCheckRequest,
  ): Promise<ExperienceFailedAttemptCheckResponse> {
    assertExperienceSearchEnabled()
    const features = extractFailedAttemptCheckFeatures(input)
    const candidates = await this.readFailedAttemptCandidates()
    const scored = candidates
      .map((record) => scoreFailedAttempt(record, features))
      .filter((entry): entry is ScoredFailedAttempt => entry !== null)
      .sort((a, b) => b.score - a.score || Number(a.record.id - b.record.id))
      .slice(0, input.topK)

    if (scored.length === 0) {
      return { risk: "none", message: null, matches: [] }
    }
    const eventIds = [
      ...new Set(
        scored.flatMap((entry) =>
          entry.record.evidenceLinks.map((link) => link.traceEventId.toString()),
        ),
      ),
    ].map((id) => BigInt(id))
    const evidenceEvents = await this.readEvidenceEvents(eventIds)
    const eventsById = new Map(evidenceEvents.map((event) => [event.id.toString(), event]))
    const matches = scored.map((entry) => toFailedAttemptMatch(entry, eventsById))
    return {
      risk: highestRisk(matches.map((match) => match.risk)),
      message: SIMILAR_FAILED_ATTEMPT_MESSAGE,
      matches,
    }
  }

  private async readFailedAttemptCandidates() {
    return this.prisma.agentAttempt.findMany({
      where: {
        outcome: "FAILED",
        experience: {
          session: {
            experienceBuildStatus: "READY",
          },
        },
      },
      include: {
        evidenceLinks: true,
        experience: {
          include: {
            session: { select: { traceRevision: true } },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 200,
    })
  }

  private async readEvidenceEvents(ids: readonly bigint[]) {
    if (ids.length === 0) {
      return []
    }
    return this.prisma.agentTraceEvent.findMany({
      where: { id: { in: [...ids] } },
      orderBy: [{ seqNo: "asc" }, { subSeqNo: "asc" }, { id: "asc" }],
    })
  }
}

function scoreFailedAttempt(
  record: FailedAttemptRecord,
  features: ReturnType<typeof extractFailedAttemptCheckFeatures>,
): ScoredFailedAttempt | null {
  if (record.experience.sourceRevision !== record.experience.session.traceRevision) {
    return null
  }
  const taskSimilarity = lexicalSimilarity(record.experience.searchText, features.lexicalText)
  const actionTokenMatch = overlapScore(record.actionTokens, features.actionTokens)
  const pathMatch = pathScore(record.affectedPaths, features.pathTokens)
  const symbolMatch = overlapScore(record.affectedSymbols, features.symbolTokens)
  const commandMatch = overlapScore(record.commandFamilies, features.commandFamilies)
  const structuredMatch = Math.max(actionTokenMatch, pathMatch, symbolMatch, commandMatch)
  const score = Math.max(
    weightedAverage([
      { available: features.lexicalText.length > 0, score: taskSimilarity, weight: 0.2 },
      { available: features.actionTokens.length > 0, score: actionTokenMatch, weight: 0.3 },
      { available: features.pathTokens.length > 0, score: pathMatch, weight: 0.25 },
      { available: features.symbolTokens.length > 0, score: symbolMatch, weight: 0.15 },
      { available: features.commandFamilies.length > 0, score: commandMatch, weight: 0.1 },
    ]),
    structuredMatch * 0.75,
  )
  if (score < 0.2) {
    return null
  }

  return {
    record,
    score,
    risk: scoreToRisk(score),
    matchedActionTokens: matchingTokens(record.actionTokens, features.actionTokens),
    matchedPaths: matchingPathTokens(record.affectedPaths, features.pathTokens),
    matchedSymbols: matchingTokens(record.affectedSymbols, features.symbolTokens),
    matchedCommandFamilies: matchingTokens(record.commandFamilies, features.commandFamilies),
    matchedErrors: matchingTokens(
      [...record.errorBefore, ...record.errorAfter],
      [...features.errorCodes, ...features.errorTextTokens],
    ),
    scoreBreakdown: {
      taskSimilarity,
      actionTokenMatch,
      pathMatch,
      symbolMatch,
      commandMatch,
      finalScore: score,
    },
  }
}

function toFailedAttemptMatch(
  scored: ScoredFailedAttempt,
  eventsById: ReadonlyMap<string, EvidenceEventRecord>,
): FailedAttemptMatch {
  const record = scored.record
  return {
    risk: scored.risk,
    score: scored.score,
    message: SIMILAR_FAILED_ATTEMPT_MESSAGE,
    experience: {
      id: record.experience.id.toString(),
      sessionId: record.experience.sessionId.toString(),
      sourceRevision: record.experience.sourceRevision,
      title: record.experience.title,
      taskText: record.experience.taskText,
      outcome: record.experience.outcome,
      evidenceScore: record.experience.evidenceScore,
      evidenceLevel: record.experience.evidenceLevel,
      repoKey: record.experience.repoKey,
      cwd: record.experience.cwd,
      updatedAt: record.experience.updatedAt.toISOString(),
    },
    attempt: toExperienceAttempt(record),
    evidenceEvents: record.evidenceLinks
      .map((link) => eventsById.get(link.traceEventId.toString()))
      .filter((event): event is NonNullable<typeof event> => event !== undefined)
      .map(toEvidenceEventSummary),
    matchedActionTokens: [...scored.matchedActionTokens],
    matchedPaths: [...scored.matchedPaths],
    matchedSymbols: [...scored.matchedSymbols],
    matchedCommandFamilies: [...scored.matchedCommandFamilies],
    matchedErrors: [...scored.matchedErrors],
    scoreBreakdown: scored.scoreBreakdown,
  }
}

function scoreToRisk(score: number): FailedAttemptMatchRisk {
  if (score >= 0.8) return "high"
  if (score >= 0.6) return "medium"
  return "low"
}

function highestRisk(risks: readonly FailedAttemptMatchRisk[]): FailedAttemptRisk {
  if (risks.includes("high")) return "high"
  if (risks.includes("medium")) return "medium"
  return risks.length === 0 ? "none" : "low"
}

function lexicalSimilarity(searchText: string, lexicalText: string): number {
  if (lexicalText.trim().length === 0) {
    return 0
  }
  const haystack = tokenSet(searchText)
  const needles = tokenSet(lexicalText)
  if (needles.size === 0) {
    return 0
  }
  let matches = 0
  for (const token of needles) {
    if (haystack.has(token)) matches += 1
  }
  return matches / needles.size
}

function overlapScore(candidate: readonly string[], query: readonly string[]): number {
  if (query.length === 0) {
    return 0
  }
  return matchingTokens(candidate, query).length / new Set(query).size
}

function pathScore(candidate: readonly string[], query: readonly string[]): number {
  if (query.length === 0) {
    return 0
  }
  const scores = [...new Set(query)].map((queryPath) => {
    let best = 0
    for (const candidatePath of candidate) {
      best = Math.max(best, singlePathScore(candidatePath, queryPath))
    }
    return best
  })
  return scores.reduce((sum, score) => sum + score, 0) / scores.length
}

function singlePathScore(candidatePath: string, queryPath: string): number {
  if (candidatePath === queryPath) return 1
  const candidateParts = candidatePath.split("/")
  const queryParts = queryPath.split("/")
  if (endsWithParts(candidateParts, queryParts) || endsWithParts(queryParts, candidateParts))
    return 0.95
  if (candidateParts.slice(-2).join("/") === queryParts.slice(-2).join("/")) return 0.85
  if (candidateParts.at(-1) === queryParts.at(-1)) return 0.65
  if (queryParts.length === 1 && candidateParts.includes(queryPath)) return 0.75
  return jaccard(candidateParts, queryParts) * 0.5
}

function endsWithParts(parts: readonly string[], suffix: readonly string[]): boolean {
  if (suffix.length === 0 || suffix.length > parts.length) {
    return false
  }
  return suffix.every((part, index) => parts[parts.length - suffix.length + index] === part)
}

function weightedAverage(
  signals: readonly {
    readonly available: boolean
    readonly score: number
    readonly weight: number
  }[],
): number {
  const available = signals.filter((signal) => signal.available)
  const totalWeight = available.reduce((sum, signal) => sum + signal.weight, 0)
  if (totalWeight === 0) {
    return 0
  }
  return available.reduce((sum, signal) => sum + signal.score * signal.weight, 0) / totalWeight
}

function matchingTokens(candidate: readonly string[], query: readonly string[]): readonly string[] {
  const candidateSet = new Set(candidate)
  return [...new Set(query.filter((token) => candidateSet.has(token)))]
}

function matchingPathTokens(
  candidate: readonly string[],
  query: readonly string[],
): readonly string[] {
  return [
    ...new Set(
      query.filter((queryPath) =>
        candidate.some((candidatePath) => singlePathScore(candidatePath, queryPath) >= 0.65),
      ),
    ),
  ]
}

function tokenSet(value: string): ReadonlySet<string> {
  return new Set(
    value
      .toLocaleLowerCase("en-US")
      .split(/[^a-z0-9_.:/-]+/i)
      .flatMap(expandToken)
      .filter((token) => token.length > 1),
  )
}

function expandToken(token: string): readonly string[] {
  return [token, ...token.split(/[._:/-]+/)].filter((value) => value.length > 1)
}

function jaccard(left: readonly string[], right: readonly string[]): number {
  const leftSet = new Set(left)
  const rightSet = new Set(right)
  const intersection = [...leftSet].filter((value) => rightSet.has(value)).length
  const union = new Set([...left, ...right]).size
  return union === 0 ? 0 : intersection / union
}
