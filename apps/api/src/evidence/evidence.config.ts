export type EvidenceConfig = {
  readonly pipelineEnabled: boolean
  readonly repositoryCompatibilityEnabled: boolean
  readonly maxToolOutputChars: number
  readonly maxExcerptChars: number
  readonly maxErrorsPerEvent: number
  readonly maxPathsPerEvent: number
}

type RuntimeEnv = Readonly<Record<string, unknown>>

type NumericBounds = {
  readonly defaultValue: number
  readonly max: number
  readonly min: number
}

export const DEFAULT_EVIDENCE_MAX_TOOL_OUTPUT_CHARS = 2_000_000
export const DEFAULT_EVIDENCE_MAX_EXCERPT_CHARS = 2_000
export const DEFAULT_EVIDENCE_MAX_ERRORS_PER_EVENT = 20
export const DEFAULT_EVIDENCE_MAX_PATHS_PER_EVENT = 100

const EVIDENCE_BOUNDS = {
  maxToolOutputChars: {
    defaultValue: DEFAULT_EVIDENCE_MAX_TOOL_OUTPUT_CHARS,
    max: 10_000_000,
    min: 10_000,
  },
  maxExcerptChars: {
    defaultValue: DEFAULT_EVIDENCE_MAX_EXCERPT_CHARS,
    max: 20_000,
    min: 100,
  },
  maxErrorsPerEvent: {
    defaultValue: DEFAULT_EVIDENCE_MAX_ERRORS_PER_EVENT,
    max: 200,
    min: 1,
  },
  maxPathsPerEvent: {
    defaultValue: DEFAULT_EVIDENCE_MAX_PATHS_PER_EVENT,
    max: 1_000,
    min: 1,
  },
} as const

export class EvidenceConfigError extends Error {
  public readonly name = "EvidenceConfigError"
}

export function readEvidenceConfig(env: RuntimeEnv = process.env): EvidenceConfig {
  return {
    pipelineEnabled: readBooleanEnv(env, "EVIDENCE_PIPELINE_ENABLED", false),
    repositoryCompatibilityEnabled: readBooleanEnv(env, "REPOSITORY_COMPATIBILITY_ENABLED", false),
    maxToolOutputChars: readBoundedIntegerEnv(
      env,
      "EVIDENCE_MAX_TOOL_OUTPUT_CHARS",
      EVIDENCE_BOUNDS.maxToolOutputChars,
    ),
    maxExcerptChars: readBoundedIntegerEnv(
      env,
      "EVIDENCE_MAX_EXCERPT_CHARS",
      EVIDENCE_BOUNDS.maxExcerptChars,
    ),
    maxErrorsPerEvent: readBoundedIntegerEnv(
      env,
      "EVIDENCE_MAX_ERRORS_PER_EVENT",
      EVIDENCE_BOUNDS.maxErrorsPerEvent,
    ),
    maxPathsPerEvent: readBoundedIntegerEnv(
      env,
      "EVIDENCE_MAX_PATHS_PER_EVENT",
      EVIDENCE_BOUNDS.maxPathsPerEvent,
    ),
  }
}

export function validateEvidenceConfig(env: RuntimeEnv = process.env): void {
  readEvidenceConfig(env)
}

function readBooleanEnv(env: RuntimeEnv, name: string, fallback: boolean): boolean {
  const value = readStringEnv(env, name)
  if (value === undefined || value === "") {
    return fallback
  }
  switch (value.toLocaleLowerCase("en-US")) {
    case "true":
    case "1":
    case "yes":
    case "on":
      return true
    case "false":
    case "0":
    case "no":
    case "off":
      return false
    default:
      throw new EvidenceConfigError(
        `${name} must be a boolean value: true, false, 1, 0, yes, no, on, or off`,
      )
  }
}

function readBoundedIntegerEnv(env: RuntimeEnv, name: string, bounds: NumericBounds): number {
  const value = readStringEnv(env, name)
  if (value === undefined || value === "") {
    return bounds.defaultValue
  }
  if (!/^\d+$/.test(value)) {
    throw new EvidenceConfigError(`${name} must be an integer`)
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < bounds.min || parsed > bounds.max) {
    throw new EvidenceConfigError(
      `${name} must be between ${bounds.min.toString()} and ${bounds.max.toString()}`,
    )
  }
  return parsed
}

function readStringEnv(env: RuntimeEnv, name: string): string | undefined {
  const value = env[name]
  return typeof value === "string" ? value.trim() : undefined
}
