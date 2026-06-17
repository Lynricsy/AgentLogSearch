import { Injectable } from "@nestjs/common"
import { EmbeddingStatus, type Prisma } from "@prisma/client"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { PrismaService } from "../database/prisma.service.js"
import type { ParsedMessage, ParsedSession } from "../parsers/index.js"
import type { FileImportInput, FileImportStats, SourceConfig } from "./scanner.types.js"
import { toNullableDate } from "./scanner-utils.js"

type ImportClient = Prisma.TransactionClient | PrismaService

@Injectable()
export class ScannerImporter {
  public constructor(private readonly prisma: PrismaService) {}

  public async importFile(input: FileImportInput): Promise<FileImportStats> {
    return this.prisma.$transaction((tx) => importFileWithClient(tx, input))
  }
}

async function importFileWithClient(
  tx: ImportClient,
  input: FileImportInput,
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
    },
    update: {
      fileHash: input.fingerprint.hash,
      fileSize: input.fingerprint.fileSize,
      modifiedAt: input.fingerprint.modifiedAt,
      lastScannedAt: input.scannedAt,
      parseStatus: "processing",
      errorMessage: null,
    },
  })

  const stats = await importSessions(tx, input, history.id)
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
): Promise<FileImportStats> {
  let messagesImported = 0
  let chunksCreated = 0
  for (const session of input.sessions) {
    const record = await tx.agentSession.upsert({
      where: {
        sourceId_externalThreadId: {
          sourceId: input.source.id,
          externalThreadId: session.threadId,
        },
      },
      create: toSessionCreate(input.source, historyFileId, session),
      update: toSessionUpdate(input.source, historyFileId, session),
    })
    await replaceSessionRows(tx, input.source, record.id, session)
    messagesImported += session.messages.length
    chunksCreated += session.messages.length > 0 ? 1 : 0
  }
  return { sessionsImported: input.sessions.length, messagesImported, chunksCreated }
}

async function replaceSessionRows(
  tx: ImportClient,
  source: SourceConfig,
  sessionId: bigint,
  session: ParsedSession,
): Promise<void> {
  await tx.agentChunk.deleteMany({ where: { sessionId } })
  await tx.agentMessage.deleteMany({ where: { sessionId } })
  await tx.agentMessage.createMany({
    data: session.messages.map((message) => toMessageCreate(sessionId, message)),
  })
  if (session.messages.length > 0) {
    await tx.agentChunk.create({
      data: toChunkCreate(source, sessionId, session),
    })
  }
}

function toSessionCreate(source: SourceConfig, historyFileId: bigint, session: ParsedSession) {
  return {
    sourceId: source.id,
    historyFileId,
    agentName: source.sourcePreset,
    externalThreadId: session.threadId,
    title: session.title,
    cwd: session.cwd,
    modelName: session.model,
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
    title: session.title,
    cwd: session.cwd,
    modelName: session.model,
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
    content: message.content,
    model: message.model,
    createdAt: toNullableDate(message.createdAt),
  }
}

function toChunkCreate(source: SourceConfig, sessionId: bigint, session: ParsedSession) {
  const first = session.messages[0]
  const last = session.messages[session.messages.length - 1]
  return {
    sessionId,
    sourceId: source.id,
    chunkIndex: 0,
    startMessageSeq: first?.sequence ?? null,
    endMessageSeq: last?.sequence ?? null,
    agentName: source.sourcePreset,
    externalThreadId: session.threadId,
    cwd: session.cwd,
    chunkText: session.messages.map((message) => message.content).join("\n\n"),
    embeddingStatus: EmbeddingStatus.pending,
  }
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
