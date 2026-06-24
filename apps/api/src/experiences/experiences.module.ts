import { Module } from "@nestjs/common"
import { DatabaseModule } from "../database/database.module.js"
import { RepositoriesModule } from "../repositories/repositories.module.js"
import { readExperienceConfig } from "./experience.config.js"
import { ExperienceClaimStore } from "./experience-claim-store.js"
import { ExperiencePersistenceService } from "./experience-persistence.service.js"
import { ExperienceWorker } from "./experience-worker.js"

@Module({
  imports: [DatabaseModule, RepositoriesModule],
  providers: [
    ExperienceClaimStore,
    ExperiencePersistenceService,
    {
      provide: ExperienceWorker,
      useFactory: (claims: ExperienceClaimStore, persistence: ExperiencePersistenceService) =>
        new ExperienceWorker(claims, persistence, readExperienceConfig()),
      inject: [ExperienceClaimStore, ExperiencePersistenceService],
    },
  ],
})
export class ExperiencesModule {}
