import type { ExperienceScoreBreakdown } from "@agent-log-search/shared"
import type { ExperienceQueryFeatures } from "./query-feature-extractor.js"

export type RankableExperience = {
  readonly id: string
  readonly outcome: "SUCCEEDED" | "FAILED" | "PARTIAL" | "UNKNOWN"
  readonly evidenceScore: number
  readonly searchText: string
  readonly pathTokens: readonly string[]
  readonly symbolTokens: readonly string[]
  readonly errorCodes: readonly string[]
  readonly errorSignatures: readonly string[]
  readonly commandFamilies: readonly string[]
  readonly updatedAt?: Date | undefined
}

export type RankedExperience = {
  readonly id: string
  readonly finalScore: number
  readonly scoreBreakdown: ExperienceScoreBreakdown
  readonly matchedPaths: readonly string[]
  readonly matchedErrors: readonly string[]
  readonly updatedAtMs: number
}

export function rankExperiences(
  candidates: readonly RankableExperience[],
  features: ExperienceQueryFeatures,
  topK: number,
): readonly RankedExperience[] {
  return candidates
    .map((candidate) => scoreExperience(candidate, features))
    .filter((ranked) => ranked.finalScore >= 0.05)
    .sort(
      (a, b) =>
        b.finalScore - a.finalScore ||
        b.updatedAtMs - a.updatedAtMs ||
        Number(BigInt(b.id) - BigInt(a.id)),
    )
    .slice(0, topK)
}

function scoreExperience(
  candidate: RankableExperience,
  features: ExperienceQueryFeatures,
): RankedExperience {
  const lexical = lexicalScore(candidate.searchText, features.lexicalText)
  const errorMatch = overlapScore(candidate.errorCodes, features.errorCodes)
  const pathMatch = pathScore(candidate.pathTokens, features.pathTokens)
  const symbolMatch = overlapScore(candidate.symbolTokens, features.symbolTokens)
  const commandMatch = overlapScore(candidate.commandFamilies, features.commandFamilies)
  const weighted = weightedAverage([
    { available: features.lexicalText.length > 0, score: lexical, weight: 0.2 },
    { available: features.errorCodes.length > 0, score: errorMatch, weight: 0.25 },
    { available: features.pathTokens.length > 0, score: pathMatch, weight: 0.3 },
    { available: features.symbolTokens.length > 0, score: symbolMatch, weight: 0.15 },
    { available: features.commandFamilies.length > 0, score: commandMatch, weight: 0.1 },
  ])
  const relevance = weighted ?? lexical
  const evidenceFactor = 0.55 + 0.45 * clamp(candidate.evidenceScore)
  const focusFactor = focusFactorFor(candidate)
  const finalScore = relevance * evidenceFactor * focusFactor
  return {
    id: candidate.id,
    finalScore,
    scoreBreakdown: {
      lexical,
      errorMatch,
      pathMatch,
      symbolMatch,
      commandMatch,
      evidenceFactor,
      finalScore,
    },
    matchedPaths: matchingPathTokens(candidate.pathTokens, features.pathTokens),
    matchedErrors: matchingTokens(candidate.errorCodes, features.errorCodes),
    updatedAtMs: candidate.updatedAt?.getTime() ?? 0,
  }
}

function focusFactorFor(candidate: RankableExperience): number {
  const pathCount = new Set(candidate.pathTokens).size
  if (pathCount <= 120) {
    return 1
  }
  if (pathCount <= 500) {
    return 0.92
  }
  if (pathCount <= 1_000) {
    return 0.82
  }
  return 0.7
}

function lexicalScore(searchText: string, lexicalText: string): number {
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
): number | null {
  const available = signals.filter((signal) => signal.available)
  const totalWeight = available.reduce((sum, signal) => sum + signal.weight, 0)
  if (totalWeight === 0) {
    return null
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

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value))
}
