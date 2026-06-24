import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common"
import { Injectable, Logger } from "@nestjs/common"
import { type ExperienceConfig, readExperienceConfig } from "./experience.config.js"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { ExperienceClaimStore } from "./experience-claim-store.js"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import {
  ExperiencePersistenceService,
  ExperienceRevisionChangedError,
} from "./experience-persistence.service.js"

@Injectable()
export class ExperienceWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExperienceWorker.name)
  private interval: NodeJS.Timeout | null = null
  private tickRunning = false

  public constructor(
    private readonly claims: ExperienceClaimStore,
    private readonly persistence: ExperiencePersistenceService,
    private readonly config: ExperienceConfig = readExperienceConfig(),
  ) {}

  public onModuleInit(): void {
    if (!this.config.workerEnabled) {
      return
    }
    this.interval = setInterval(() => {
      void this.tick()
    }, this.config.workerIntervalMs)
    void this.tick()
  }

  public onModuleDestroy(): void {
    if (this.interval !== null) {
      clearInterval(this.interval)
      this.interval = null
    }
  }

  public async tick(): Promise<void> {
    if (this.tickRunning) {
      return
    }
    this.tickRunning = true
    try {
      const resetCount = await this.claims.resetStaleProcessing(this.config.workerStaleProcessingMs)
      if (resetCount > 0) {
        this.logger.warn(`Reset ${resetCount.toString()} stale experience builds`)
      }
      const claimed = await this.claims.claimBatch(this.config.workerBatchSize)
      for (const session of claimed) {
        try {
          await this.persistence.buildAndPersistSession(session.id, session.traceRevision)
        } catch (error) {
          if (error instanceof ExperienceRevisionChangedError) {
            this.logger.debug(error.message)
            continue
          }
          await this.persistence.markFailed(session.id, error)
        }
      }
    } catch (error) {
      this.logger.error(
        "Scheduled experience build failed",
        error instanceof Error ? error.stack : undefined,
      )
    } finally {
      this.tickRunning = false
    }
  }
}
