import type { EvidenceQuality, OperationKind, TraceEventKind } from "@agent-log-search/shared"

export type CanonicalToolKind =
  | "shell"
  | "apply_patch"
  | "write_file"
  | "edit_file"
  | "read_file"
  | "search"
  | "unknown"

export type CommandFamily =
  | "test"
  | "build"
  | "typecheck"
  | "lint"
  | "git"
  | "package"
  | "run"
  | "other"

export type ValidationScope = "full" | "targeted" | "unknown"

export type ProcessStatus = "succeeded" | "failed" | "unknown"

export type PathAccess = "read" | "write" | "patch" | "create" | "delete" | "execute" | "mention"

export type PathSourceQuality =
  | "tool_argument"
  | "patch"
  | "stack_frame"
  | "command_token"
  | "output_text"
  | "assistant_mention"

export type CommandFact = {
  readonly sourceEventKey: string
  readonly rawCommand: string
  readonly normalizedCommand: string
  readonly tokens: readonly string[]
  readonly family: CommandFamily
  readonly operationKind: OperationKind
  readonly scope: ValidationScope
  readonly segmentIndex: number
  readonly cwdOverride?: string | undefined
  readonly scriptName?: string | undefined
  readonly warnings: readonly string[]
}

export type ProcessResultFact = {
  readonly status: ProcessStatus
  readonly source: "structured" | "footer" | "explicit_status" | "unknown"
  readonly reasonCodes: readonly string[]
  readonly exitCode?: number | undefined
}

export type TestSummary = {
  readonly framework: "jest" | "vitest" | "pytest" | "go-test" | "generic"
  readonly status: ProcessStatus
  readonly reasonCodes: readonly string[]
  readonly suiteCount?: number | undefined
  readonly suitePassed?: number | undefined
  readonly suiteFailed?: number | undefined
  readonly testCount?: number | undefined
  readonly passed?: number | undefined
  readonly failed?: number | undefined
  readonly skipped?: number | undefined
  readonly todo?: number | undefined
  readonly failedFiles: readonly string[]
  readonly failedTests: readonly string[]
}

export type ErrorEvidence = {
  readonly type: string
  readonly message: string
  readonly normalizedMessage: string
  readonly strictFingerprint: string
  readonly coarseFingerprint: string
  readonly frames: readonly string[]
  readonly code?: string | undefined
}

export type PathEvidence = {
  readonly rawPath: string
  readonly path: string
  readonly access: PathAccess
  readonly sourceQuality: PathSourceQuality
  readonly isExternal: boolean
}

export type PatchFileSummary = {
  readonly path: string
  readonly operation: "add" | "update" | "delete" | "rename"
  readonly addedLines: number
  readonly deletedLines: number
  readonly changedRanges: readonly PatchChangedRange[]
  readonly previousPath?: string | undefined
}

export type PatchChangedRange = {
  readonly oldStart?: number | undefined
  readonly oldCount?: number | undefined
  readonly newStart?: number | undefined
  readonly newCount?: number | undefined
}

export type PatchSummary = {
  readonly patchSha256: string
  readonly files: readonly PatchFileSummary[]
}

export type EvidenceFacts = {
  readonly canonicalToolKind?: CanonicalToolKind | undefined
  readonly commands?: readonly CommandFact[] | undefined
  readonly processResult?: ProcessResultFact | undefined
  readonly testSummary?: TestSummary | undefined
  readonly errors?: readonly ErrorEvidence[] | undefined
  readonly omittedErrorCount?: number | undefined
  readonly paths?: readonly PathEvidence[] | undefined
  readonly patch?: PatchSummary | undefined
  readonly warnings?: readonly string[] | undefined
  readonly messageSeqNo?: number | undefined
  readonly kind?: string | undefined
}

export type NormalizedTraceEventDraft = {
  readonly sourceEventKey: string
  readonly seqNo: number
  readonly subSeqNo: number
  readonly eventKind: TraceEventKind
  readonly operationKind: OperationKind
  readonly pairingQuality: EvidenceQuality
  readonly facts: EvidenceFacts
  readonly pathTokens: readonly string[]
  readonly errorSignatures: readonly string[]
  readonly errorCodes: readonly string[]
  readonly commandFamilies: readonly string[]
  readonly rawPointer: unknown
  readonly contentHash: string
  readonly callId?: string | undefined
  readonly toolName?: string | undefined
  readonly occurredAt?: Date | undefined
  readonly rawContentSha256?: string | undefined
  readonly redactedExcerpt?: string | undefined
}

export type EvidencePipelineContext = {
  readonly cwd: string | null
  readonly repositoryRoot?: string | null | undefined
  readonly maxToolOutputChars: number
  readonly maxExcerptChars: number
  readonly maxErrorsPerEvent: number
  readonly maxPathsPerEvent: number
}
