import { Module } from "@nestjs/common"
import { ScheduleModule } from "@nestjs/schedule"
import { DatabaseModule } from "./database/database.module.js"
import { HealthController } from "./health.controller.js"
import { SourcesModule } from "./sources/sources.module.js"

@Module({
  controllers: [HealthController],
  imports: [ScheduleModule.forRoot(), DatabaseModule, SourcesModule],
})
export class AppModule {}
