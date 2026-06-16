import type { ParseStatus, ScanJobStatus } from "@agent-log-search/shared"
import type {
  ParseStatus as PrismaParseStatus,
  ScanJobStatus as PrismaScanJobStatus,
} from "@prisma/client"

export const PRISMA_PARSE_STATUS_TO_API = {
  pending: "PENDING",
  processing: "PROCESSING",
  ready: "READY",
  failed: "FAILED",
} as const satisfies Record<PrismaParseStatus, ParseStatus>

export const PRISMA_SCAN_JOB_STATUS_TO_API = {
  queued: "queued",
  running: "running",
  completed: "completed",
  failed: "failed",
} as const satisfies Record<PrismaScanJobStatus, ScanJobStatus>
