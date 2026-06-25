import { Injectable } from "@nestjs/common"
import { readEvidenceConfig } from "../evidence/evidence.config.js"
import type { ParserSource } from "../parsers/index.js"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { ParseFailureError, ParserRegistry } from "../parsers/index.js"
import { evidenceExtractorVersionFor, TRACE_PARSER_VERSION } from "../pipeline-versions.js"
import type { MutableScanCounters, SourceConfig } from "./scanner.types.js"
import { ScannerParseIssuesError } from "./scanner-errors.js"
import { fingerprintSource } from "./scanner-fingerprint.js"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { ScannerImporter } from "./scanner-importer.js"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { ScannerJobStore } from "./scanner-job-store.js"
import { summarizeError, truncateErrorMessage } from "./scanner-utils.js"

type HistoryLookup = {
  findUnique(args: {
    readonly where: {
      readonly sourceId_filePath: { readonly sourceId: bigint; readonly filePath: string }
    }
  }): Promise<{
    readonly evidenceExtractorVersion: string | null
    readonly fileHash: string | null
    readonly traceParserVersion: string | null
  } | null>
}

@Injectable()
export class ScannerFileRunner {
  public constructor(
    private readonly parsers: ParserRegistry,
    private readonly importer: ScannerImporter,
    private readonly jobs: ScannerJobStore,
  ) {}

  public async runFile(input: {
    readonly source: SourceConfig
    readonly parserSource: ParserSource
    readonly scannedAt: Date
    readonly counters: MutableScanCounters
    readonly historyFile: HistoryLookup
  }): Promise<string | null> {
    const fingerprint = await fingerprintSource(input.parserSource, input.source.parserType)
    if (
      await isUnchanged(
        input.historyFile,
        input.source.id,
        input.parserSource.filePath,
        fingerprint.hash,
      )
    ) {
      return null
    }

    try {
      const parsed = await this.parsers.parse(input.source.parserType, input.parserSource)
      if (parsed.errors.length > 0) {
        throw new ScannerParseIssuesError(parsed.errors)
      }
      const stats = await this.importer.importFile({
        source: input.source,
        parserSource: input.parserSource,
        fingerprint,
        sessions: parsed.sessions,
        scannedAt: input.scannedAt,
      })
      input.counters.filesParsed += 1
      input.counters.sessionsImported += stats.sessionsImported
      input.counters.messagesImported += stats.messagesImported
      input.counters.chunksCreated += stats.chunksCreated
      return null
    } catch (error) {
      input.counters.filesFailed += 1
      await this.jobs.markFileFailed(
        input.source.id,
        input.parserSource.filePath,
        error,
        input.scannedAt,
      )
      return summarizeFileError(error)
    }
  }
}

async function isUnchanged(
  historyFile: HistoryLookup,
  sourceId: bigint,
  filePath: string,
  hash: string,
): Promise<boolean> {
  const history = await historyFile.findUnique({
    where: { sourceId_filePath: { sourceId, filePath } },
  })
  const expectedEvidenceVersion = evidenceExtractorVersionFor(readEvidenceConfig().pipelineEnabled)
  return (
    history?.fileHash === hash &&
    history.traceParserVersion === TRACE_PARSER_VERSION &&
    history.evidenceExtractorVersion === expectedEvidenceVersion
  )
}

function summarizeFileError(error: unknown): string {
  if (error instanceof ParseFailureError) {
    const line = error.line === null ? "" : ` line ${error.line.toString()}`
    return truncateErrorMessage(`${error.code}${line}: ${error.message}`)
  }
  if (error instanceof Error) {
    return truncateErrorMessage(error.message)
  }
  return summarizeError(error)
}
