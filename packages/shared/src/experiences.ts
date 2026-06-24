import { z } from "zod"
import { embeddingStatusSchema } from "./constants.js"
import {
  evidenceEventSummarySchema,
  evidenceQualitySchema,
  operationKindSchema,
} from "./evidence.js"

const bigintIdSchema = z.string().trim().regex(/^\d+$/, "id must be an unsigned integer string")

export const EXPERIENCE_BUILD_STATUSES = ["PENDING", "PROCESSING", "READY", "FAILED"] as const
export const EXPERIENCE_OUTCOMES = ["SUCCEEDED", "FAILED", "PARTIAL", "UNKNOWN"] as const
export const ATTEMPT_OUTCOMES = ["SUCCEEDED", "FAILED", "PARTIAL", "UNVERIFIED"] as const
export const REPOSITORY_COMPATIBILITY_LEVELS = [
  "COMPATIBLE",
  "LIKELY_COMPATIBLE",
  "UNCERTAIN",
  "LIKELY_STALE",
  "STALE",
] as const
export const REPOSITORY_SNAPSHOT_QUALITIES = ["exact", "near_time", "late", "unknown"] as const
export const ATTEMPT_EVIDENCE_ROLES = [
  "MUTATION",
  "VALIDATION",
  "OBSERVATION_BEFORE",
  "OBSERVATION_AFTER",
  "CONTEXT",
] as const
export const EXPERIENCE_COMPATIBILITY_DISCLAIMER =
  "该结果只表示相关工程对象仍然存在或相似，不代表历史 patch 可以直接应用。"

export const experienceBuildStatusSchema = z.enum(EXPERIENCE_BUILD_STATUSES)
export const experienceOutcomeSchema = z.enum(EXPERIENCE_OUTCOMES)
export const attemptOutcomeSchema = z.enum(ATTEMPT_OUTCOMES)
export const repositoryCompatibilityLevelSchema = z.enum(REPOSITORY_COMPATIBILITY_LEVELS)
export const repositorySnapshotQualitySchema = z.enum(REPOSITORY_SNAPSHOT_QUALITIES)
export const attemptEvidenceRoleSchema = z.enum(ATTEMPT_EVIDENCE_ROLES)

export const experienceSearchRequestSchema = z.object({
  query: z.string().trim().min(1).max(2000),
  errorText: z.string().max(10000).optional(),
  files: z.array(z.string().max(500)).max(50).default([]),
  symbols: z.array(z.string().max(300)).max(50).default([]),
  repositoryPath: z.string().trim().min(1).max(2000).optional(),
  mode: z.enum(["all", "successful", "failed", "partial", "unverified"]).default("all"),
  topK: z.coerce.number().int().min(1).max(50).default(10),
})

export const experienceScoreBreakdownSchema = z.object({
  dense: z.number().min(0).max(1).nullable().optional(),
  lexical: z.number().min(0).max(1).nullable().optional(),
  errorMatch: z.number().min(0).max(1).nullable().optional(),
  pathMatch: z.number().min(0).max(1).nullable().optional(),
  symbolMatch: z.number().min(0).max(1).nullable().optional(),
  commandMatch: z.number().min(0).max(1).nullable().optional(),
  evidenceFactor: z.number().min(0).max(1).nullable().optional(),
  compatibilityFactor: z.number().min(0).max(1).nullable().optional(),
  finalScore: z.number().min(0).max(1),
})

export const experienceCompatibilitySnapshotSchema = z.object({
  repoKey: z.string().min(1),
  gitHead: z.string().nullable(),
  branch: z.string().nullable(),
  dirtyHash: z.string().min(1),
  manifestHash: z.string().nullable(),
  capturedAt: z.string().datetime(),
  quality: repositorySnapshotQualitySchema,
})

export const experienceCompatibilityFileSchema = z.object({
  historicalPath: z.string().min(1),
  currentPath: z.string().min(1).nullable(),
  status: z.enum(["present", "missing", "renamed"]),
})

export const experienceCompatibilitySchema = z.object({
  level: repositoryCompatibilityLevelSchema,
  score: z.number().min(0).max(1),
  coverage: z.number().min(0).max(1),
  reasonCodes: z.array(z.string().min(1)),
  snapshot: experienceCompatibilitySnapshotSchema,
  files: z.array(experienceCompatibilityFileSchema),
  disclaimer: z.literal(EXPERIENCE_COMPATIBILITY_DISCLAIMER),
})

export const attemptEvidenceLinkSchema = z.object({
  traceEventId: bigintIdSchema,
  role: attemptEvidenceRoleSchema,
  ordinal: z.number().int().min(0),
})

export const experienceAttemptSchema = z.object({
  id: bigintIdSchema,
  experienceId: bigintIdSchema,
  attemptIndex: z.number().int().min(0),
  startSeq: z.number().int().min(0),
  endSeq: z.number().int().min(0),
  outcome: attemptOutcomeSchema,
  outcomeConfidence: z.number().min(0).max(1),
  actionSignature: z.string().min(1),
  actionTokens: z.array(z.string().min(1)),
  affectedPaths: z.array(z.string().min(1)),
  affectedSymbols: z.array(z.string().min(1)),
  commandFamilies: z.array(z.string().min(1)),
  errorBefore: z.array(z.string().min(1)),
  errorAfter: z.array(z.string().min(1)),
  reasonCodes: z.array(z.string().min(1)),
  evidenceLinks: z.array(attemptEvidenceLinkSchema).optional(),
  createdAt: z.string().datetime(),
})

export const experienceSessionSummarySchema = z.object({
  id: bigintIdSchema,
  sourceId: bigintIdSchema,
  historyFileId: bigintIdSchema.nullable(),
  agentName: z.string().min(1),
  externalThreadId: z.string().min(1),
  title: z.string().nullable(),
  cwd: z.string().nullable(),
  traceRevision: z.number().int().min(0),
  experienceBuildStatus: experienceBuildStatusSchema,
  lastMessageAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime().nullable(),
})

export const experienceSummarySchema = z.object({
  id: bigintIdSchema,
  sessionId: bigintIdSchema,
  episodeIndex: z.number().int().min(0),
  sourceRevision: z.number().int().min(0),
  startSeq: z.number().int().min(0),
  endSeq: z.number().int().min(0),
  kind: z.string().min(1),
  title: z.string().min(1),
  taskText: z.string().min(1),
  templateSummary: z.string().min(1),
  outcome: experienceOutcomeSchema,
  evidenceScore: z.number().min(0).max(1),
  evidenceLevel: z.string().min(1),
  evidenceReasonCodes: z.array(z.string().min(1)),
  matchedPaths: z.array(z.string().min(1)),
  matchedErrors: z.array(z.string().min(1)),
  repoKey: z.string().nullable(),
  cwd: z.string().nullable(),
  pathTokens: z.array(z.string().min(1)),
  symbolTokens: z.array(z.string().min(1)),
  errorSignatures: z.array(z.string().min(1)),
  errorCodes: z.array(z.string().min(1)),
  commandFamilies: z.array(z.string().min(1)),
  operationKinds: z.array(operationKindSchema).optional(),
  failedAttemptCount: z.number().int().min(0),
  successfulAttemptCount: z.number().int().min(0),
  unverifiedAttemptCount: z.number().int().min(0),
  scoreBreakdown: experienceScoreBreakdownSchema,
  compatibility: experienceCompatibilitySchema.nullable().optional(),
  attempts: z.array(experienceAttemptSchema),
  evidenceEvents: z.array(evidenceEventSummarySchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const experienceSearchResponseSchema = z.object({
  successful: z.array(experienceSummarySchema),
  failedAttempts: z.array(experienceSummarySchema),
  partial: z.array(experienceSummarySchema),
  unverified: z.array(experienceSummarySchema),
})

export const experienceDetailSchema = experienceSummarySchema.extend({
  session: experienceSessionSummarySchema,
  evidenceEvents: z.array(
    evidenceEventSummarySchema.extend({
      facts: z.record(z.string(), z.unknown()).optional(),
      pairingQuality: evidenceQualitySchema,
    }),
  ),
})

export const experienceRebuildRequestSchema = z.preprocess(
  (value) => value ?? {},
  z.object({
    sourceId: bigintIdSchema.optional(),
    sessionId: bigintIdSchema.optional(),
    includeReady: z.boolean().default(false),
  }),
)

export const experienceRebuildResponseSchema = z.object({
  affectedSessions: z.number().int().min(0),
})

export const experienceStatusResponseSchema = z.object({
  pendingSessions: z.number().int().min(0),
  processingSessions: z.number().int().min(0),
  readySessions: z.number().int().min(0),
  failedSessions: z.number().int().min(0),
  readyExperiences: z.number().int().min(0),
  currentRevisionExperiences: z.number().int().min(0),
  staleRevisionExperiences: z.number().int().min(0),
  embeddingPending: z.number().int().min(0),
  embeddingProcessing: z.number().int().min(0),
  embeddingReady: z.number().int().min(0),
  embeddingFailed: z.number().int().min(0),
  embeddingStatuses: z.record(embeddingStatusSchema, z.number().int().min(0)),
  workerEnabled: z.boolean(),
  searchEnabled: z.boolean(),
  latestWorkerError: z
    .object({
      sessionId: bigintIdSchema,
      message: z.string().min(1).max(10000),
      updatedAt: z.string().datetime(),
    })
    .nullable(),
  updatedAt: z.string().datetime(),
})

export const failedAttemptRiskSchema = z.enum(["none", "low", "medium", "high"])
export const failedAttemptMatchRiskSchema = z.enum(["low", "medium", "high"])

export const experienceFailedAttemptCheckRequestSchema = z.object({
  task: z.string().trim().min(1).max(2000),
  files: z.array(z.string().max(500)).max(50).default([]),
  symbols: z.array(z.string().max(300)).max(50).default([]),
  operationKinds: z.array(operationKindSchema).max(20).default([]),
  plannedCommand: z.string().trim().max(1000).optional(),
  topK: z.coerce.number().int().min(1).max(20).default(5),
})

export const failedAttemptScoreBreakdownSchema = z.object({
  taskSimilarity: z.number().min(0).max(1).nullable().optional(),
  actionTokenMatch: z.number().min(0).max(1),
  pathMatch: z.number().min(0).max(1),
  symbolMatch: z.number().min(0).max(1),
  commandMatch: z.number().min(0).max(1),
  finalScore: z.number().min(0).max(1),
})

export const failedAttemptExperiencePreviewSchema = z.object({
  id: bigintIdSchema,
  sessionId: bigintIdSchema,
  sourceRevision: z.number().int().min(0),
  title: z.string().min(1),
  taskText: z.string().min(1),
  outcome: experienceOutcomeSchema,
  evidenceScore: z.number().min(0).max(1),
  evidenceLevel: z.string().min(1),
  repoKey: z.string().nullable(),
  cwd: z.string().nullable(),
  updatedAt: z.string().datetime(),
})

export const failedAttemptMatchSchema = z.object({
  risk: failedAttemptMatchRiskSchema,
  score: z.number().min(0).max(1),
  message: z.literal("计划操作与一条历史失败尝试高度相似。"),
  experience: failedAttemptExperiencePreviewSchema,
  attempt: experienceAttemptSchema,
  evidenceEvents: z.array(evidenceEventSummarySchema),
  matchedActionTokens: z.array(z.string().min(1)),
  matchedPaths: z.array(z.string().min(1)),
  matchedSymbols: z.array(z.string().min(1)),
  matchedCommandFamilies: z.array(z.string().min(1)),
  matchedErrors: z.array(z.string().min(1)),
  scoreBreakdown: failedAttemptScoreBreakdownSchema,
})

export const experienceFailedAttemptCheckResponseSchema = z.object({
  risk: failedAttemptRiskSchema,
  message: z.literal("计划操作与一条历史失败尝试高度相似。").nullable(),
  matches: z.array(failedAttemptMatchSchema),
})

export type ExperienceBuildStatus = z.infer<typeof experienceBuildStatusSchema>
export type ExperienceOutcome = z.infer<typeof experienceOutcomeSchema>
export type AttemptOutcome = z.infer<typeof attemptOutcomeSchema>
export type AttemptEvidenceRole = z.infer<typeof attemptEvidenceRoleSchema>
export type RepositoryCompatibilityLevel = z.infer<typeof repositoryCompatibilityLevelSchema>
export type RepositorySnapshotQuality = z.infer<typeof repositorySnapshotQualitySchema>
export type ExperienceSearchRequest = z.infer<typeof experienceSearchRequestSchema>
export type ExperienceScoreBreakdown = z.infer<typeof experienceScoreBreakdownSchema>
export type ExperienceCompatibilitySnapshot = z.infer<typeof experienceCompatibilitySnapshotSchema>
export type ExperienceCompatibilityFile = z.infer<typeof experienceCompatibilityFileSchema>
export type ExperienceCompatibility = z.infer<typeof experienceCompatibilitySchema>
export type AttemptEvidenceLink = z.infer<typeof attemptEvidenceLinkSchema>
export type ExperienceAttempt = z.infer<typeof experienceAttemptSchema>
export type ExperienceSessionSummary = z.infer<typeof experienceSessionSummarySchema>
export type ExperienceSummary = z.infer<typeof experienceSummarySchema>
export type ExperienceSearchResponse = z.infer<typeof experienceSearchResponseSchema>
export type ExperienceDetail = z.infer<typeof experienceDetailSchema>
export type ExperienceRebuildRequest = z.infer<typeof experienceRebuildRequestSchema>
export type ExperienceRebuildResponse = z.infer<typeof experienceRebuildResponseSchema>
export type ExperienceStatusResponse = z.infer<typeof experienceStatusResponseSchema>
export type FailedAttemptRisk = z.infer<typeof failedAttemptRiskSchema>
export type FailedAttemptMatchRisk = z.infer<typeof failedAttemptMatchRiskSchema>
export type ExperienceFailedAttemptCheckRequest = z.infer<
  typeof experienceFailedAttemptCheckRequestSchema
>
export type FailedAttemptScoreBreakdown = z.infer<typeof failedAttemptScoreBreakdownSchema>
export type FailedAttemptExperiencePreview = z.infer<typeof failedAttemptExperiencePreviewSchema>
export type FailedAttemptMatch = z.infer<typeof failedAttemptMatchSchema>
export type ExperienceFailedAttemptCheckResponse = z.infer<
  typeof experienceFailedAttemptCheckResponseSchema
>
