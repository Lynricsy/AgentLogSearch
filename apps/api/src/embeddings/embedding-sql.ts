import { Injectable } from "@nestjs/common"
import type { PoolClient, QueryResultRow } from "pg"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { PgService } from "../database/pg.service.js"
import type { EmbeddingVector } from "./embedding-provider.js"

export type ChunkForEmbedding = {
  readonly id: bigint
  readonly chunkText: string
}

type IdRow = QueryResultRow & {
  readonly id: string | bigint | number
}

type ChunkRow = QueryResultRow & {
  readonly id: string | bigint | number
  readonly chunk_text: string
}

type CountRow = QueryResultRow & {
  readonly count: string | number | bigint
}

@Injectable()
export class EmbeddingSqlStore {
  public constructor(private readonly pg: PgService) {}

  public async countProcessableChunks(sourceId: bigint | null): Promise<number> {
    const result = await this.pg.query<CountRow>(
      `
        SELECT COUNT(*) AS count
        FROM agent_chunk
        WHERE embedding_status IN ('pending', 'failed')
          AND ($1::bigint IS NULL OR source_id = $1::bigint)
      `,
      [sourceId],
    )
    return readCount(result.rows[0])
  }

  public async countRebuildableChunks(sourceId: bigint | null): Promise<number> {
    const result = await this.pg.query<CountRow>(
      `
        SELECT COUNT(*) AS count
        FROM agent_chunk
        WHERE embedding_status IN ('ready', 'failed')
          AND ($1::bigint IS NULL OR source_id = $1::bigint)
      `,
      [sourceId],
    )
    return readCount(result.rows[0])
  }

  public async resetChunksForRebuild(sourceId: bigint | null): Promise<number> {
    const result = await this.pg.query<IdRow>(
      `
        UPDATE agent_chunk
        SET embedding = NULL,
            embedding_model = NULL,
            embedding_status = 'pending',
            embedding_error = NULL,
            embedding_requested_at = NULL,
            embedding_ready_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE embedding_status IN ('ready', 'failed')
          AND ($1::bigint IS NULL OR source_id = $1::bigint)
        RETURNING id
      `,
      [sourceId],
    )
    return result.rowCount ?? 0
  }

  public async claimBatch(
    sourceId: bigint | null,
    batchSize: number,
  ): Promise<readonly ChunkForEmbedding[]> {
    return this.withTransaction(async (client) => {
      const result = await client.query<ChunkRow>(
        `
          SELECT id, chunk_text
          FROM agent_chunk
          WHERE embedding_status IN ('pending', 'failed')
            AND ($1::bigint IS NULL OR source_id = $1::bigint)
          ORDER BY id ASC
          LIMIT $2
          FOR UPDATE SKIP LOCKED
        `,
        [sourceId, batchSize],
      )
      const chunks = result.rows.map((row) => ({
        id: readId(row.id),
        chunkText: row.chunk_text,
      }))
      if (chunks.length === 0) {
        return []
      }
      await client.query(
        `
          UPDATE agent_chunk
          SET embedding_status = 'processing',
              embedding_error = NULL,
              embedding_requested_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ANY($1::bigint[])
        `,
        [chunks.map((chunk) => chunk.id.toString())],
      )
      return chunks
    })
  }

  public async markReady(chunkId: bigint, vector: EmbeddingVector, model: string): Promise<void> {
    await this.pg.query(
      `
        UPDATE agent_chunk
        SET embedding = $2::vector,
            embedding_model = $3,
            embedding_status = 'ready',
            embedding_error = NULL,
            embedding_ready_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `,
      [chunkId, vectorToSql(vector), model],
    )
  }

  public async markFailed(chunkId: bigint, error: string): Promise<void> {
    await this.pg.query(
      `
        UPDATE agent_chunk
        SET embedding_status = 'failed',
            embedding_error = $2,
            embedding_ready_at = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `,
      [chunkId, error],
    )
  }

  public async readDbVectorDimension(): Promise<number> {
    const result = await this.pg.query<CountRow>(
      `
        SELECT regexp_replace(format_type(atttypid, atttypmod), '[^0-9]', '', 'g')::int AS count
        FROM pg_attribute
        WHERE attrelid = 'agent_chunk'::regclass
          AND attname = 'embedding'
      `,
    )
    return readCount(result.rows[0])
  }

  private async withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pg.connect()
    try {
      await client.query("BEGIN")
      const result = await callback(client)
      await client.query("COMMIT")
      return result
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  }
}

function vectorToSql(vector: EmbeddingVector): string {
  return `[${vector.join(",")}]`
}

function readCount(row: CountRow | undefined): number {
  if (row === undefined) {
    return 0
  }
  const { count } = row
  if (typeof count === "bigint") {
    return Number(count)
  }
  if (typeof count === "number") {
    return count
  }
  return Number.parseInt(count, 10)
}

function readId(value: string | bigint | number): bigint {
  if (typeof value === "bigint") {
    return value
  }
  return BigInt(value)
}
