import { Module } from "@nestjs/common"
import { DatabaseModule } from "../database/database.module.js"
import { ParserRegistry } from "../parsers/index.js"
import { ScanController } from "./scan.controller.js"
import { ScannerService } from "./scanner.service.js"
import { ScannerFileRunner } from "./scanner-file-runner.js"
import { ScannerImporter } from "./scanner-importer.js"
import { ScannerJobStore } from "./scanner-job-store.js"
import { ScannerSourceStore } from "./scanner-source-store.js"
import { SourceReaderRegistry } from "./source-reader-registry.js"

@Module({
  controllers: [ScanController],
  exports: [ScannerService],
  imports: [DatabaseModule],
  providers: [
    ScannerFileRunner,
    ScannerImporter,
    ScannerJobStore,
    ScannerService,
    ScannerSourceStore,
    {
      provide: ParserRegistry,
      useFactory: () => ParserRegistry.createDefault(),
    },
    {
      provide: SourceReaderRegistry,
      useFactory: () => SourceReaderRegistry.createDefault(),
    },
  ],
})
export class ScannerModule {}
