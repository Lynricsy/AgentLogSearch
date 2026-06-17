export type ScannerSchedulerConfig = {
  readonly enabled: boolean
  readonly intervalMs: number
}

export const DEFAULT_SCAN_SCHEDULER_INTERVAL_SECONDS = 60

export function readScannerSchedulerConfig(): ScannerSchedulerConfig {
  const { SCAN_SCHEDULER_ENABLED } = process.env
  return {
    enabled: SCAN_SCHEDULER_ENABLED === "true",
    intervalMs: readIntervalSeconds() * 1000,
  }
}

function readIntervalSeconds(): number {
  const { SCAN_INTERVAL_SECONDS: raw } = process.env
  if (raw === undefined) {
    return DEFAULT_SCAN_SCHEDULER_INTERVAL_SECONDS
  }
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1) {
    return DEFAULT_SCAN_SCHEDULER_INTERVAL_SECONDS
  }
  return parsed
}
