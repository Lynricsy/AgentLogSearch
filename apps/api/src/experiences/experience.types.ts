import type {
  AttemptEvidenceRole,
  AttemptOutcome,
  EvidenceQuality,
  ExperienceOutcome,
  OperationKind,
  TraceEventKind,
} from "@agent-log-search/shared"

export type ExperienceTraceEvent = {
  readonly id?: bigint
  readonly sourceEventKey: string
  readonly seqNo: number
  readonly subSeqNo: number
  readonly eventKind: TraceEventKind
  readonly operationKind: OperationKind
  readonly pairingQuality: EvidenceQuality
  readonly facts: ExperienceTraceFacts
  readonly pathTokens: readonly string[]
  readonly errorSignatures: readonly string[]
  readonly errorCodes: readonly string[]
  readonly commandFamilies: readonly string[]
  readonly redactedExcerpt: string | null
  readonly rawPointer?: unknown
}

export type ExperienceTraceFacts = {
  readonly canonicalToolKind?: string | undefined
  readonly commands?: readonly ExperienceCommandFact[] | undefined
  readonly processResult?: ExperienceProcessResult | undefined
  readonly testSummary?: ExperienceTestSummary | undefined
  readonly errors?: readonly ExperienceErrorFact[] | undefined
  readonly paths?: readonly ExperiencePathFact[] | undefined
  readonly patch?: ExperiencePatchSummary | undefined
  readonly warnings?: readonly string[] | undefined
  readonly messageSeqNo?: number | undefined
  readonly kind?: string | undefined
}

export type ExperienceCommandFact = {
  readonly normalizedCommand?: string | undefined
  readonly family?: string | undefined
  readonly operationKind?: OperationKind | undefined
  readonly scope?: "full" | "targeted" | "unknown" | undefined
}

export type ExperienceProcessResult = {
  readonly status?: "succeeded" | "failed" | "unknown" | undefined
  readonly exitCode?: number | undefined
  readonly reasonCodes?: readonly string[] | undefined
}

export type ExperienceTestSummary = {
  readonly status?: "succeeded" | "failed" | "unknown" | undefined
  readonly failed?: number | undefined
  readonly passed?: number | undefined
  readonly failedFiles?: readonly string[] | undefined
  readonly failedTests?: readonly string[] | undefined
}

export type ExperienceErrorFact = {
  readonly type?: string | undefined
  readonly code?: string | undefined
  readonly normalizedMessage?: string | undefined
  readonly strictFingerprint?: string | undefined
}

export type ExperiencePathFact = {
  readonly path?: string | undefined
  readonly access?: string | undefined
}

export type ExperiencePatchSummary = {
  readonly files?: readonly {
    readonly path?: string | undefined
    readonly operation?: string | undefined
  }[]
}

export type EpisodeDraft = {
  readonly episodeIndex: number
  readonly taskText: string
  readonly taskEvent: ExperienceTraceEvent
  readonly events: readonly ExperienceTraceEvent[]
  readonly startSeq: number
  readonly endSeq: number
}

export type AttemptDraft = {
  readonly attemptIndex: number
  readonly startSeq: number
  readonly endSeq: number
  readonly outcome: AttemptOutcome
  readonly outcomeConfidence: number
  readonly actionSignature: string
  readonly actionTokens: readonly string[]
  readonly affectedPaths: readonly string[]
  readonly affectedSymbols: readonly string[]
  readonly commandFamilies: readonly string[]
  readonly errorBefore: readonly string[]
  readonly errorAfter: readonly string[]
  readonly reasonCodes: readonly string[]
  readonly evidenceLinks: readonly AttemptEvidenceDraft[]
}

export type AttemptEvidenceDraft = {
  readonly sourceEventKey: string
  readonly role: AttemptEvidenceRole
  readonly ordinal: number
}

export type BuiltExperienceDraft = {
  readonly episodeIndex: number
  readonly sourceRevision: number
  readonly startSeq: number
  readonly endSeq: number
  readonly kind: "change" | "diagnostic"
  readonly title: string
  readonly taskText: string
  readonly templateSummary: string
  readonly outcome: ExperienceOutcome
  readonly evidenceScore: number
  readonly evidenceLevel: "A" | "B" | "C" | "D"
  readonly evidenceReasonCodes: readonly string[]
  readonly repoKey: string | null
  readonly cwd: string | null
  readonly pathTokens: readonly string[]
  readonly symbolTokens: readonly string[]
  readonly errorSignatures: readonly string[]
  readonly errorCodes: readonly string[]
  readonly commandFamilies: readonly string[]
  readonly failedAttemptCount: number
  readonly successfulAttemptCount: number
  readonly unverifiedAttemptCount: number
  readonly searchText: string
  readonly attempts: readonly AttemptDraft[]
}
