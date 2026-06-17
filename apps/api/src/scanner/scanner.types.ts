import type {
  ParserType,
  ScanJobStatus,
  SourcePreset,
  SourceReaderType,
} from "@agent-log-search/shared"
import type { ParsedSession, ParserSource } from "../parsers/index.js"

export type SourceConfig = {
  readonly id: bigint
  readonly name: string
  readonly sourcePreset: SourcePreset
  readonly parserType: ParserType
  readonly readerType: SourceReaderType
  readonly rootPath: string
  readonly fileGlob: string
  readonly resumeTemplate: string
}

export type SourceDueConfig = SourceConfig & {
  readonly scanIntervalSeconds: number
  readonly lastScanAt: Date | null
}

export type FileFingerprint = {
  readonly hash: string
  readonly fileSize: bigint
  readonly modifiedAt: Date | null
}

export type ScannedParserSource = {
  readonly source: ParserSource
  readonly fingerprint: FileFingerprint
}

export type FileImportInput = {
  readonly source: SourceConfig
  readonly parserSource: ParserSource
  readonly fingerprint: FileFingerprint
  readonly sessions: readonly ParsedSession[]
  readonly scannedAt: Date
}

export type FileImportStats = {
  readonly sessionsImported: number
  readonly messagesImported: number
  readonly chunksCreated: number
}

export type ScanRunRecord = {
  readonly id: string
  readonly sourceId: string | null
  readonly status: ScanJobStatus
  readonly filesDiscovered: number
  readonly filesParsed: number
  readonly filesFailed: number
  readonly sessionsImported: number
  readonly messagesImported: number
  readonly chunksCreated: number
  readonly errorMessage: string | null
  readonly startedAt: string | null
  readonly finishedAt: string | null
}

export type ScanRunResponse = {
  readonly records: readonly ScanRunRecord[]
}

export type MutableScanCounters = {
  filesDiscovered: number
  filesParsed: number
  filesFailed: number
  sessionsImported: number
  messagesImported: number
  chunksCreated: number
}
