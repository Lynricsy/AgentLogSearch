import { Injectable } from "@nestjs/common"
import type { QueryResultRow } from "pg"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { PgService } from "../database/pg.service.js"
import type { EmbeddingVector } from "../embeddings/embedding-provider.js"
import type { SemanticSearchChunkHit, SemanticSearchHitMessage } from "./search-records.js"

export type SemanticSearchSqlInput = {
  readonly agentName?: string
  readonly cwdKeyword?: string
  readonly queryVector: EmbeddingVector
  readonly topK: number
}

type SearchHitRow = QueryResultRow & {
  readonly session_id: string
  readonly chunk_id: string
  readonly score: number
  readonly snippet: string
  readonly start_message_seq: number | null
  readonly end_message_seq: number | null
  readonly agent_name: string
  readonly cwd: string | null
  readonly thread_id: string
  readonly title: string | null
  readonly resume_command: string | null
  readonly message_count: number
  readonly last_message_at: Date | string | null
  readonly messages: unknown
}

@Injectable()
export class SearchSqlStore {
  public constructor(private readonly pg: PgService) {}

  public async searchChunks(
    input: SemanticSearchSqlInput,
  ): Promise<readonly SemanticSearchChunkHit[]> {
    const result = await this.pg.query<SearchHitRow>(
      `
        WITH ranked_chunks AS (
          SELECT
            c.id,
            c.session_id,
            c.chunk_text,
            c.start_message_seq,
            c.end_message_seq,
            c.embedding,
            (1 - (c.embedding <=> $1::vector))::float8 AS score
          FROM agent_chunk c
          WHERE c.embedding_status = 'ready'
            AND c.embedding IS NOT NULL
            AND ($3::text IS NULL OR c.agent_name = $3::text)
            AND ($4::text IS NULL OR c.cwd ILIKE '%' || $4::text || '%')
          ORDER BY c.embedding <=> $1::vector ASC, c.id ASC
          LIMIT $2
        )
        SELECT
          s.id::text AS session_id,
          rc.id::text AS chunk_id,
          rc.score,
          rc.chunk_text AS snippet,
          rc.start_message_seq,
          rc.end_message_seq,
          s.agent_name,
          s.cwd,
          s.external_thread_id AS thread_id,
          s.title,
          s.resume_command,
          s.message_count,
          s.last_message_at,
          COALESCE(
            json_agg(
              json_build_object(
                'id', m.id::text,
                'seqNo', m.seq_no,
                'role', m.role::text,
                'content', m.content,
                'model', m.model,
                'createdAt', m.created_at
              )
              ORDER BY m.seq_no ASC
            ) FILTER (WHERE m.id IS NOT NULL),
            '[]'::json
          ) AS messages
        FROM ranked_chunks rc
        JOIN agent_session s ON s.id = rc.session_id
        LEFT JOIN agent_message m
          ON m.session_id = rc.session_id
          AND rc.start_message_seq IS NOT NULL
          AND rc.end_message_seq IS NOT NULL
          AND m.seq_no BETWEEN rc.start_message_seq AND rc.end_message_seq
        GROUP BY
          rc.id,
          rc.embedding,
          rc.score,
          rc.chunk_text,
          rc.start_message_seq,
          rc.end_message_seq,
          s.id,
          s.agent_name,
          s.cwd,
          s.external_thread_id,
          s.title,
          s.resume_command,
          s.message_count,
          s.last_message_at
        ORDER BY rc.embedding <=> $1::vector ASC, rc.id ASC
      `,
      [
        vectorToSql(input.queryVector),
        input.topK,
        input.agentName ?? null,
        input.cwdKeyword ?? null,
      ],
    )
    return result.rows.map(toChunkHit)
  }
}

function toChunkHit(row: SearchHitRow): SemanticSearchChunkHit {
  return {
    agentName: row.agent_name,
    chunkId: row.chunk_id,
    cwd: row.cwd,
    lastMessageAt: toNullableIso(row.last_message_at),
    messageEndSequence: row.end_message_seq,
    messageCount: row.message_count,
    messages: readMessages(row.messages),
    messageStartSequence: row.start_message_seq,
    resumeCommand: row.resume_command ?? "",
    score: clampScore(row.score),
    sessionId: row.session_id,
    snippet: row.snippet,
    threadId: row.thread_id,
    title: row.title,
  }
}

function vectorToSql(vector: EmbeddingVector): string {
  return `[${vector.join(",")}]`
}

function toNullableIso(value: Date | string | null): string | null {
  if (value === null) {
    return null
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? value : new Date(timestamp).toISOString()
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function readMessages(value: unknown): readonly SemanticSearchHitMessage[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return []
    }
    const id = readString(entry, "id")
    const seqNo = readNumber(entry, "seqNo")
    const role = readRole(entry, "role")
    const content = readString(entry, "content")
    if (id === null || seqNo === null || role === null || content === null) {
      return []
    }
    return [
      {
        content,
        createdAt: toNullableIso(readNullableDateValue(entry, "createdAt")),
        id,
        model: readNullableString(entry, "model"),
        role,
        seqNo,
      },
    ]
  })
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readString(record: Readonly<Record<string, unknown>>, field: string): string | null {
  const value = record[field]
  return typeof value === "string" ? value : null
}

function readNullableString(
  record: Readonly<Record<string, unknown>>,
  field: string,
): string | null {
  const value = record[field]
  return typeof value === "string" ? value : null
}

function readNumber(record: Readonly<Record<string, unknown>>, field: string): number | null {
  const value = record[field]
  return typeof value === "number" && Number.isInteger(value) ? value : null
}

function readRole(
  record: Readonly<Record<string, unknown>>,
  field: string,
): SemanticSearchHitMessage["role"] | null {
  const value = readString(record, field)
  if (
    value === "assistant" ||
    value === "system" ||
    value === "tool" ||
    value === "unknown" ||
    value === "user"
  ) {
    return value
  }
  return null
}

function readNullableDateValue(
  record: Readonly<Record<string, unknown>>,
  field: string,
): Date | string | null {
  const value = record[field]
  if (value === null || value instanceof Date || typeof value === "string") {
    return value
  }
  return null
}
