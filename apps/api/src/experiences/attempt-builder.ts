import { createHash } from "node:crypto"
import type { AttemptOutcome, OperationKind } from "@agent-log-search/shared"
import type { AttemptDraft, EpisodeDraft, ExperienceTraceEvent } from "./experience.types.js"

const MUTATION_KINDS = new Set<OperationKind>([
  "FILE_WRITE",
  "FILE_PATCH",
  "FILE_DELETE",
  "PACKAGE_CHANGE",
])

const VALIDATION_STRENGTH = {
  BUILD: 0.65,
  LINT: 0.45,
  TEST_FULL: 1.0,
  TEST_TARGETED: 0.8,
  TYPECHECK: 0.65,
} as const

export function buildAttempts(episode: EpisodeDraft): readonly AttemptDraft[] {
  const attempts: AttemptMutable[] = []
  let current: AttemptMutable | null = null
  let latestObservationErrors: readonly string[] = []

  for (const event of episode.events) {
    if (event.eventKind === "USER_MESSAGE") {
      continue
    }
    if (isMutation(event)) {
      if (current !== null && current.validations.length > 0) {
        finalizeAttempt(current)
        attempts.push(current)
        current = null
      }
      if (current === null) {
        current = createAttempt(attempts.length, event, latestObservationErrors)
      }
      current.mutations.push(event)
      current.endSeq = event.seqNo
      continue
    }
    if (isValidation(event)) {
      if (current === null) {
        latestObservationErrors = mergeErrors(latestObservationErrors, event.errorSignatures)
        continue
      }
      current.validations.push(event)
      current.endSeq = event.seqNo
      latestObservationErrors = mergeErrors(latestObservationErrors, event.errorSignatures)
      continue
    }
    if (current === null) {
      latestObservationErrors = mergeErrors(latestObservationErrors, event.errorSignatures)
    } else {
      current.observationsAfter.push(event)
      current.endSeq = event.seqNo
    }
  }

  if (current !== null) {
    finalizeAttempt(current)
    attempts.push(current)
  }

  return attempts.map(freezeAttempt)
}

function createAttempt(
  attemptIndex: number,
  event: ExperienceTraceEvent,
  errorBefore: readonly string[],
): AttemptMutable {
  return {
    attemptIndex,
    startSeq: event.seqNo,
    endSeq: event.seqNo,
    mutations: [],
    validations: [],
    observationsAfter: [],
    errorBefore,
    outcome: "UNVERIFIED",
    outcomeConfidence: 0.4,
    reasonCodes: [],
  }
}

function finalizeAttempt(attempt: AttemptMutable): void {
  const outcome = resolveOutcome(attempt.validations)
  attempt.outcome = outcome.outcome
  attempt.outcomeConfidence = outcome.confidence
  attempt.reasonCodes = outcome.reasonCodes
}

function freezeAttempt(attempt: AttemptMutable): AttemptDraft {
  const mutationPaths = unique(attempt.mutations.flatMap((event) => event.pathTokens))
  const validationFamilies = unique(attempt.validations.flatMap((event) => event.commandFamilies))
  const allCommandFamilies = unique([
    ...attempt.mutations.flatMap((event) => event.commandFamilies),
    ...validationFamilies,
  ])
  const actionTokens = buildActionTokens(attempt.mutations, allCommandFamilies)
  return {
    attemptIndex: attempt.attemptIndex,
    startSeq: attempt.startSeq,
    endSeq: attempt.endSeq,
    outcome: attempt.outcome,
    outcomeConfidence: attempt.outcomeConfidence,
    actionSignature: sha256(actionTokens.join("\n")),
    actionTokens,
    affectedPaths: mutationPaths,
    affectedSymbols: [],
    commandFamilies: allCommandFamilies,
    errorBefore: attempt.errorBefore,
    errorAfter: unique([
      ...attempt.validations.flatMap((event) => event.errorSignatures),
      ...attempt.observationsAfter.flatMap((event) => event.errorSignatures),
    ]),
    reasonCodes: attempt.reasonCodes,
    evidenceLinks: [
      ...attempt.mutations.map((event, ordinal) => ({
        sourceEventKey: event.sourceEventKey,
        role: "MUTATION" as const,
        ordinal,
      })),
      ...attempt.validations.map((event, ordinal) => ({
        sourceEventKey: event.sourceEventKey,
        role: "VALIDATION" as const,
        ordinal,
      })),
      ...attempt.observationsAfter.map((event, ordinal) => ({
        sourceEventKey: event.sourceEventKey,
        role: "OBSERVATION_AFTER" as const,
        ordinal,
      })),
    ],
  }
}

function resolveOutcome(validations: readonly ExperienceTraceEvent[]): {
  readonly outcome: AttemptOutcome
  readonly confidence: number
  readonly reasonCodes: readonly string[]
} {
  if (validations.length === 0) {
    return { outcome: "UNVERIFIED", confidence: 0.4, reasonCodes: ["NO_POST_MUTATION_VALIDATION"] }
  }
  const classified = validations.map((event) => ({
    event,
    status: validationStatus(event),
    strength: validationStrength(event),
  }))
  const known = classified.filter((entry) => entry.status !== "unknown")
  if (known.length === 0) {
    return { outcome: "UNVERIFIED", confidence: 0.45, reasonCodes: ["VALIDATION_UNKNOWN"] }
  }
  const last = known[known.length - 1]
  if (last === undefined) {
    return { outcome: "UNVERIFIED", confidence: 0.45, reasonCodes: ["VALIDATION_UNKNOWN"] }
  }
  const maxSuccessStrength = maxStrength(known.filter((entry) => entry.status === "succeeded"))
  const maxFailedStrength = maxStrength(known.filter((entry) => entry.status === "failed"))
  if (last.status === "failed") {
    if (maxSuccessStrength === 0) {
      return { outcome: "FAILED", confidence: 0.85, reasonCodes: ["LAST_VALIDATION_FAILED"] }
    }
    return last.strength >= maxSuccessStrength
      ? {
          outcome: "FAILED",
          confidence: 0.8,
          reasonCodes: ["STRONGER_OR_EQUAL_FAILURE_AFTER_SUCCESS"],
        }
      : { outcome: "PARTIAL", confidence: 0.7, reasonCodes: ["LOWER_SCOPE_FAILURE_AFTER_SUCCESS"] }
  }
  if (maxFailedStrength > last.strength) {
    return { outcome: "PARTIAL", confidence: 0.7, reasonCodes: ["STRONGER_FAILURE_NOT_COVERED"] }
  }
  if (maxFailedStrength > 0 && maxFailedStrength === last.strength) {
    return { outcome: "PARTIAL", confidence: 0.65, reasonCodes: ["EQUAL_SCOPE_FAILURE_PRESENT"] }
  }
  return { outcome: "SUCCEEDED", confidence: 0.9, reasonCodes: ["LAST_VALIDATION_SUCCEEDED"] }
}

function isMutation(event: ExperienceTraceEvent): boolean {
  if (MUTATION_KINDS.has(event.operationKind)) {
    return true
  }
  if (event.operationKind === "FILE_PATCH") {
    return true
  }
  return event.facts.patch !== undefined
}

function isValidation(event: ExperienceTraceEvent): boolean {
  return (
    event.operationKind === "TEST" ||
    event.operationKind === "BUILD" ||
    event.operationKind === "TYPECHECK" ||
    event.operationKind === "LINT"
  )
}

function validationStatus(event: ExperienceTraceEvent): "succeeded" | "failed" | "unknown" {
  const processStatus = event.facts.processResult?.status
  const testStatus = event.facts.testSummary?.status
  if (testStatus === "failed" || processStatus === "failed") return "failed"
  if (testStatus === "succeeded" || processStatus === "succeeded") return "succeeded"
  return "unknown"
}

function validationStrength(event: ExperienceTraceEvent): number {
  if (event.operationKind === "TEST") {
    const scope = event.facts.commands?.[0]?.scope
    return scope === "full" ? VALIDATION_STRENGTH.TEST_FULL : VALIDATION_STRENGTH.TEST_TARGETED
  }
  if (event.operationKind === "BUILD") return VALIDATION_STRENGTH.BUILD
  if (event.operationKind === "TYPECHECK") return VALIDATION_STRENGTH.TYPECHECK
  if (event.operationKind === "LINT") return VALIDATION_STRENGTH.LINT
  return 0
}

function buildActionTokens(
  mutations: readonly ExperienceTraceEvent[],
  commandFamilies: readonly string[],
): readonly string[] {
  const tokens: string[] = []
  for (const event of mutations) {
    tokens.push(`op:${event.operationKind.toLocaleLowerCase("en-US")}`)
    for (const path of event.pathTokens) {
      tokens.push(`path:${path}`)
      const parts = path.split("/")
      const basename = parts.at(-1)
      if (basename !== undefined) tokens.push(`basename:${basename}`)
      if (parts.length > 1) tokens.push(`dir:${parts.slice(0, -1).join("/")}`)
    }
  }
  for (const family of commandFamilies) {
    tokens.push(`command-family:${family}`)
  }
  return [...unique(tokens)].sort()
}

function maxStrength(entries: readonly { readonly strength: number }[]): number {
  return entries.reduce((max, entry) => Math.max(max, entry.strength), 0)
}

function mergeErrors(previous: readonly string[], next: readonly string[]): readonly string[] {
  return unique([...previous, ...next]).slice(0, 20)
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.length > 0))]
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

type AttemptMutable = {
  attemptIndex: number
  startSeq: number
  endSeq: number
  mutations: ExperienceTraceEvent[]
  validations: ExperienceTraceEvent[]
  observationsAfter: ExperienceTraceEvent[]
  errorBefore: readonly string[]
  outcome: AttemptOutcome
  outcomeConfidence: number
  reasonCodes: readonly string[]
}
