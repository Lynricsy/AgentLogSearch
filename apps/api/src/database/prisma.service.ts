import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common"
import { Injectable } from "@nestjs/common"
import { PrismaClient } from "@prisma/client"
import { getDatabaseUrl } from "./database-url.js"

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  public constructor() {
    super({
      datasourceUrl: getDatabaseUrl(),
    })
  }

  public async onModuleInit(): Promise<void> {
    await this.$connect()
  }

  public async onModuleDestroy(): Promise<void> {
    await this.$disconnect()
  }
}
