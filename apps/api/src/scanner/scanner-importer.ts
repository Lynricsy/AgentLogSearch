import { createHash } from "node:crypto"
import { Injectable } from "@nestjs/common"
import { EmbeddingStatus, EvidenceQuality, OperationKind, type Prisma } from "@prisma/client"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { PrismaService } from "../database/prisma.service.js"
import { readEvidenceConfig } from "../evidence/evidence.config.js"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { EvidencePipelineService } from "../evidence/evidence-pipeline.service.js"
import type { NormalizedTraceEventDraft } from "../evidence/evidence-types.js"
import type { ParsedMessage, ParsedSession, ParsedTraceEvent } from "../parsers/index.js"
import { EVIDENCE_EXTRACTOR_VERSION, TRACE_PARSER_VERSION } from "../pipeline-versions.js"
import type { ChunkDraft } from "../scanner/chunker.service.js"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { ChunkerService } from "../scanner/chunker.service.js"
import { retainHistoryMessages } from "./message-retention.js"
import type { FileImportInput, FileImportStats, SourceConfig } from "./scanner.types.js"
import { toNullableDate } from "./scanner-utils.js"

type ImportClient = Prisma.TransactionClient | PrismaService

export const DEFAULT_SCANNER_IMPORT_TRANSACTION_TIMEOUT_MS = 120_000

@Injectable()
export class ScannerImporter {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly chunker: ChunkerService,
    private readonly evidencePipeline: EvidencePipelineService,
  ) {}

  public async importFile(input: FileImportInput): Promise<FileImportStats> {
    return this.prisma.$transaction(
      (tx) => importFileWithClient(tx, input, this.chunker, this.evidencePipeline),
      { timeout: readImportTransactionTimeoutMs() },
    )
  }
}

async function importFileWithClient(
  tx: ImportClient,
  input: FileImportInput,
  chunker: ChunkerService,
  evidencePipeline: EvidencePipelineService,
): Promise<FileImportStats> {
  const history = await tx.historyFile.upsert({
    where: {
      sourceId_filePath: { sourceId: input.source.id, filePath: input.parserSource.filePath },
    },
    create: {
      sourceId: input.source.id,
      filePath: input.parserSource.filePath,
      fileHash: input.fingerprint.hash,
      fileSize: input.fingerprint.fileSize,
      modifiedAt: input.fingerprint.modifiedAt,
      lastScannedAt: input.scannedAt,
      parseStatus: "processing",
      errorMessage: null,
      traceParserVersion: TRACE_PARSER_VERSION,
      evidenceExtractorVersion: EVIDENCE_EXTRACTOR_VERSION,
    },
    update: {
      fileHash: input.fingerprint.hash,
      fileSize: input.fingerprint.fileSize,
      modifiedAt: input.fingerprint.modifiedAt,
      lastScannedAt: input.scannedAt,
      parseStatus: "processing",
      errorMessage: null,
      traceParserVersion: TRACE_PARSER_VERSION,
      evidenceExtractorVersion: EVIDENCE_EXTRACTOR_VERSION,
    },
  })

  const stats = await importSessions(tx, input, history.id, chunker, evidencePipeline)
  await tx.historyFile.update({
    where: { id: history.id },
    data: { parseStatus: "ready", errorMessage: null },
  })
  return stats
}

async function importSessions(
  tx: ImportClient,
  input: FileImportInput,
  historyFileId: bigint,
  chunker: ChunkerService,
  evidencePipeline: EvidencePipelineService,
): Promise<FileImportStats> {
  let messagesImported = 0
  let chunksCreated = 0
  const evidenceEnabled = readEvidenceConfig().pipelineEnabled
  for (const session of input.sessions) {
    const retainedSession = retainHistoryMessages(session)
    const record = await tx.agentSession.upsert({
      where: {
        sourceId_externalThreadId: {
          sourceId: input.source.id,
          externalThreadId: retainedSession.threadId,
        },
      },
      create: toSessionCreate(input.source, historyFileId, retainedSession),
      update: toSessionUpdate(input.source, historyFileId, retainedSession),
    })
    const sessionChunksCreated = await replaceSessionRows(
      tx,
      input.source,
      record.id,
      retainedSession,
      chunker,
      evidencePipeline,
      evidenceEnabled,
    )
    await markTraceRevisionUpdated(tx, record.id, evidenceEnabled)
    messagesImported += retainedSession.messages.length
    chunksCreated += sessionChunksCreated
  }
  return { sessionsImported: input.sessions.length, messagesImported, chunksCreated }
}

async function markTraceRevisionUpdated(
  tx: ImportClient,
  sessionId: bigint,
  evidenceEnabled: boolean,
): Promise<void> {
  await tx.agentSession.update({
    where: { id: sessionId },
    data: {
      traceRevision: { increment: 1 },
      experienceBuildStatus: evidenceEnabled ? "PENDING" : "READY",
      experienceBuilderVersion: null,
      experienceBuildError: null,
      experienceRequestedAt: new Date(),
      experienceReadyAt: evidenceEnabled ? null : new Date(),
      experienceProcessingAt: null,
    },
  })
}

async function replaceSessionRows(
  tx: ImportClient,
  source: SourceConfig,
  sessionId: bigint,
  session: ParsedSession,
  chunker: ChunkerService,
  evidencePipeline: EvidencePipelineService,
  evidenceEnabled: boolean,
): Promise<number> {
  await tx.agentChunk.deleteMany({ where: { sessionId } })
  await tx.agentMessage.deleteMany({ where: { sessionId } })
  await tx.agentTraceEvent.deleteMany({ where: { sessionId } })
  if (session.messages.length > 0) {
    await tx.agentMessage.createMany({
      data: session.messages.map((message) => toMessageCreate(sessionId, message)),
    })
  }
  const chunks = chunker.chunkSession(source, session)
  if (chunks.length > 0) {
    await tx.agentChunk.createMany({
      data: chunks.map((chunk) => toChunkCreate(source.id, sessionId, chunk)),
    })
  }
  const traceEvents = buildTraceEvents(session, evidencePipeline, evidenceEnabled)
  if (traceEvents.length > 0) {
    await tx.agentTraceEvent.createMany({
      data: traceEvents.map((event) => toTraceEventCreate(sessionId, event)),
    })
  }
  return chunks.length
}

function toSessionCreate(source: SourceConfig, historyFileId: bigint, session: ParsedSession) {
  return {
    sourceId: source.id,
    historyFileId,
    agentName: source.sourcePreset,
    externalThreadId: sanitizeText(session.threadId),
    title: sanitizeNullableText(session.title),
    cwd: sanitizeNullableText(session.cwd),
    modelName: sanitizeNullableText(session.model),
    startedAt: toNullableDate(session.startedAt),
    lastMessageAt: toNullableDate(session.updatedAt),
    messageCount: session.messages.length,
    resumeCommand: buildResumeCommand(source.resumeTemplate, session),
  }
}

function toSessionUpdate(source: SourceConfig, historyFileId: bigint, session: ParsedSession) {
  return {
    historyFileId,
    agentName: source.sourcePreset,
    title: sanitizeNullableText(session.title),
    cwd: sanitizeNullableText(session.cwd),
    modelName: sanitizeNullableText(session.model),
    startedAt: toNullableDate(session.startedAt),
    lastMessageAt: toNullableDate(session.updatedAt),
    messageCount: session.messages.length,
    resumeCommand: buildResumeCommand(source.resumeTemplate, session),
  }
}

function toMessageCreate(sessionId: bigint, message: ParsedMessage) {
  return {
    sessionId,
    seqNo: message.sequence,
    role: message.role,
    content: sanitizeText(message.content),
    model: sanitizeNullableText(message.model),
    createdAt: toNullableDate(message.createdAt),
  }
}

function toChunkCreate(sourceId: bigint, sessionId: bigint, chunk: ChunkDraft) {
  return {
    sessionId,
    sourceId,
    chunkIndex: chunk.chunkIndex,
    startMessageSeq: chunk.startMessageSeq,
    endMessageSeq: chunk.endMessageSeq,
    agentName: sanitizeNullableText(chunk.agentName),
    externalThreadId: sanitizeNullableText(chunk.externalThreadId),
    cwd: sanitizeNullableText(chunk.cwd),
    chunkText: sanitizeText(chunk.chunkText),
    embeddingStatus: EmbeddingStatus.pending,
  }
}

function buildTraceEvents(
  session: ParsedSession,
  evidencePipeline: EvidencePipelineService,
  evidenceEnabled: boolean,
): readonly (NormalizedTraceEventDraft | ParsedTraceEvent)[] {
  if (!evidenceEnabled) {
    return session.traceEvents
  }
  const config = readEvidenceConfig()
  return evidencePipeline.processSession(session, {
    cwd: session.cwd,
    repositoryRoot: session.cwd,
    maxToolOutputChars: config.maxToolOutputChars,
    maxExcerptChars: config.maxExcerptChars,
    maxErrorsPerEvent: config.maxErrorsPerEvent,
    maxPathsPerEvent: config.maxPathsPerEvent,
  })
}

function toTraceEventCreate(
  sessionId: bigint,
  event: NormalizedTraceEventDraft | ParsedTraceEvent,
) {
  if ("eventKind" in event) {
    return toNormalizedTraceEventCreate(sessionId, event)
  }
  return toParsedTraceEventCreate(sessionId, event)
}

function toNormalizedTraceEventCreate(sessionId: bigint, event: NormalizedTraceEventDraft) {
  return {
    sessionId,
    sourceEventKey: sanitizeText(event.sourceEventKey),
    seqNo: event.seqNo,
    subSeqNo: event.subSeqNo,
    eventKind: event.eventKind,
    operationKind: event.operationKind,
    occurredAt: event.occurredAt ?? null,
    callId: sanitizeNullableText(event.callId ?? null),
    toolName: sanitizeNullableText(event.toolName ?? null),
    pairingQuality: event.pairingQuality,
    facts: toJsonObject(event.facts),
    pathTokens: event.pathTokens.map(sanitizeText),
    errorSignatures: event.errorSignatures.map(sanitizeText),
    errorCodes: event.errorCodes.map(sanitizeText),
    commandFamilies: event.commandFamilies.map(sanitizeText),
    rawPointer: toJsonValue(event.rawPointer),
    redactedExcerpt: sanitizeNullableText(event.redactedExcerpt ?? null),
    rawContentSha256: sanitizeNullableText(event.rawContentSha256 ?? null),
    contentHash: event.contentHash,
    extractorVersion: EVIDENCE_EXTRACTOR_VERSION,
  }
}

function toParsedTraceEventCreate(sessionId: bigint, event: ParsedTraceEvent) {
  return {
    sessionId,
    sourceEventKey: sanitizeText(event.sourceEventKey),
    seqNo: event.sequence,
    subSeqNo: event.subSequence,
    eventKind: toTraceEventKind(event),
    operationKind: OperationKind.NONE,
    occurredAt: event.occurredAt ?? null,
    callId: "callId" in event ? sanitizeNullableText(event.callId ?? null) : null,
    toolName: "toolName" in event ? sanitizeNullableText(event.toolName ?? null) : null,
    pairingQuality: EvidenceQuality.UNKNOWN,
    facts: toTraceFacts(event),
    rawPointer: toJsonValue(event.rawPointer),
    redactedExcerpt: toTraceExcerpt(event),
    contentHash: sha256(event.sourceEventKey),
    extractorVersion: EVIDENCE_EXTRACTOR_VERSION,
  }
}

function toTraceEventKind(
  event: ParsedTraceEvent,
): "USER_MESSAGE" | "ASSISTANT_MESSAGE" | "TOOL_EXECUTION" | "SYSTEM" {
  switch (event.kind) {
    case "user_message":
      return "USER_MESSAGE"
    case "assistant_message":
      return "ASSISTANT_MESSAGE"
    case "tool_call":
    case "tool_result":
      return "TOOL_EXECUTION"
    case "system":
      return "SYSTEM"
    default:
      return "SYSTEM"
  }
}

function toTraceFacts(event: ParsedTraceEvent): Prisma.InputJsonObject {
  switch (event.kind) {
    case "tool_call":
      return { kind: event.kind, arguments: toJsonValue(event.arguments) }
    case "tool_result":
      return {
        kind: event.kind,
        result: toJsonValue({
          exitCode: event.result.exitCode,
          hasText: event.result.text !== undefined && event.result.text.length > 0,
          status: event.result.status,
        }),
      }
    default:
      return { kind: event.kind }
  }
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(sanitizeJsonValue(value ?? null))) as Prisma.InputJsonValue
}

function toJsonObject(value: unknown): Prisma.InputJsonObject {
  const parsed = toJsonValue(value)
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    return parsed as Prisma.InputJsonObject
  }
  return {}
}

function toTraceExcerpt(event: ParsedTraceEvent): string | null {
  switch (event.kind) {
    case "user_message":
    case "assistant_message":
    case "system":
      return truncateTraceExcerpt(event.text)
    case "tool_result":
      return null
    case "tool_call":
      return event.toolName
    default:
      return null
  }
}

function truncateTraceExcerpt(value: string): string {
  const sanitized = sanitizeText(value)
  return sanitized.length <= 2_000 ? sanitized : sanitized.slice(0, 2_000)
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function buildResumeCommand(template: string, session: ParsedSession): string {
  return template
    .replaceAll("{threadId}", session.threadId)
    .replaceAll("{quoted threadId}", shellQuote(session.threadId))
    .replaceAll("{cwd}", session.cwd ?? "")
    .replaceAll("{quoted cwd}", shellQuote(session.cwd ?? ""))
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`
}

function sanitizeNullableText(value: string | null): string | null {
  return value === null ? null : sanitizeText(value)
}

function sanitizeText(value: string): string {
  return value.replaceAll("\u0000", "")
}

function sanitizeJsonValue(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeText(value)
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeJsonValue)
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [sanitizeText(key), sanitizeJsonValue(entry)]),
    )
  }
  return value
}

function readImportTransactionTimeoutMs(): number {
  const { SCANNER_IMPORT_TRANSACTION_TIMEOUT_MS: raw } = process.env
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_SCANNER_IMPORT_TRANSACTION_TIMEOUT_MS
  }

  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_SCANNER_IMPORT_TRANSACTION_TIMEOUT_MS
  }

  return parsed
}
