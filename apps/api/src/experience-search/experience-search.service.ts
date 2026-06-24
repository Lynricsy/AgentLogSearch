import type {
  AttemptEvidenceRole,
  EvidenceEventSummary,
  ExperienceAttempt,
  ExperienceCompatibility,
  ExperienceDetail,
  ExperienceRebuildRequest,
  ExperienceRebuildResponse,
  ExperienceSearchRequest,
  ExperienceSearchResponse,
  ExperienceStatusResponse,
  ExperienceSummary,
} from "@agent-log-search/shared"
import { EXPERIENCE_COMPATIBILITY_DISCLAIMER } from "@agent-log-search/shared"
import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { PrismaService } from "../database/prisma.service.js"
import { readExperienceConfig } from "../experiences/experience.config.js"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { CompatibilityService } from "../repositories/compatibility.service.js"
import type { RepositoryCompatibilityLevel } from "../repositories/repository.types.js"
import { type RankableExperience, rankExperiences } from "./experience-ranker.js"
import { extractExperienceQueryFeatures } from "./query-feature-extractor.js"

type ExperienceRecord = Awaited<ReturnType<ExperienceSearchService["readExperiencesByIds"]>>[number]
type ExperienceBuildStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED"
type ExperienceEmbeddingStatus = "pending" | "processing" | "ready" | "failed"

@Injectable()
export class ExperienceSearchService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly compatibility: CompatibilityService,
  ) {}

  public async search(input: ExperienceSearchRequest): Promise<ExperienceSearchResponse> {
    assertExperienceSearchEnabled()
    const features = extractExperienceQueryFeatures(input)
    const candidates = await this.readReadyCandidates(input.mode)
    const ranked = rankExperiences(candidates.map(toRankable), features, rankLimit(input))
    const records = await this.readExperiencesByIds(ranked.map((entry) => BigInt(entry.id)))
    const rankById = new Map(ranked.map((entry) => [entry.id, entry]))
    const summaries = (
      await Promise.all(
        records.map((record) =>
          this.withCompatibility(
            toExperienceSummary(record, rankById.get(record.id.toString())),
            input.repositoryPath,
            record.manifestHash,
          ),
        ),
      )
    )
      .sort((a, b) => b.scoreBreakdown.finalScore - a.scoreBreakdown.finalScore)
      .slice(0, input.topK)
    return groupSummaries(summaries, input.mode)
  }

  public async get(id: string): Promise<ExperienceDetail> {
    assertExperienceSearchEnabled()
    const experienceId = parseId(id)
    const record = await this.prisma.agentExperience.findUnique({
      where: { id: experienceId },
      include: {
        attempts: {
          include: {
            evidenceLinks: true,
          },
          orderBy: { attemptIndex: "asc" },
        },
        session: true,
      },
    })
    if (record === null) {
      throwExperienceNotFound()
    }
    const evidenceEvents = await this.prisma.agentTraceEvent.findMany({
      where: {
        attemptLinks: {
          some: {
            attempt: {
              experienceId,
            },
          },
        },
      },
      orderBy: [{ seqNo: "asc" }, { subSeqNo: "asc" }, { id: "asc" }],
    })
    const summary = toExperienceSummary(record, undefined)
    return {
      ...summary,
      session: {
        id: record.session.id.toString(),
        sourceId: record.session.sourceId.toString(),
        historyFileId: record.session.historyFileId?.toString() ?? null,
        agentName: record.session.agentName,
        externalThreadId: record.session.externalThreadId,
        title: record.session.title,
        cwd: record.session.cwd,
        traceRevision: record.session.traceRevision,
        experienceBuildStatus: record.session.experienceBuildStatus,
        lastMessageAt: record.session.lastMessageAt?.toISOString() ?? null,
        updatedAt: record.session.updatedAt.toISOString(),
      },
      evidenceEvents: evidenceEvents.map(toEvidenceEventSummary),
    }
  }

  public async rebuild(input: ExperienceRebuildRequest): Promise<ExperienceRebuildResponse> {
    const where = {
      ...(input.sessionId === undefined ? {} : { id: BigInt(input.sessionId) }),
      ...(input.sourceId === undefined ? {} : { sourceId: BigInt(input.sourceId) }),
      ...(input.includeReady ? {} : { experienceBuildStatus: { not: "READY" as const } }),
    }
    const result = await this.prisma.agentSession.updateMany({
      where,
      data: {
        experienceBuildStatus: "PENDING",
        experienceBuildError: null,
        experienceProcessingAt: null,
        experienceRequestedAt: new Date(),
      },
    })
    return { affectedSessions: result.count }
  }

  public async status(): Promise<ExperienceStatusResponse> {
    const config = readExperienceConfig()
    const [sessionStatusCounts, experiences, latestWorkerError] = await Promise.all([
      this.prisma.agentSession.groupBy({
        by: ["experienceBuildStatus"],
        _count: { _all: true },
      }),
      this.prisma.agentExperience.findMany({
        select: {
          sourceRevision: true,
          embeddingStatus: true,
          session: {
            select: {
              experienceBuildStatus: true,
              traceRevision: true,
            },
          },
        },
      }),
      this.prisma.agentSession.findFirst({
        where: {
          experienceBuildStatus: "FAILED",
          experienceBuildError: { not: null },
        },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          experienceBuildError: true,
          updatedAt: true,
        },
      }),
    ])
    const sessions = countSessionStatuses(sessionStatusCounts)
    const experienceCounts = countExperienceStatuses(experiences)

    return {
      pendingSessions: sessions.PENDING,
      processingSessions: sessions.PROCESSING,
      readySessions: sessions.READY,
      failedSessions: sessions.FAILED,
      readyExperiences: experienceCounts.readyExperiences,
      currentRevisionExperiences: experienceCounts.currentRevisionExperiences,
      staleRevisionExperiences: experienceCounts.staleRevisionExperiences,
      embeddingPending: experienceCounts.embeddingStatuses.pending,
      embeddingProcessing: experienceCounts.embeddingStatuses.processing,
      embeddingReady: experienceCounts.embeddingStatuses.ready,
      embeddingFailed: experienceCounts.embeddingStatuses.failed,
      embeddingStatuses: experienceCounts.embeddingStatuses,
      workerEnabled: config.workerEnabled,
      searchEnabled: config.searchEnabled,
      latestWorkerError:
        latestWorkerError?.experienceBuildError === undefined ||
        latestWorkerError.experienceBuildError === null
          ? null
          : {
              sessionId: latestWorkerError.id.toString(),
              message: latestWorkerError.experienceBuildError,
              updatedAt: latestWorkerError.updatedAt.toISOString(),
            },
      updatedAt: new Date().toISOString(),
    }
  }

  private async readReadyCandidates(mode: ExperienceSearchRequest["mode"]) {
    return this.prisma.agentExperience
      .findMany({
        where: {
          ...(mode === "all" ? {} : { outcome: modeToOutcome(mode) }),
          session: {
            experienceBuildStatus: "READY",
          },
        },
        include: { session: { select: { traceRevision: true } } },
        take: 200,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      })
      .then((records) =>
        records.filter((record) => record.sourceRevision === record.session.traceRevision),
      )
  }

  private async readExperiencesByIds(ids: readonly bigint[]) {
    if (ids.length === 0) {
      return []
    }
    return this.prisma.agentExperience.findMany({
      where: { id: { in: [...ids] } },
      include: {
        attempts: {
          include: { evidenceLinks: true },
          orderBy: { attemptIndex: "asc" },
        },
      },
    })
  }

  private async withCompatibility(
    summary: ExperienceSummary,
    repositoryPath: string | undefined,
    historicalManifestHash: string | null,
  ): Promise<ExperienceSummary> {
    if (repositoryPath === undefined) {
      return summary
    }
    const compatibility = await this.safeCompatibility(
      summary,
      repositoryPath,
      historicalManifestHash,
    )
    if (compatibility === null) {
      return summary
    }
    const compatibilityFactor = factorForCompatibility(compatibility.level)
    return {
      ...summary,
      compatibility,
      scoreBreakdown: {
        ...summary.scoreBreakdown,
        compatibilityFactor,
        finalScore: roundScore(summary.scoreBreakdown.finalScore * compatibilityFactor),
      },
    }
  }

  private async safeCompatibility(
    summary: ExperienceSummary,
    repositoryPath: string,
    historicalManifestHash: string | null,
  ): Promise<ExperienceCompatibility | null> {
    try {
      const result = await this.compatibility.check({
        currentRepositoryPath: repositoryPath,
        historicalManifestHash,
        historicalPaths: summary.pathTokens,
        historicalRepoKey: summary.repoKey,
        historicalSymbols: summary.symbolTokens,
      })
      return {
        coverage: result.coverage,
        disclaimer: EXPERIENCE_COMPATIBILITY_DISCLAIMER,
        files: result.files.map((file) => ({
          currentPath: file.currentPath,
          historicalPath: file.historicalPath,
          status: file.status,
        })),
        level: result.level,
        reasonCodes: [...result.reasonCodes],
        score: result.score,
        snapshot: {
          branch: result.snapshot.branch,
          capturedAt: result.snapshot.capturedAt,
          dependencies:
            result.snapshot.dependencies === null
              ? null
              : {
                  lockfiles: result.snapshot.dependencies.lockfiles.map((lockfile) => ({
                    fileName: lockfile.fileName,
                    kind: lockfile.kind,
                  })),
                  packageManagers: [...result.snapshot.dependencies.packageManagers],
                  packageName: result.snapshot.dependencies.packageName,
                  topLevelDependencyCount: result.snapshot.dependencies.topLevelDependencies.length,
                  unknownMajorVersionCount:
                    result.snapshot.dependencies.topLevelDependencies.filter(
                      (dependency) => dependency.majorVersion === null,
                    ).length,
                },
          dirtyHash: result.snapshot.dirtyHash,
          gitHead: result.snapshot.gitHead,
          manifestHash: result.snapshot.manifestHash,
          quality: result.snapshot.quality,
          repoKey: result.snapshot.repoKey,
        },
      }
    } catch {
      return null
    }
  }
}

function rankLimit(input: ExperienceSearchRequest): number {
  if (input.repositoryPath === undefined) {
    return input.topK
  }
  return Math.min(50, Math.max(input.topK, input.topK * 3))
}

function countSessionStatuses(
  groups: readonly {
    readonly experienceBuildStatus: ExperienceBuildStatus
    readonly _count: { readonly _all: number }
  }[],
): Record<ExperienceBuildStatus, number> {
  const counts = {
    FAILED: 0,
    PENDING: 0,
    PROCESSING: 0,
    READY: 0,
  }
  for (const group of groups) {
    counts[group.experienceBuildStatus] = group._count._all
  }
  return counts
}

function countExperienceStatuses(
  experiences: readonly {
    readonly sourceRevision: number
    readonly embeddingStatus: string
    readonly session: {
      readonly experienceBuildStatus: ExperienceBuildStatus
      readonly traceRevision: number
    }
  }[],
) {
  const embeddingStatuses: Record<ExperienceEmbeddingStatus, number> = {
    failed: 0,
    pending: 0,
    processing: 0,
    ready: 0,
  }
  let currentRevisionExperiences = 0
  let readyExperiences = 0
  let staleRevisionExperiences = 0

  for (const experience of experiences) {
    if (isExperienceEmbeddingStatus(experience.embeddingStatus)) {
      embeddingStatuses[experience.embeddingStatus] += 1
    }
    if (experience.sourceRevision === experience.session.traceRevision) {
      currentRevisionExperiences += 1
      if (experience.session.experienceBuildStatus === "READY") {
        readyExperiences += 1
      }
    } else {
      staleRevisionExperiences += 1
    }
  }

  return {
    currentRevisionExperiences,
    embeddingStatuses,
    readyExperiences,
    staleRevisionExperiences,
  }
}

function isExperienceEmbeddingStatus(value: string): value is ExperienceEmbeddingStatus {
  return value === "pending" || value === "processing" || value === "ready" || value === "failed"
}

function toRankable(record: {
  readonly id: bigint
  readonly outcome: RankableExperience["outcome"]
  readonly evidenceScore: number
  readonly searchText: string
  readonly pathTokens: readonly string[]
  readonly symbolTokens: readonly string[]
  readonly errorCodes: readonly string[]
  readonly errorSignatures: readonly string[]
  readonly commandFamilies: readonly string[]
}): RankableExperience {
  return {
    id: record.id.toString(),
    outcome: record.outcome,
    evidenceScore: record.evidenceScore,
    searchText: record.searchText,
    pathTokens: [...record.pathTokens],
    symbolTokens: [...record.symbolTokens],
    errorCodes: record.errorCodes,
    errorSignatures: record.errorSignatures,
    commandFamilies: record.commandFamilies,
  }
}

export function toExperienceSummary(
  record: ExperienceRecord,
  ranked: ReturnType<typeof rankExperiences>[number] | undefined,
): ExperienceSummary {
  return {
    id: record.id.toString(),
    sessionId: record.sessionId.toString(),
    episodeIndex: record.episodeIndex,
    sourceRevision: record.sourceRevision,
    startSeq: record.startSeq,
    endSeq: record.endSeq,
    kind: record.kind,
    title: record.title,
    taskText: record.taskText,
    templateSummary: record.templateSummary,
    outcome: record.outcome,
    evidenceScore: record.evidenceScore,
    evidenceLevel: record.evidenceLevel,
    evidenceReasonCodes: [...record.evidenceReasonCodes],
    matchedPaths: [...(ranked?.matchedPaths ?? [])],
    matchedErrors: [...(ranked?.matchedErrors ?? [])],
    repoKey: record.repoKey,
    cwd: record.cwd,
    pathTokens: [...record.pathTokens],
    symbolTokens: [...record.symbolTokens],
    errorSignatures: [...record.errorSignatures],
    errorCodes: [...record.errorCodes],
    commandFamilies: [...record.commandFamilies],
    failedAttemptCount: record.failedAttemptCount,
    successfulAttemptCount: record.successfulAttemptCount,
    unverifiedAttemptCount: record.unverifiedAttemptCount,
    scoreBreakdown: ranked?.scoreBreakdown ?? { finalScore: 0 },
    attempts: record.attempts.map(toExperienceAttempt),
    evidenceEvents: [],
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  }
}

export function toExperienceAttempt(attempt: {
  readonly id: bigint
  readonly experienceId: bigint
  readonly attemptIndex: number
  readonly startSeq: number
  readonly endSeq: number
  readonly outcome: ExperienceAttempt["outcome"]
  readonly outcomeConfidence: number
  readonly actionSignature: string
  readonly actionTokens: readonly string[]
  readonly affectedPaths: readonly string[]
  readonly affectedSymbols: readonly string[]
  readonly commandFamilies: readonly string[]
  readonly errorBefore: readonly string[]
  readonly errorAfter: readonly string[]
  readonly reasonCodes: readonly string[]
  readonly evidenceLinks: readonly {
    readonly traceEventId: bigint
    readonly role: AttemptEvidenceRole
    readonly ordinal: number
  }[]
  readonly createdAt: Date
}): ExperienceAttempt {
  return {
    id: attempt.id.toString(),
    experienceId: attempt.experienceId.toString(),
    attemptIndex: attempt.attemptIndex,
    startSeq: attempt.startSeq,
    endSeq: attempt.endSeq,
    outcome: attempt.outcome,
    outcomeConfidence: attempt.outcomeConfidence,
    actionSignature: attempt.actionSignature,
    actionTokens: [...attempt.actionTokens],
    affectedPaths: [...attempt.affectedPaths],
    affectedSymbols: [...attempt.affectedSymbols],
    commandFamilies: [...attempt.commandFamilies],
    errorBefore: [...attempt.errorBefore],
    errorAfter: [...attempt.errorAfter],
    reasonCodes: [...attempt.reasonCodes],
    evidenceLinks: attempt.evidenceLinks.map((link) => ({
      traceEventId: link.traceEventId.toString(),
      role: link.role,
      ordinal: link.ordinal,
    })),
    createdAt: attempt.createdAt.toISOString(),
  }
}

export function toEvidenceEventSummary(event: {
  readonly id: bigint
  readonly sessionId: bigint
  readonly sourceEventKey: string
  readonly seqNo: number
  readonly subSeqNo: number
  readonly eventKind: EvidenceEventSummary["eventKind"]
  readonly operationKind: EvidenceEventSummary["operationKind"]
  readonly occurredAt: Date | null
  readonly callId: string | null
  readonly toolName: string | null
  readonly pairingQuality: EvidenceEventSummary["pairingQuality"]
  readonly redactedExcerpt: string | null
  readonly pathTokens: readonly string[]
  readonly errorSignatures: readonly string[]
  readonly errorCodes: readonly string[]
  readonly commandFamilies: readonly string[]
  readonly rawPointer: unknown
  readonly rawContentSha256: string | null
  readonly contentHash: string
  readonly extractorVersion: string
}) {
  return {
    id: event.id.toString(),
    sessionId: event.sessionId.toString(),
    sourceEventKey: event.sourceEventKey,
    seqNo: event.seqNo,
    subSeqNo: event.subSeqNo,
    eventKind: event.eventKind,
    operationKind: event.operationKind,
    occurredAt: event.occurredAt?.toISOString() ?? null,
    callId: event.callId,
    toolName: event.toolName,
    pairingQuality: event.pairingQuality,
    redactedExcerpt: event.redactedExcerpt,
    pathTokens: [...event.pathTokens],
    errorSignatures: [...event.errorSignatures],
    errorCodes: [...event.errorCodes],
    commandFamilies: [...event.commandFamilies],
    rawPointer: typeof event.rawPointer === "object" ? event.rawPointer : null,
    rawContentSha256: event.rawContentSha256,
    contentHash: event.contentHash,
    extractorVersion: event.extractorVersion,
  }
}

function groupSummaries(
  summaries: readonly ExperienceSummary[],
  mode: ExperienceSearchRequest["mode"],
): ExperienceSearchResponse {
  const response = {
    successful: summaries.filter((entry) => entry.outcome === "SUCCEEDED"),
    failedAttempts: summaries.filter((entry) => entry.outcome === "FAILED"),
    partial: summaries.filter((entry) => entry.outcome === "PARTIAL"),
    unverified: summaries.filter((entry) => entry.outcome === "UNKNOWN"),
  }
  if (mode === "all") return response
  return {
    successful: mode === "successful" ? response.successful : [],
    failedAttempts: mode === "failed" ? response.failedAttempts : [],
    partial: mode === "partial" ? response.partial : [],
    unverified: mode === "unverified" ? response.unverified : [],
  }
}

function factorForCompatibility(level: RepositoryCompatibilityLevel): number {
  switch (level) {
    case "COMPATIBLE":
      return 1
    case "LIKELY_COMPATIBLE":
      return 0.93
    case "UNCERTAIN":
      return 0.82
    case "LIKELY_STALE":
      return 0.68
    case "STALE":
      return 0.5
  }
}

function roundScore(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 1000) / 1000
}

function modeToOutcome(mode: Exclude<ExperienceSearchRequest["mode"], "all">) {
  switch (mode) {
    case "successful":
      return "SUCCEEDED"
    case "failed":
      return "FAILED"
    case "partial":
      return "PARTIAL"
    case "unverified":
      return "UNKNOWN"
  }
}

function parseId(id: string): bigint {
  if (!/^[1-9]\d*$/.test(id)) {
    throwExperienceNotFound()
  }
  return BigInt(id)
}

function throwExperienceNotFound(): never {
  throw new NotFoundException({
    error: {
      code: "experience_not_found",
      message: "Experience not found",
    },
  })
}

export function assertExperienceSearchEnabled(): void {
  if (readExperienceConfig().searchEnabled) {
    return
  }
  throw new ServiceUnavailableException({
    error: {
      code: "experience_search_disabled",
      message: "Experience search is disabled",
    },
  })
}
