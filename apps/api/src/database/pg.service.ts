import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common"
import { Injectable } from "@nestjs/common"
import type { PoolClient, QueryResult, QueryResultRow } from "pg"
import { Pool } from "pg"
import { getDatabaseUrl } from "./database-url.js"

@Injectable()
export class PgService implements OnModuleInit, OnModuleDestroy {
  private readonly pool: Pool

  public constructor() {
    this.pool = new Pool({
      connectionString: getDatabaseUrl(),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    })
  }

  public async onModuleInit(): Promise<void> {
    const client = await this.pool.connect()
    client.release()
  }

  public async onModuleDestroy(): Promise<void> {
    await this.pool.end()
  }

  public async query<T extends QueryResultRow = QueryResultRow>(
    queryText: string,
    values?: unknown[],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(queryText, values)
  }

  public async connect(): Promise<PoolClient> {
    return this.pool.connect()
  }
}
