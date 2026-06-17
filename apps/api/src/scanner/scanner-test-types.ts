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
}

export type FakeHistoryFile = {
  readonly id: bigint
  readonly sourceId: bigint
  readonly filePath: string
  fileHash: string | null
  parseStatus: string
  errorMessage: string | null
}

export type FakeSession = {
  readonly id: bigint
  readonly sourceId: bigint
  readonly externalThreadId: string
  historyFileId: bigint | null
}

export type FakeMessage = {
  readonly sessionId: bigint
  readonly seqNo: number
  readonly content: string
}

export type FakeParser = {
  calls: number
  parse(parserType: string, source: ParserSource): Promise<ParseResult>
}

export type FakeHistoryCreate = {
  readonly sourceId: bigint
  readonly filePath: string
  readonly fileHash?: string | null
}

export type FakeSessionCreate = {
  readonly sourceId: bigint
  readonly externalThreadId: string
  readonly historyFileId: bigint | null
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

export type FakeScanJob = Record<string, unknown> & { readonly id: bigint }

export type ScanJobUpdateArgs = {
  readonly data: Record<string, unknown>
  readonly where: { readonly id: bigint }
}

export type FakeSnapshot = {
  readonly histories: readonly FakeHistoryFile[]
  readonly messages: readonly FakeMessage[]
  readonly sessions: readonly FakeSession[]
}
