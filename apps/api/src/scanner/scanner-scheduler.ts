import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common"
import { Injectable, Logger } from "@nestjs/common"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { ScannerService } from "./scanner.service.js"
import { ScannerConflictError } from "./scanner-errors.js"
import { readScannerSchedulerConfig } from "./scanner-scheduler-config.js"

@Injectable()
export class ScannerScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScannerScheduler.name)
  private interval: NodeJS.Timeout | null = null
  private tickRunning = false

  public constructor(private readonly scanner: ScannerService) {}

  public onModuleInit(): void {
    const config = readScannerSchedulerConfig()
    if (!config.enabled) {
      return
    }
    this.interval = setInterval(() => {
      void this.tick()
    }, config.intervalMs)
  }

  public onModuleDestroy(): void {
    if (this.interval !== null) {
      clearInterval(this.interval)
      this.interval = null
    }
  }

  private async tick(): Promise<void> {
    if (this.tickRunning) {
      return
    }
    this.tickRunning = true
    try {
      await this.scanner.runDue(new Date())
    } catch (error) {
      if (error instanceof ScannerConflictError) {
        this.logger.debug(error.message)
        return
      }
      this.logger.error("Scheduled scan failed", error instanceof Error ? error.stack : undefined)
    } finally {
      this.tickRunning = false
    }
  }
}
