import { Module } from "@nestjs/common"
import { DatabaseModule } from "../database/database.module.js"
import { PathPolicyService } from "./path-policy.service.js"
import { SourcesController } from "./sources.controller.js"
import { SourcesService } from "./sources.service.js"

@Module({
  controllers: [SourcesController],
  imports: [DatabaseModule],
  providers: [PathPolicyService, SourcesService],
  exports: [SourcesService],
})
export class SourcesModule {}
