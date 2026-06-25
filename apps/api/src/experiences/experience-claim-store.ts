import { Injectable } from "@nestjs/common"
import type { QueryResultRow } from "pg"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { PgService } from "../database/pg.service.js"
import {
  EXPERIENCE_BUILDER_VERSION,
  EXPERIENCE_SEARCH_DOCUMENT_VERSION,
} from "../pipeline-versions.js"

export type ClaimedExperienceSession = {
  readonly id: bigint
  readonly traceRevision: number
}

type ClaimRow = QueryResultRow & {
  readonly id: string | number | bigint
  readonly trace_revision: string | number | bigint
}

type CountRow = QueryResultRow & {
  readonly count: string | number | bigint
}

@Injectable()
export class ExperienceClaimStore {
  public constructor(private readonly pg: PgService) {}

  public async claimBatch(batchSize: number): Promise<readonly ClaimedExperienceSession[]> {
    const result = await this.pg.query<ClaimRow>(
      `
        WITH candidate AS (
          SELECT id
          FROM agent_session
          WHERE experience_build_status IN ('PENDING', 'FAILED')
             OR (
               experience_build_status = 'READY'
               AND (
                 experience_builder_version IS DISTINCT FROM $2
                 OR EXISTS (
                   SELECT 1
                   FROM agent_experience e
                   WHERE e.session_id = agent_session.id
                     AND e.search_document_version IS DISTINCT FROM $3
                 )
               )
             )
          ORDER BY
            CASE WHEN experience_build_status IN ('PENDING', 'FAILED') THEN 0 ELSE 1 END,
            experience_requested_at NULLS FIRST,
            id
          FOR UPDATE SKIP LOCKED
          LIMIT $1
        )
        UPDATE agent_session s
        SET experience_build_status = 'PROCESSING',
            experience_processing_at = CURRENT_TIMESTAMP,
            experience_build_error = NULL
        FROM candidate c
        WHERE s.id = c.id
        RETURNING s.id, s.trace_revision
      `,
      [batchSize, EXPERIENCE_BUILDER_VERSION, EXPERIENCE_SEARCH_DOCUMENT_VERSION],
    )
    return result.rows.map((row) => ({
      id: readBigInt(row.id),
      traceRevision: Number(row.trace_revision),
    }))
  }

  public async resetStaleProcessing(olderThanMs: number): Promise<number> {
    const result = await this.pg.query<CountRow>(
      `
        UPDATE agent_session
        SET experience_build_status = 'PENDING',
            experience_processing_at = NULL
        WHERE experience_build_status = 'PROCESSING'
          AND experience_processing_at < CURRENT_TIMESTAMP - ($1::int * INTERVAL '1 millisecond')
      `,
      [olderThanMs],
    )
    return result.rowCount ?? 0
  }

  public async countProcessable(): Promise<number> {
    const result = await this.pg.query<CountRow>(
      `
        SELECT COUNT(*) AS count
        FROM agent_session
        WHERE experience_build_status IN ('PENDING', 'FAILED')
           OR (
             experience_build_status = 'READY'
             AND (
               experience_builder_version IS DISTINCT FROM $1
               OR EXISTS (
                 SELECT 1
                 FROM agent_experience e
                 WHERE e.session_id = agent_session.id
                   AND e.search_document_version IS DISTINCT FROM $2
               )
             )
           )
      `,
      [EXPERIENCE_BUILDER_VERSION, EXPERIENCE_SEARCH_DOCUMENT_VERSION],
    )
    return readCount(result.rows[0])
  }
}

function readBigInt(value: string | number | bigint): bigint {
  return typeof value === "bigint" ? value : BigInt(value)
}

function readCount(row: CountRow | undefined): number {
  if (row === undefined) return 0
  const { count } = row
  return typeof count === "number" ? count : Number(count)
}
