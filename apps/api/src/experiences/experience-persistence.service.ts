import { Injectable } from "@nestjs/common"
import {
  type AttemptEvidenceRole,
  type AttemptOutcome,
  ExperienceBuildStatus,
  type ExperienceOutcome,
  type Prisma,
} from "@prisma/client"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { PrismaService } from "../database/prisma.service.js"
import {
  EXPERIENCE_BUILDER_VERSION,
  EXPERIENCE_SEARCH_DOCUMENT_VERSION,
} from "../pipeline-versions.js"
import type { RepositorySnapshot } from "../repositories/repository.types.js"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { RepositorySnapshotService } from "../repositories/repository-snapshot.service.js"
import type { BuiltExperienceDraft, ExperienceTraceEvent } from "./experience.types.js"
import { buildExperiences } from "./experience-builder.js"

export class ExperienceRevisionChangedError extends Error {
  public readonly name = "ExperienceRevisionChangedError"
}

@Injectable()
export class ExperiencePersistenceService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly repositories: RepositorySnapshotService,
  ) {}

  public async buildAndPersistSession(sessionId: bigint, claimedRevision: number): Promise<number> {
    const session = await this.prisma.agentSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        cwd: true,
        traceRevision: true,
        experienceBuildStatus: true,
        traceEvents: {
          orderBy: [{ seqNo: "asc" }, { subSeqNo: "asc" }, { id: "asc" }],
        },
      },
    })
    if (session === null) {
      return 0
    }
    if (
      session.traceRevision !== claimedRevision ||
      session.experienceBuildStatus !== ExperienceBuildStatus.PROCESSING
    ) {
      await this.prisma.agentSession.update({
        where: { id: sessionId },
        data: {
          experienceBuildStatus: ExperienceBuildStatus.PENDING,
          experienceProcessingAt: null,
        },
      })
      throw new ExperienceRevisionChangedError("experience source revision changed")
    }
    const events = session.traceEvents.map(toExperienceTraceEvent)
    const repository = await this.resolveRepositorySnapshot(session.cwd)
    const builtExperiences = buildExperiences({
      events,
      sourceRevision: claimedRevision,
      cwd: session.cwd,
      repoKey: repository?.repoKey ?? null,
    })
    await this.replaceExperiences(
      sessionId,
      claimedRevision,
      builtExperiences,
      repository?.manifestHash ?? null,
    )
    return builtExperiences.length
  }

  public async markFailed(sessionId: bigint, error: unknown): Promise<void> {
    await this.prisma.agentSession.update({
      where: { id: sessionId },
      data: {
        experienceBuildStatus: ExperienceBuildStatus.FAILED,
        experienceBuildError: summarizeError(error),
        experienceProcessingAt: null,
      },
    })
  }

  private async resolveRepositorySnapshot(cwd: string | null): Promise<RepositorySnapshot | null> {
    if (cwd === null) {
      return null
    }
    return this.repositories.snapshot(cwd)
  }

  private async replaceExperiences(
    sessionId: bigint,
    claimedRevision: number,
    builtExperiences: readonly BuiltExperienceDraft[],
    manifestHash: string | null,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.agentSession.findUnique({
        where: { id: sessionId },
        select: { traceRevision: true, experienceBuildStatus: true },
      })
      if (
        current === null ||
        current.traceRevision !== claimedRevision ||
        current.experienceBuildStatus !== ExperienceBuildStatus.PROCESSING
      ) {
        throw new ExperienceRevisionChangedError("experience source revision changed")
      }
      await tx.agentExperience.deleteMany({ where: { sessionId } })
      const eventIds = await readTraceEventIds(tx, sessionId)
      for (const experience of builtExperiences) {
        const created = await tx.agentExperience.create({
          data: toExperienceCreate(sessionId, experience, manifestHash),
        })
        for (const attempt of experience.attempts) {
          const createdAttempt = await tx.agentAttempt.create({
            data: {
              experienceId: created.id,
              attemptIndex: attempt.attemptIndex,
              startSeq: attempt.startSeq,
              endSeq: attempt.endSeq,
              outcome: attempt.outcome as AttemptOutcome,
              outcomeConfidence: attempt.outcomeConfidence,
              actionSignature: attempt.actionSignature,
              actionTokens: [...attempt.actionTokens],
              affectedPaths: [...attempt.affectedPaths],
              affectedSymbols: [...attempt.affectedSymbols],
              commandFamilies: [...attempt.commandFamilies],
              errorBefore: [...attempt.errorBefore],
              errorAfter: [...attempt.errorAfter],
              reasonCodes: [...attempt.reasonCodes],
            },
          })
          const links = attempt.evidenceLinks
            .map((link) => {
              const traceEventId = eventIds.get(link.sourceEventKey)
              return traceEventId === undefined
                ? null
                : {
                    attemptId: createdAttempt.id,
                    traceEventId,
                    role: link.role as AttemptEvidenceRole,
                    ordinal: link.ordinal,
                  }
            })
            .filter((link): link is NonNullable<typeof link> => link !== null)
          if (links.length > 0) {
            await tx.agentAttemptEvidence.createMany({ data: links })
          }
        }
      }
      await tx.agentSession.update({
        where: { id: sessionId },
        data: {
          experienceBuildStatus: ExperienceBuildStatus.READY,
          experienceBuilderVersion: EXPERIENCE_BUILDER_VERSION,
          experienceBuildError: null,
          experienceReadyAt: new Date(),
          experienceProcessingAt: null,
        },
      })
    })
  }
}

function toExperienceCreate(
  sessionId: bigint,
  experience: BuiltExperienceDraft,
  manifestHash: string | null,
) {
  return {
    sessionId,
    episodeIndex: experience.episodeIndex,
    sourceRevision: experience.sourceRevision,
    startSeq: experience.startSeq,
    endSeq: experience.endSeq,
    kind: experience.kind,
    title: experience.title,
    taskText: experience.taskText,
    templateSummary: experience.templateSummary,
    outcome: experience.outcome as ExperienceOutcome,
    evidenceScore: experience.evidenceScore,
    evidenceLevel: experience.evidenceLevel,
    evidenceReasonCodes: [...experience.evidenceReasonCodes],
    repoKey: experience.repoKey,
    cwd: experience.cwd,
    manifestHash,
    pathTokens: [...experience.pathTokens],
    symbolTokens: [...experience.symbolTokens],
    errorSignatures: [...experience.errorSignatures],
    errorCodes: [...experience.errorCodes],
    commandFamilies: [...experience.commandFamilies],
    failedAttemptCount: experience.failedAttemptCount,
    successfulAttemptCount: experience.successfulAttemptCount,
    unverifiedAttemptCount: experience.unverifiedAttemptCount,
    searchText: experience.searchText,
    searchDocumentVersion: EXPERIENCE_SEARCH_DOCUMENT_VERSION,
    embeddingStatus: "pending",
    builderVersion: EXPERIENCE_BUILDER_VERSION,
  }
}

async function readTraceEventIds(
  tx: Prisma.TransactionClient,
  sessionId: bigint,
): Promise<ReadonlyMap<string, bigint>> {
  const rows = await tx.agentTraceEvent.findMany({
    where: { sessionId },
    select: { id: true, sourceEventKey: true },
  })
  return new Map(rows.map((row) => [row.sourceEventKey, row.id]))
}

function toExperienceTraceEvent(
  event: Prisma.AgentTraceEventGetPayload<Record<string, never>>,
): ExperienceTraceEvent {
  return {
    id: event.id,
    sourceEventKey: event.sourceEventKey,
    seqNo: event.seqNo,
    subSeqNo: event.subSeqNo,
    eventKind: event.eventKind,
    operationKind: event.operationKind,
    pairingQuality: event.pairingQuality,
    facts: readFacts(event.facts),
    pathTokens: event.pathTokens,
    errorSignatures: event.errorSignatures,
    errorCodes: event.errorCodes,
    commandFamilies: event.commandFamilies,
    redactedExcerpt: event.redactedExcerpt,
    rawPointer: event.rawPointer,
  }
}

function readFacts(value: Prisma.JsonValue): ExperienceTraceEvent["facts"] {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as ExperienceTraceEvent["facts"])
    : {}
}

function summarizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.length <= 2_000 ? message : message.slice(0, 2_000)
}
