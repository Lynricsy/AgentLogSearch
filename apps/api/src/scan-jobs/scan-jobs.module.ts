import { Module } from "@nestjs/common"
import { DatabaseModule } from "../database/database.module.js"
import { HistoryFilesService } from "./history-files.service.js"
import { ScanJobsController } from "./scan-jobs.controller.js"
import { ScanJobsService } from "./scan-jobs.service.js"

@Module({
  controllers: [ScanJobsController],
  exports: [HistoryFilesService, ScanJobsService],
  imports: [DatabaseModule],
  providers: [HistoryFilesService, ScanJobsService],
})
export class ScanJobsModule {}
