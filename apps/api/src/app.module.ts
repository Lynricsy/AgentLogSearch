import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { ScheduleModule } from "@nestjs/schedule"
import { DatabaseModule } from "./database/database.module.js"
import { EmbeddingsModule } from "./embeddings/embeddings.module.js"
import { resolveEnvFilePath } from "./env-file-config.js"
import { validateEvidenceConfig } from "./evidence/evidence.config.js"
import { ExperienceSearchModule } from "./experience-search/experience-search.module.js"
import { validateExperienceConfig } from "./experiences/experience.config.js"
import { ExperiencesModule } from "./experiences/experiences.module.js"
import { HealthController } from "./health.controller.js"
import { ScanJobsModule } from "./scan-jobs/scan-jobs.module.js"
import { ScannerModule } from "./scanner/scanner.module.js"
import { SearchModule } from "./search/search.module.js"
import { SessionsModule } from "./sessions/sessions.module.js"
import { SourcesModule } from "./sources/sources.module.js"

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({
      envFilePath: resolveEnvFilePath(),
      isGlobal: true,
      validate: validateRuntimeConfig,
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    SourcesModule,
    ScanJobsModule,
    ScannerModule,
    ExperiencesModule,
    ExperienceSearchModule,
    EmbeddingsModule,
    SearchModule,
    SessionsModule,
  ],
})
export class AppModule {}

function validateRuntimeConfig(config: Record<string, unknown>): Record<string, unknown> {
  validateEvidenceConfig(config)
  validateExperienceConfig(config)
  return config
}
