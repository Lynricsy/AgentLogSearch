import type { AgentRole } from "@agent-log-search/shared"
import type { ParseResult, ParserSource } from "../parsers/index.js"

export type FakeSource = {
  readonly id: bigint
  readonly name: string
  readonly sourcePreset: string
  readonly parserType: string
  readonly readerType: string
  readonly rootPath: string
  readonly fileGlob: string
  readonly resumeTemplate: string
  readonly enabled: boolean
  readonly scanIntervalSeconds: number
  readonly lastScanAt: Date | null
}

export type FakeHistoryFile = {
  readonly id: bigint
  readonly sourceId: bigint
  readonly filePath: string
  evidenceExtractorVersion: string | null
  fileHash: string | null
  parseStatus: string
  errorMessage: string | null
  traceParserVersion: string | null
}

export type FakeSession = {
  readonly id: bigint
  readonly sourceId: bigint
  readonly externalThreadId: string
  experienceBuildError: string | null
  experienceBuildStatus: string
  experienceBuilderVersion: string | null
  experienceProcessingAt: Date | null
  experienceReadyAt: Date | null
  experienceRequestedAt: Date | null
  historyFileId: bigint | null
  traceRevision: number
}

export type FakeMessage = {
  readonly sessionId: bigint
  readonly seqNo: number
  readonly role?: AgentRole
  readonly content: string
  readonly model?: string | null
  readonly createdAt?: Date | null
}

export type FakeTraceEvent = Record<string, unknown> & {
  readonly facts?: unknown
  readonly pathTokens?: readonly string[]
  readonly redactedExcerpt?: string | null
  readonly sessionId: bigint
  readonly sourceEventKey: string
}

export type FakeChunk = {
  readonly sessionId: bigint
  readonly sourceId: bigint
  readonly chunkIndex: number
  readonly startMessageSeq: number | null
  readonly endMessageSeq: number | null
  readonly agentName: string | null
  readonly externalThreadId: string | null
  readonly cwd: string | null
  readonly chunkText: string
  readonly embeddingStatus: "pending" | "processing" | "ready" | "failed"
}

export type FakeParser = {
  calls: number
  parse(parserType: string, source: ParserSource): Promise<ParseResult>
}

export type FakeHistoryCreate = {
  readonly sourceId: bigint
  readonly filePath: string
  readonly evidenceExtractorVersion?: string | null
  readonly fileHash?: string | null
  readonly traceParserVersion?: string | null
}

export type FakeSessionCreate = {
  readonly sourceId: bigint
  readonly externalThreadId: string
  readonly historyFileId: bigint | null
}

export type SessionUpdateArgs = {
  readonly data: Partial<
    Omit<FakeSession, "traceRevision"> & {
      readonly traceRevision: { readonly increment: number } | number
    }
  >
  readonly where: { readonly id: bigint }
}

export type HistoryUniqueArgs = {
  readonly where: {
    readonly sourceId_filePath: { readonly sourceId: bigint; readonly filePath: string }
  }
}

export type HistoryUpsertArgs = {
  readonly create: FakeHistoryCreate
  readonly update: Partial<FakeHistoryFile>
  readonly where: HistoryUniqueArgs["where"]
}

export type HistoryUpdateArgs = {
  readonly data: Partial<FakeHistoryFile>
  readonly where: { readonly id: bigint }
}

export type SessionUpsertArgs = {
  readonly create: FakeSessionCreate
  readonly update: Partial<FakeSession>
  readonly where: {
    readonly sourceId_externalThreadId: {
      readonly sourceId: bigint
      readonly externalThreadId: string
    }
  }
}

export type FakeScanJob = Record<string, unknown> & {
  readonly id: bigint
  readonly sourceId?: bigint | null
}

export type ScanJobUpdateArgs = {
  readonly data: Record<string, unknown>
  readonly where: { readonly id: bigint }
}

export type SourceUpdateArgs = {
  readonly data: Partial<FakeSource>
  readonly where: { readonly id: bigint }
}

export type FakeSnapshot = {
  readonly chunks: readonly FakeChunk[]
  readonly histories: readonly FakeHistoryFile[]
  readonly messages: readonly FakeMessage[]
  readonly sessions: readonly FakeSession[]
  readonly traceEvents: readonly FakeTraceEvent[]
}
