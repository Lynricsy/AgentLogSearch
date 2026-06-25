import { PrismaClient } from "@prisma/client"
import { getDatabaseUrl } from "../src/database/database-url.js"
import {
  createExperienceRanker,
  type RankableExperience,
} from "../src/experience-search/experience-ranker.js"
import { extractExperienceQueryFeatures } from "../src/experience-search/query-feature-extractor.js"
import {
  EXPERIENCE_BUILDER_VERSION,
  EXPERIENCE_SEARCH_DOCUMENT_VERSION,
} from "../src/pipeline-versions.js"

type Outcome = "SUCCEEDED" | "FAILED" | "PARTIAL" | "UNKNOWN"
type CaseKind = "natural" | "diagnostic" | "fielded"
type CandidateRecord = {
  readonly id: bigint
  readonly outcome: Outcome
  readonly title: string
  readonly taskText: string
  readonly templateSummary: string
  readonly evidenceScore: number
  readonly searchText: string
  readonly pathTokens: readonly string[]
  readonly symbolTokens: readonly string[]
  readonly errorCodes: readonly string[]
  readonly errorSignatures: readonly string[]
  readonly commandFamilies: readonly string[]
  readonly updatedAt: Date
  readonly session: {
    readonly traceRevision: number
  }
  readonly sourceRevision: number
}
type EvalCase = {
  readonly id: string
  readonly kind: CaseKind
  readonly outcome: Outcome
  readonly query: string
  readonly files: readonly string[]
  readonly symbols: readonly string[]
  readonly expectedIds: ReadonlySet<string>
}
type CaseResult = {
  readonly case: EvalCase
  readonly reciprocalRank: number
  readonly rank: number | null
  readonly topIds: readonly string[]
}
type BucketMetrics = {
  readonly label: string
  readonly total: number
  readonly top1: number
  readonly top3: number
  readonly top5: number
  readonly top10: number
  readonly mrr: number
  readonly misses: number
}

const DEFAULT_CASE_LIMIT = 300
const DEFAULT_TOP_K = 20
const ACTIONABLE_OUTCOMES = new Set<Outcome>(["SUCCEEDED", "FAILED", "PARTIAL"])
const usage = [
  "Usage:",
  "  pnpm --filter api evaluate:experience-search [--limit <n>] [--top-k <n>] [--json]",
  "",
  "默认优先评测 SUCCEEDED/FAILED/PARTIAL 经验，再补充少量 UNKNOWN；命中按同标题+同任务的等价经验组统计。",
].join("\n")

const options = parseArgs(process.argv.slice(2))
const prisma = new PrismaClient({ datasourceUrl: getDatabaseUrl() })

try {
  const records = await readCandidates()
  const rankables = records.map(toRankable)
  const ranker = createExperienceRanker(rankables)
  const equivalentIds = buildEquivalentIdIndex(records)
  const cases = buildCases(records, equivalentIds).slice(0, options.limit)
  const results = cases.map((item) => evaluateCase(item, ranker, options.topK))
  const report = buildReport(records, results)
  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, jsonReplacer, 2)}\n`)
  } else {
    printReport(report)
  }
} finally {
  await prisma.$disconnect()
}

async function readCandidates(): Promise<readonly CandidateRecord[]> {
  const records = await prisma.agentExperience.findMany({
    where: {
      searchDocumentVersion: EXPERIENCE_SEARCH_DOCUMENT_VERSION,
      session: {
        experienceBuildStatus: "READY",
        experienceBuilderVersion: EXPERIENCE_BUILDER_VERSION,
      },
    },
    include: {
      session: {
        select: {
          traceRevision: true,
        },
      },
    },
    orderBy: [{ outcome: "asc" }, { evidenceScore: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
    take: 2_000,
  })
  return records.filter((record) => record.sourceRevision === record.session.traceRevision)
}

function buildCases(
  records: readonly CandidateRecord[],
  equivalentIds: ReadonlyMap<string, ReadonlySet<string>>,
): readonly EvalCase[] {
  const sorted = [...records].sort((left, right) => {
    const outcomeDelta = outcomePriority(right.outcome) - outcomePriority(left.outcome)
    if (outcomeDelta !== 0) return outcomeDelta
    return right.evidenceScore - left.evidenceScore || Number(right.id - left.id)
  })
  const cases: EvalCase[] = []
  const seen = new Set<string>()
  for (const record of sorted) {
    const key = equivalentKey(record)
    const expectedIds = equivalentIds.get(key) ?? new Set([record.id.toString()])
    for (const item of casesForRecord(record, expectedIds)) {
      const caseKey = `${item.kind}:${key}:${normalizeQuery(item.query)}`
      if (seen.has(caseKey)) continue
      seen.add(caseKey)
      cases.push(item)
    }
  }
  return cases
}

function casesForRecord(
  record: CandidateRecord,
  expectedIds: ReadonlySet<string>,
): readonly EvalCase[] {
  const base = {
    expectedIds,
    id: record.id.toString(),
    outcome: record.outcome,
  }
  const diagnostics = diagnosticTerms(record)
  const natural = readableText(record.taskText) || readableText(record.templateSummary)
  const fieldedQuery = unique([record.title, ...diagnostics.slice(0, 8)]).join(" ")
  const cases: EvalCase[] = []
  if (natural.length >= 6) {
    cases.push({
      ...base,
      files: [],
      kind: "natural",
      query: natural,
      symbols: [],
    })
  }
  if (diagnostics.length >= 2) {
    cases.push({
      ...base,
      files: [],
      kind: "diagnostic",
      query: diagnostics.slice(0, 12).join(" "),
      symbols: [],
    })
  }
  if (fieldedQuery.trim().length > 0) {
    cases.push({
      ...base,
      files: meaningfulPaths(record.pathTokens).slice(0, 3),
      kind: "fielded",
      query: fieldedQuery,
      symbols: meaningfulSymbols(record.symbolTokens).slice(0, 3),
    })
  }
  return cases
}

function evaluateCase(
  item: EvalCase,
  ranker: ReturnType<typeof createExperienceRanker>,
  topK: number,
): CaseResult {
  const features = extractExperienceQueryFeatures({
    files: item.files,
    query: item.query,
    symbols: item.symbols,
  })
  const ranked = ranker.search(features, Math.max(topK, 50))
  const rankIndex = ranked.findIndex((entry) => item.expectedIds.has(entry.id))
  return {
    case: item,
    rank: rankIndex === -1 ? null : rankIndex + 1,
    reciprocalRank: rankIndex === -1 ? 0 : 1 / (rankIndex + 1),
    topIds: ranked.slice(0, topK).map((entry) => entry.id),
  }
}

function buildReport(records: readonly CandidateRecord[], results: readonly CaseResult[]) {
  return {
    candidates: records.length,
    cases: results.length,
    generatedAt: new Date().toISOString(),
    metrics: {
      all: metrics("全部查询", results),
      byKind: groupMetrics(results, (result) => result.case.kind),
      byOutcome: groupMetrics(results, (result) => result.case.outcome),
    },
    weakest: results
      .filter((result) => result.rank === null || result.rank > 10)
      .slice(0, 15)
      .map((result) => ({
        expectedIds: [...result.case.expectedIds],
        files: result.case.files,
        kind: result.case.kind,
        outcome: result.case.outcome,
        query: result.case.query,
        rank: result.rank,
        symbols: result.case.symbols,
        topIds: result.topIds.slice(0, 5),
      })),
  }
}

function groupMetrics(
  results: readonly CaseResult[],
  labelFor: (result: CaseResult) => string,
): readonly BucketMetrics[] {
  const buckets = new Map<string, CaseResult[]>()
  for (const result of results) {
    const label = labelFor(result)
    const bucket = buckets.get(label) ?? []
    bucket.push(result)
    buckets.set(label, bucket)
  }
  return [...buckets.entries()].map(([label, bucket]) => metrics(label, bucket))
}

function metrics(label: string, results: readonly CaseResult[]): BucketMetrics {
  const total = results.length
  const hitAt = (limit: number) =>
    results.filter((result) => result.rank !== null && result.rank <= limit).length
  return {
    label,
    misses: results.filter((result) => result.rank === null).length,
    mrr:
      total === 0
        ? 0
        : round(results.reduce((sum, result) => sum + result.reciprocalRank, 0) / total),
    top1: ratio(hitAt(1), total),
    top10: ratio(hitAt(10), total),
    top3: ratio(hitAt(3), total),
    top5: ratio(hitAt(5), total),
    total,
  }
}

function printReport(report: ReturnType<typeof buildReport>) {
  process.stdout.write(
    [
      `经验搜索评测：${report.cases} 个查询 / ${report.candidates} 条候选`,
      `生成时间：${report.generatedAt}`,
      "",
      formatMetrics(report.metrics.all),
      "",
      "按查询类型：",
      ...report.metrics.byKind.map(formatMetrics),
      "",
      "按结果类型：",
      ...report.metrics.byOutcome.map(formatMetrics),
      "",
      "Top10 外或未命中的样例：",
      ...report.weakest.map(
        (item) =>
          `- [${item.kind}/${item.outcome}] rank=${item.rank ?? "miss"} query="${item.query.slice(
            0,
            140,
          )}" top=${item.topIds.join(",")}`,
      ),
      "",
    ].join("\n"),
  )
}

function formatMetrics(item: BucketMetrics): string {
  return `${item.label}: n=${item.total} top1=${percent(item.top1)} top3=${percent(
    item.top3,
  )} top5=${percent(item.top5)} top10=${percent(item.top10)} MRR=${item.mrr.toFixed(
    3,
  )} miss=${item.misses}`
}

function diagnosticTerms(record: CandidateRecord): readonly string[] {
  const paths = meaningfulPaths(record.pathTokens)
  const symbols = meaningfulSymbols(record.symbolTokens)
  return unique([
    ...record.errorCodes,
    ...record.errorSignatures.slice(0, 4),
    ...paths.slice(0, 6).flatMap((path) => [path, basename(path)]),
    ...symbols.slice(0, 6),
    ...record.commandFamilies.slice(0, 4),
    ...codeTerms(record.title).slice(0, 8),
    ...codeTerms(record.taskText).slice(0, 8),
    ...codeTerms(record.templateSummary).slice(0, 8),
  ]).filter(isUsefulDiagnosticToken)
}

function meaningfulPaths(paths: readonly string[]): readonly string[] {
  return unique(paths.map(cleanToken).filter(isUsefulPathToken)).slice(0, 20)
}

function meaningfulSymbols(symbols: readonly string[]): readonly string[] {
  return unique(symbols.map(cleanToken).filter((symbol) => symbol.length >= 3)).slice(0, 20)
}

function codeTerms(value: string): readonly string[] {
  return unique(
    [...value.matchAll(/\b[A-Za-z_][A-Za-z0-9_.:-]{2,}\b/g)]
      .map((match) => match[0])
      .map(cleanToken)
      .filter(isUsefulDiagnosticToken),
  )
}

function readableText(value: string): string {
  const text = value
    .replace(/\s+/g, " ")
    .replace(/# Files mentioned by the user:.*/i, "")
    .replace(/<subagent_notification>.*$/i, "")
    .trim()
    .slice(0, 260)
  if (isBoilerplateText(text)) {
    return ""
  }
  return text
}

function buildEquivalentIdIndex(
  records: readonly CandidateRecord[],
): ReadonlyMap<string, ReadonlySet<string>> {
  const index = new Map<string, Set<string>>()
  for (const record of records) {
    const key = equivalentKey(record)
    const ids = index.get(key) ?? new Set<string>()
    ids.add(record.id.toString())
    index.set(key, ids)
  }
  return index
}

function equivalentKey(record: Pick<CandidateRecord, "outcome" | "taskText" | "title">): string {
  return `${record.outcome}:${normalizeQuery(record.title)}:${normalizeQuery(record.taskText).slice(
    0,
    220,
  )}`
}

function toRankable(record: CandidateRecord): RankableExperience {
  return {
    commandFamilies: record.commandFamilies,
    errorCodes: record.errorCodes,
    errorSignatures: record.errorSignatures,
    evidenceScore: record.evidenceScore,
    id: record.id.toString(),
    outcome: record.outcome,
    pathTokens: record.pathTokens,
    searchText: record.searchText,
    symbolTokens: record.symbolTokens,
    taskText: record.taskText,
    templateSummary: record.templateSummary,
    title: record.title,
    updatedAt: record.updatedAt,
  }
}

function outcomePriority(outcome: Outcome): number {
  if (ACTIONABLE_OUTCOMES.has(outcome)) return 2
  return 1
}

function isUsefulPathToken(token: string): boolean {
  if (token.length < 3) return false
  if (/^\d+$/.test(token)) return false
  if (/^[a-f0-9]{12,}$/i.test(token)) return false
  return (
    token.includes("/") ||
    /\.(?:[cm]?[jt]sx?|json|md|prisma|sql|ya?ml|toml|rs|go|py|java|kt|swift|php|rb)$/i.test(token)
  )
}

function isUsefulDiagnosticToken(token: string): boolean {
  if (token.length < 3) return false
  if (/^TS\d{4}$/i.test(token)) return true
  if (/^\d+$/.test(token)) return false
  if (/^[a-f0-9]{12,}$/i.test(token)) return false
  if (/^[a-f0-9-]{16,}$/i.test(token)) return false
  return /[A-Za-z]/.test(token)
}

function isBoilerplateText(text: string): boolean {
  return (
    text.length === 0 ||
    /^该任务(的)?(部分验证通过|没有记录到|没有找到|未形成|证据不足)/.test(text) ||
    /^没有记录到(明确的)?(修改|验证|证据)/.test(text)
  )
}

function basename(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path
}

function cleanToken(value: string): string {
  return value
    .trim()
    .replaceAll("\\", "/")
    .replace(/^['"`]+|['"`]+$/g, "")
    .replace(/^n\/root\/Projects\/Cources\/ComprehensiveProject\/CliSearch\//, "")
    .replace(/^\/root\/Projects\/Cources\/ComprehensiveProject\/CliSearch\//, "")
}

function normalizeQuery(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim()
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.length > 0))]
}

function ratio(count: number, total: number): number {
  return total === 0 ? 0 : round(count / total)
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

function percent(value: number): string {
  return `${Math.round(value * 1000) / 10}%`
}

function parseArgs(args: readonly string[]): {
  readonly json: boolean
  readonly limit: number
  readonly topK: number
} {
  let json = false
  let limit = DEFAULT_CASE_LIMIT
  let topK = DEFAULT_TOP_K
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    switch (arg) {
      case "--help":
      case "-h":
        throw new Error(usage)
      case "--json":
        json = true
        break
      case "--limit": {
        const value = readPositiveInteger(args[index + 1], "--limit")
        limit = value
        index += 1
        break
      }
      case "--top-k": {
        const value = readPositiveInteger(args[index + 1], "--top-k")
        topK = value
        index += 1
        break
      }
      default:
        throw new Error(`Unknown argument: ${arg}\n${usage}`)
    }
  }
  return { json, limit, topK }
}

function readPositiveInteger(value: string | undefined, flag: string): number {
  if (value === undefined || !/^\d+$/.test(value) || Number(value) < 1) {
    throw new Error(`${flag} requires a positive integer.\n${usage}`)
  }
  return Number(value)
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Set) {
    return [...value]
  }
  if (typeof value === "bigint") {
    return value.toString()
  }
  return value
}
