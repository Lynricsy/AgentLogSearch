import { Injectable } from "@nestjs/common"
import type { QueryResultRow } from "pg"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { PgService } from "../database/pg.service.js"

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
          ORDER BY experience_requested_at NULLS FIRST, id
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
      [batchSize],
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
      `,
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
