import { Module } from "@nestjs/common"
import { ScheduleModule } from "@nestjs/schedule"
import { DatabaseModule } from "./database/database.module.js"
import { EmbeddingsModule } from "./embeddings/embeddings.module.js"
import { HealthController } from "./health.controller.js"
import { ScanJobsModule } from "./scan-jobs/scan-jobs.module.js"
import { ScannerModule } from "./scanner/scanner.module.js"
import { SearchModule } from "./search/search.module.js"
import { SessionsModule } from "./sessions/sessions.module.js"
import { SourcesModule } from "./sources/sources.module.js"

@Module({
  controllers: [HealthController],
  imports: [
    ScheduleModule.forRoot(),
    DatabaseModule,
    SourcesModule,
    ScanJobsModule,
    ScannerModule,
    EmbeddingsModule,
    SearchModule,
    SessionsModule,
  ],
})
export class AppModule {}
