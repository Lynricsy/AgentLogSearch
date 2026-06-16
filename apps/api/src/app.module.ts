import { Module } from "@nestjs/common"
import { ScheduleModule } from "@nestjs/schedule"
import { DatabaseModule } from "./database/database.module.js"
import { HealthController } from "./health.controller.js"

@Module({
  controllers: [HealthController],
  imports: [ScheduleModule.forRoot(), DatabaseModule],
})
export class AppModule {}
