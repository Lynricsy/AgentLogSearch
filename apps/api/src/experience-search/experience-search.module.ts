import { Module } from "@nestjs/common"
import { DatabaseModule } from "../database/database.module.js"
import { RepositoriesModule } from "../repositories/repositories.module.js"
import { ExperienceSearchController } from "./experience-search.controller.js"
import { ExperienceSearchService } from "./experience-search.service.js"
import { FailedAttemptSearchService } from "./failed-attempt-search.service.js"

@Module({
  controllers: [ExperienceSearchController],
  imports: [DatabaseModule, RepositoriesModule],
  providers: [ExperienceSearchService, FailedAttemptSearchService],
})
export class ExperienceSearchModule {}
