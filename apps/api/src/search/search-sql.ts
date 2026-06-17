import { Injectable } from "@nestjs/common"
import type { QueryResultRow } from "pg"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { PgService } from "../database/pg.service.js"
import type { EmbeddingVector } from "../embeddings/embedding-provider.js"
import type { SemanticSearchChunkHit } from "./search-records.js"

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
  readonly agent_name: string
  readonly cwd: string | null
  readonly thread_id: string
  readonly title: string | null
  readonly resume_command: string | null
  readonly message_count: number
  readonly last_message_at: Date | string | null
}

@Injectable()
export class SearchSqlStore {
  public constructor(private readonly pg: PgService) {}

  public async searchChunks(
    input: SemanticSearchSqlInput,
  ): Promise<readonly SemanticSearchChunkHit[]> {
    const result = await this.pg.query<SearchHitRow>(
      `
        SELECT
          s.id::text AS session_id,
          c.id::text AS chunk_id,
          (1 - (c.embedding <=> $1::vector))::float8 AS score,
          c.chunk_text AS snippet,
          s.agent_name,
          s.cwd,
          s.external_thread_id AS thread_id,
          s.title,
          s.resume_command,
          s.message_count,
          s.last_message_at
        FROM agent_chunk c
        JOIN agent_session s ON s.id = c.session_id
        WHERE c.embedding_status = 'ready'
          AND c.embedding IS NOT NULL
          AND ($3::text IS NULL OR c.agent_name = $3::text)
          AND ($4::text IS NULL OR c.cwd ILIKE '%' || $4::text || '%')
        ORDER BY c.embedding <=> $1::vector ASC, c.id ASC
        LIMIT $2
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
    messageCount: row.message_count,
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
  return value instanceof Date ? value.toISOString() : value
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, value))
}
