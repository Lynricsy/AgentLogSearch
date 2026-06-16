import { Module } from "@nestjs/common"
import { PgService } from "./pg.service.js"
import { PrismaService } from "./prisma.service.js"

@Module({
  providers: [PgService, PrismaService],
  exports: [PgService, PrismaService],
})
export class DatabaseModule {}
