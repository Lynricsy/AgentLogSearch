export type ExperienceConfig = {
  readonly workerEnabled: boolean
  readonly searchEnabled: boolean
  readonly workerIntervalMs: number
  readonly workerBatchSize: number
  readonly workerStaleProcessingMs: number
}

type RuntimeEnv = Readonly<Record<string, unknown>>

type NumericBounds = {
  readonly defaultValue: number
  readonly max: number
  readonly min: number
}

export const DEFAULT_EXPERIENCE_WORKER_INTERVAL_MS = 3_000
export const DEFAULT_EXPERIENCE_WORKER_BATCH_SIZE = 8
export const DEFAULT_EXPERIENCE_WORKER_STALE_PROCESSING_MS = 900_000

const EXPERIENCE_BOUNDS = {
  workerIntervalMs: {
    defaultValue: DEFAULT_EXPERIENCE_WORKER_INTERVAL_MS,
    max: 3_600_000,
    min: 100,
  },
  workerBatchSize: {
    defaultValue: DEFAULT_EXPERIENCE_WORKER_BATCH_SIZE,
    max: 100,
    min: 1,
  },
  workerStaleProcessingMs: {
    defaultValue: DEFAULT_EXPERIENCE_WORKER_STALE_PROCESSING_MS,
    max: 86_400_000,
    min: 60_000,
  },
} as const

export class ExperienceConfigError extends Error {
  public readonly name = "ExperienceConfigError"
}

export function readExperienceConfig(env: RuntimeEnv = process.env): ExperienceConfig {
  return {
    workerEnabled: readBooleanEnv(env, "EXPERIENCE_WORKER_ENABLED", false),
    searchEnabled: readBooleanEnv(env, "EXPERIENCE_SEARCH_ENABLED", false),
    workerIntervalMs: readBoundedIntegerEnv(
      env,
      "EXPERIENCE_WORKER_INTERVAL_MS",
      EXPERIENCE_BOUNDS.workerIntervalMs,
    ),
    workerBatchSize: readBoundedIntegerEnv(
      env,
      "EXPERIENCE_WORKER_BATCH_SIZE",
      EXPERIENCE_BOUNDS.workerBatchSize,
    ),
    workerStaleProcessingMs: readBoundedIntegerEnv(
      env,
      "EXPERIENCE_WORKER_STALE_PROCESSING_MS",
      EXPERIENCE_BOUNDS.workerStaleProcessingMs,
    ),
  }
}

export function validateExperienceConfig(env: RuntimeEnv = process.env): void {
  readExperienceConfig(env)
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
      throw new ExperienceConfigError(
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
    throw new ExperienceConfigError(`${name} must be an integer`)
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < bounds.min || parsed > bounds.max) {
    throw new ExperienceConfigError(
      `${name} must be between ${bounds.min.toString()} and ${bounds.max.toString()}`,
    )
  }
  return parsed
}

function readStringEnv(env: RuntimeEnv, name: string): string | undefined {
  const value = env[name]
  return typeof value === "string" ? value.trim() : undefined
}
