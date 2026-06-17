import type { ScanJobStatus } from "@agent-log-search/shared"
import {
  mapRecordValue,
  readBigIntLike,
  readNullableBigIntLike,
  readNullableDate,
  readNullableString,
  readNumber,
  readString,
} from "../scan-jobs/record-readers.js"
import { PRISMA_SCAN_JOB_STATUS_TO_API } from "../scan-jobs/scan-job-mapping.js"
import type { ScanRunRecord } from "./scanner.types.js"
import { truncateErrorMessage } from "./scanner-utils.js"

type ScanJobRecord = Readonly<Record<string, unknown>>

export function toScanRunRecord(record: ScanJobRecord): ScanRunRecord {
  return {
    id: readBigIntLike(record, "id"),
    sourceId: readNullableBigIntLike(record, "sourceId"),
    status: mapScanStatus(readString(record, "status")),
    filesDiscovered: readNumber(record, "filesDiscovered"),
    filesParsed: readNumber(record, "filesParsed"),
    filesFailed: readNumber(record, "filesFailed"),
    sessionsImported: readNumber(record, "sessionsImported"),
    messagesImported: readNumber(record, "messagesImported"),
    chunksCreated: readNumber(record, "chunksCreated"),
    errorMessage: truncateNullable(readNullableString(record, "errorMessage")),
    startedAt: readNullableDate(record, "startedAt"),
    finishedAt: readNullableDate(record, "finishedAt"),
  }
}

function mapScanStatus(value: string): ScanJobStatus {
  return mapRecordValue(PRISMA_SCAN_JOB_STATUS_TO_API, value, "status")
}

function truncateNullable(value: string | null): string | null {
  return value === null ? null : truncateErrorMessage(value)
}
