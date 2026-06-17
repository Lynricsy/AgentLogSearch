import { Module } from "@nestjs/common"
import { DatabaseModule } from "../database/database.module.js"
import { SessionsController } from "./sessions.controller.js"
import { SessionsService } from "./sessions.service.js"

@Module({
  controllers: [SessionsController],
  imports: [DatabaseModule],
  providers: [SessionsService],
})
export class SessionsModule {}
