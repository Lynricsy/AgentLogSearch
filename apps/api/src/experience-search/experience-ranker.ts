import type { ExperienceScoreBreakdown } from "@agent-log-search/shared"
import type { ExperienceQueryFeatures } from "./query-feature-extractor.js"

export type RankableExperience = {
  readonly id: string
  readonly outcome: "SUCCEEDED" | "FAILED" | "PARTIAL" | "UNKNOWN"
  readonly evidenceScore: number
  readonly searchText: string
  readonly title?: string | undefined
  readonly taskText?: string | undefined
  readonly templateSummary?: string | undefined
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

type IndexedExperience = RankableExperience & {
  readonly normalizedSearchText: string
  readonly searchTokens: ReadonlySet<string>
  readonly titleTokens: ReadonlySet<string>
  readonly taskTokens: ReadonlySet<string>
  readonly summaryTokens: ReadonlySet<string>
  readonly pathTokenSet: ReadonlySet<string>
  readonly symbolTokenSet: ReadonlySet<string>
  readonly errorTokenSet: ReadonlySet<string>
  readonly commandTokenSet: ReadonlySet<string>
}

type CorpusStats = {
  readonly documentCount: number
  readonly tokenDocumentFrequency: ReadonlyMap<string, number>
}
type CandidateIndex = ReadonlyMap<string, readonly number[]>

const MAX_INDEX_TEXT_LENGTH = 2_600
const MAX_PATH_TOKENS = 160
const MAX_SYMBOL_TOKENS = 120
const MAX_ERROR_TOKENS = 80
const MAX_SCORING_CANDIDATES = 360

export type ExperienceRanker = {
  readonly search: (features: ExperienceQueryFeatures, topK: number) => readonly RankedExperience[]
}

export function createExperienceRanker(
  candidates: readonly RankableExperience[],
): ExperienceRanker {
  const indexed = candidates.map(indexExperience)
  const stats = buildCorpusStats(indexed)
  const candidateIndex = buildCandidateIndex(indexed)
  return {
    search: (features, topK) =>
      rankIndexedExperiences(indexed, stats, candidateIndex, features, topK),
  }
}

export function rankExperiences(
  candidates: readonly RankableExperience[],
  features: ExperienceQueryFeatures,
  topK: number,
): readonly RankedExperience[] {
  return createExperienceRanker(candidates).search(features, topK)
}

function rankIndexedExperiences(
  candidates: readonly IndexedExperience[],
  stats: CorpusStats,
  candidateIndex: CandidateIndex,
  features: ExperienceQueryFeatures,
  topK: number,
): readonly RankedExperience[] {
  const query = toIndexedQuery(features)
  const candidateSubset = candidatesForQuery(candidates, candidateIndex, stats, features, query)
  return candidateSubset
    .map((candidate) => scoreExperience(candidate, stats, features, query))
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
  candidate: IndexedExperience,
  stats: CorpusStats,
  features: ExperienceQueryFeatures,
  query: ReadonlySet<string>,
): RankedExperience {
  const lexical = lexicalScore(candidate, query, stats)
  const phraseMatch = phraseScore(candidate, features.query)
  const errorMatch = overlapScore(candidate.errorTokenSet, features.errorCodes)
  const pathMatch = pathScore(candidate.pathTokens, features.pathTokens)
  const symbolMatch = overlapScore(candidate.symbolTokenSet, features.symbolTokens)
  const commandMatch = overlapScore(candidate.commandTokenSet, features.commandFamilies)
  const weights = weightsFor(features)
  const weighted = weightedAverage([
    { available: query.size > 0, score: lexical, weight: weights.lexical },
    { available: features.errorCodes.length > 0, score: errorMatch, weight: weights.error },
    { available: features.pathTokens.length > 0, score: pathMatch, weight: weights.path },
    { available: features.symbolTokens.length > 0, score: symbolMatch, weight: weights.symbol },
    {
      available: features.commandFamilies.length > 0,
      score: commandMatch,
      weight: weights.command,
    },
  ])
  const relevance = weighted ?? lexical
  const evidenceFactor = 0.55 + 0.45 * clamp(candidate.evidenceScore)
  const focusFactor = focusFactorFor(candidate)
  const outcomeFactor = outcomeFactorFor(candidate.outcome, features.query)
  const finalScore = clamp(
    relevance * evidenceFactor * focusFactor * outcomeFactor + phraseMatch * 0.08,
  )
  return {
    id: candidate.id,
    finalScore,
    scoreBreakdown: {
      commandMatch,
      errorMatch,
      evidenceFactor,
      finalScore,
      lexical,
      outcomeFactor,
      pathMatch,
      phraseMatch,
      specificityFactor: focusFactor,
      symbolMatch,
    },
    matchedPaths: matchingPathTokens(candidate.pathTokens, features.pathTokens),
    matchedErrors: matchingTokens(candidate.errorCodes, features.errorCodes),
    updatedAtMs: candidate.updatedAt?.getTime() ?? 0,
  }
}

function indexExperience(candidate: RankableExperience): IndexedExperience {
  const title = candidate.title ?? ""
  const taskText = candidate.taskText ?? ""
  const templateSummary = candidate.templateSummary ?? ""
  const rawSearchText =
    title.length > 0 || taskText.length > 0 || templateSummary.length > 0
      ? [title, taskText, templateSummary, candidate.searchText].join("\n")
      : candidate.searchText
  const searchText = compactSearchText(rawSearchText)
  const pathTokens = cleanTokens(candidate.pathTokens, MAX_PATH_TOKENS)
  const symbolTokens = cleanTokens(candidate.symbolTokens, MAX_SYMBOL_TOKENS)
  const errorCodes = cleanTokens(candidate.errorCodes, MAX_ERROR_TOKENS)
  const errorSignatures = cleanTokens(candidate.errorSignatures, MAX_ERROR_TOKENS)
  const commandFamilies = cleanTokens(candidate.commandFamilies, 24)
  const indexedSearchTokens = tokenSet(
    [
      searchText,
      ...pathTokens,
      ...symbolTokens,
      ...errorCodes,
      ...errorSignatures,
      ...commandFamilies,
    ].join("\n"),
  )
  return {
    ...candidate,
    commandFamilies,
    errorCodes,
    errorSignatures,
    normalizedSearchText: normalizePhrase(searchText),
    pathTokenSet: tokenSet(pathTokens.join(" ")),
    commandTokenSet: tokenSet(commandFamilies.join(" ")),
    errorTokenSet: tokenSet([...errorCodes, ...errorSignatures].join(" ")),
    pathTokens,
    searchText,
    searchTokens: indexedSearchTokens,
    summaryTokens: tokenSet(templateSummary || candidate.searchText),
    symbolTokenSet: tokenSet(symbolTokens.join(" ")),
    symbolTokens,
    taskTokens: tokenSet(taskText || candidate.searchText),
    titleTokens: tokenSet(title || candidate.searchText),
  }
}

function buildCorpusStats(candidates: readonly IndexedExperience[]): CorpusStats {
  const tokenDocumentFrequency = new Map<string, number>()
  for (const candidate of candidates) {
    for (const token of candidate.searchTokens) {
      tokenDocumentFrequency.set(token, (tokenDocumentFrequency.get(token) ?? 0) + 1)
    }
  }
  return {
    documentCount: Math.max(candidates.length, 1),
    tokenDocumentFrequency,
  }
}

function buildCandidateIndex(candidates: readonly IndexedExperience[]): CandidateIndex {
  const index = new Map<string, number[]>()
  candidates.forEach((candidate, candidateIndex) => {
    for (const token of candidate.searchTokens) {
      const postings = index.get(token) ?? []
      postings.push(candidateIndex)
      index.set(token, postings)
    }
  })
  return index
}

function candidatesForQuery(
  candidates: readonly IndexedExperience[],
  candidateIndex: CandidateIndex,
  stats: CorpusStats,
  features: ExperienceQueryFeatures,
  query: ReadonlySet<string>,
): readonly IndexedExperience[] {
  if (query.size === 0) {
    return candidates
  }
  const scoredTokens = prioritizedCandidateTokens(features, query, stats)
  const candidateScores = new Map<number, number>()
  for (const token of scoredTokens) {
    const postings = candidateIndex.get(token)
    if (postings === undefined) {
      continue
    }
    const weight = tokenWeight(token, stats)
    for (const candidateIndex of postings) {
      candidateScores.set(candidateIndex, (candidateScores.get(candidateIndex) ?? 0) + weight)
    }
  }
  if (candidateScores.size === 0) {
    return candidates
  }
  return [...candidateScores.entries()]
    .sort((left, right) => right[1] - left[1] || right[0] - left[0])
    .slice(0, Math.min(MAX_SCORING_CANDIDATES, candidates.length))
    .map(([index]) => candidates[index])
    .filter((value) => value !== undefined)
}

function prioritizedCandidateTokens(
  features: ExperienceQueryFeatures,
  query: ReadonlySet<string>,
  stats: CorpusStats,
): readonly string[] {
  const structured = tokenSet(
    [
      ...features.errorCodes,
      ...features.errorTextTokens,
      ...features.pathTokens,
      ...features.symbolTokens,
      ...features.commandFamilies,
    ].join(" "),
  )
  const allTokens = [...new Set([...structured, ...query])]
  const maxCommonDocumentFrequency = Math.max(20, Math.floor(stats.documentCount * 0.45))
  const specificTokens = allTokens.filter((token) => {
    const frequency = stats.tokenDocumentFrequency.get(token) ?? 0
    return frequency > 0 && (structured.has(token) || frequency <= maxCommonDocumentFrequency)
  })
  const tokens = specificTokens.length > 0 ? specificTokens : allTokens
  return tokens
    .map((token) => ({ token, weight: tokenWeight(token, stats) }))
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 40)
    .map((entry) => entry.token)
}

function toIndexedQuery(features: ExperienceQueryFeatures): ReadonlySet<string> {
  return tokenSet(
    [
      features.query,
      features.lexicalText,
      ...features.errorCodes,
      ...features.errorTextTokens,
      ...features.pathTokens,
      ...features.symbolTokens,
      ...features.commandFamilies,
    ].join(" "),
  )
}

function lexicalScore(
  candidate: IndexedExperience,
  query: ReadonlySet<string>,
  stats: CorpusStats,
): number {
  if (query.size === 0) {
    return 0
  }
  const full = weightedTokenRecall(candidate.searchTokens, query, stats)
  const title = weightedTokenRecall(candidate.titleTokens, query, stats)
  const task = weightedTokenRecall(candidate.taskTokens, query, stats)
  const summary = weightedTokenRecall(candidate.summaryTokens, query, stats)
  return clamp(full * 0.55 + title * 0.2 + task * 0.15 + summary * 0.1)
}

function weightedTokenRecall(
  haystack: ReadonlySet<string>,
  needles: ReadonlySet<string>,
  stats: CorpusStats,
): number {
  let matched = 0
  let total = 0
  for (const token of needles) {
    const weight = tokenWeight(token, stats)
    total += weight
    if (haystack.has(token)) {
      matched += weight
    }
  }
  return total === 0 ? 0 : matched / total
}

function tokenWeight(token: string, stats: CorpusStats): number {
  const documentFrequency = stats.tokenDocumentFrequency.get(token) ?? 0
  const idf = Math.log(1 + (stats.documentCount + 1) / (documentFrequency + 1))
  const specificity = token.length >= 8 || /\d/.test(token) || /[_.:/-]/.test(token) ? 1.35 : 1
  return idf * specificity
}

function phraseScore(candidate: IndexedExperience, query: string): number {
  const normalizedQuery = normalizePhrase(query)
  if (normalizedQuery.length < 8) {
    return 0
  }
  if (candidate.normalizedSearchText.includes(normalizedQuery)) {
    return 1
  }
  const importantTokens = [...tokenSet(query)].filter(
    (token) => token.length >= 6 || /\d/.test(token) || /[_.:/-]/.test(token),
  )
  if (importantTokens.length === 0) {
    return 0
  }
  const matched = importantTokens.filter((token) => candidate.searchTokens.has(token)).length
  return matched / importantTokens.length
}

function overlapScore(candidate: ReadonlySet<string>, query: readonly string[]): number {
  if (query.length === 0) {
    return 0
  }
  const queryTokens = tokenSet(query.join(" "))
  if (queryTokens.size === 0) {
    return 0
  }
  return matchingTokenSet(candidate, queryTokens).length / queryTokens.size
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

function weightsFor(features: ExperienceQueryFeatures): {
  readonly command: number
  readonly error: number
  readonly lexical: number
  readonly path: number
  readonly symbol: number
} {
  const hasSpecificPath = features.pathTokens.some((token) => token.includes("/"))
  return {
    command: 0.08,
    error: 0.24,
    lexical: hasSpecificPath ? 0.32 : 0.45,
    path: hasSpecificPath ? 0.26 : 0.15,
    symbol: 0.15,
  }
}

function focusFactorFor(candidate: RankableExperience): number {
  const pathCount = new Set(candidate.pathTokens).size
  if (pathCount <= 80) {
    return 1
  }
  if (pathCount <= 250) {
    return 0.93
  }
  if (pathCount <= 600) {
    return 0.84
  }
  if (pathCount <= 1_200) {
    return 0.72
  }
  return 0.58
}

function outcomeFactorFor(outcome: RankableExperience["outcome"], query: string): number {
  const lower = query.toLocaleLowerCase("en-US")
  const asksForFailure = /失败|报错|错误|异常|风险|failed|failure|error|invalid/.test(lower)
  const asksForSolution = /解决|修复|怎么|如何|正常|经验|做法|fix|solution|working/.test(lower)
  if (outcome === "SUCCEEDED") {
    return asksForFailure ? 1.03 : 1.08
  }
  if (outcome === "FAILED") {
    return asksForFailure ? 1.06 : 0.98
  }
  if (outcome === "PARTIAL") {
    return asksForFailure ? 1 : 0.94
  }
  return asksForSolution || asksForFailure ? 0.76 : 0.82
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

function matchingTokenSet(
  candidate: ReadonlySet<string>,
  query: ReadonlySet<string>,
): readonly string[] {
  return [...query].filter((token) => candidate.has(token))
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
  const tokens = [
    ...value
      .toLocaleLowerCase("en-US")
      .split(/[^a-z0-9_.:/-]+/i)
      .flatMap(expandAsciiToken),
    ...extractCjkTokens(value),
  ].filter((token) => token.length > 1 && !isNoisyToken(token))
  return new Set(tokens)
}

function compactSearchText(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim()
  if (normalized.length <= MAX_INDEX_TEXT_LENGTH) {
    return normalized
  }
  const headLength = Math.floor(MAX_INDEX_TEXT_LENGTH * 0.72)
  const tailLength = MAX_INDEX_TEXT_LENGTH - headLength
  return `${normalized.slice(0, headLength)} ${normalized.slice(-tailLength)}`
}

function cleanTokens(values: readonly string[], limit: number): readonly string[] {
  const result: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const token = normalizeToken(value)
    if (token.length <= 1 || seen.has(token) || isNoisyToken(token)) {
      continue
    }
    seen.add(token)
    result.push(token)
    if (result.length >= limit) {
      break
    }
  }
  return result
}

function normalizeToken(value: string): string {
  return value
    .trim()
    .replaceAll("\\", "/")
    .replace(/^n\/root\/Projects\/Cources\/ComprehensiveProject\/CliSearch\//, "")
    .replace(/^\/root\/Projects\/Cources\/ComprehensiveProject\/CliSearch\//, "")
    .replace(/^['"`]+|['"`]+$/g, "")
}

function expandAsciiToken(token: string): readonly string[] {
  const pieces = token.split(/[._:/-]+/).filter((value) => value.length > 1)
  return [token, ...pieces].filter((value) => value.length > 1)
}

function extractCjkTokens(value: string): readonly string[] {
  return [...value.matchAll(/\p{Script=Han}{2,}/gu)].flatMap((match) => {
    const segment = match[0]
    return [
      ...(segment.length <= 12 ? [segment] : []),
      ...ngrams(segment, 2),
      ...ngrams(segment, 3),
    ]
  })
}

function ngrams(value: string, size: number): readonly string[] {
  if (value.length <= size) {
    return [value]
  }
  const result: string[] = []
  for (let index = 0; index <= value.length - size; index += 1) {
    result.push(value.slice(index, index + size))
  }
  return result
}

function isNoisyToken(token: string): boolean {
  return /^[a-f0-9]{16,}$/i.test(token) || /^\d+$/.test(token)
}

function normalizePhrase(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim()
}

function endsWithParts(parts: readonly string[], suffix: readonly string[]): boolean {
  if (suffix.length === 0 || suffix.length > parts.length) {
    return false
  }
  return suffix.every((part, index) => parts[parts.length - suffix.length + index] === part)
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
