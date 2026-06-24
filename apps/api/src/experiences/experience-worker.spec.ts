import type { ExperienceConfig } from "./experience.config.js"
import type { ExperienceClaimStore } from "./experience-claim-store.js"
import {
  type ExperiencePersistenceService,
  ExperienceRevisionChangedError,
} from "./experience-persistence.service.js"
import { ExperienceWorker } from "./experience-worker.js"

describe("ExperienceWorker", () => {
  it("claims sessions and persists built experiences", async () => {
    const claims = createClaims([{ id: 1n, traceRevision: 2 }])
    const persistence = createPersistence()
    const worker = new ExperienceWorker(claims, persistence, workerConfig())

    await worker.tick()

    expect(claims.resetStaleProcessing).toHaveBeenCalledWith(60_000)
    expect(claims.claimBatch).toHaveBeenCalledWith(8)
    expect(persistence.buildAndPersistSession).toHaveBeenCalledWith(1n, 2)
    expect(persistence.markFailed).not.toHaveBeenCalled()
  })

  it("marks session failed when build throws a normal error", async () => {
    const claims = createClaims([{ id: 2n, traceRevision: 3 }])
    const error = new Error("builder failed")
    const persistence = createPersistence()
    persistence.buildAndPersistSession.mockRejectedValue(error)
    const worker = new ExperienceWorker(claims, persistence, workerConfig())

    await worker.tick()

    expect(persistence.markFailed).toHaveBeenCalledWith(2n, error)
  })

  it("does not mark failed when revision changed", async () => {
    const claims = createClaims([{ id: 3n, traceRevision: 4 }])
    const persistence = createPersistence()
    persistence.buildAndPersistSession.mockRejectedValue(
      new ExperienceRevisionChangedError("changed"),
    )
    const worker = new ExperienceWorker(claims, persistence, workerConfig())

    await worker.tick()

    expect(persistence.markFailed).not.toHaveBeenCalled()
  })
})

function workerConfig(): ExperienceConfig {
  return {
    workerEnabled: true,
    searchEnabled: false,
    workerIntervalMs: 1_000,
    workerBatchSize: 8,
    workerStaleProcessingMs: 60_000,
  }
}

function createClaims(
  sessions: readonly { readonly id: bigint; readonly traceRevision: number }[],
): jest.Mocked<ExperienceClaimStore> {
  return {
    claimBatch: jest.fn().mockResolvedValue(sessions),
    countProcessable: jest.fn().mockResolvedValue(sessions.length),
    resetStaleProcessing: jest.fn().mockResolvedValue(0),
  } as unknown as jest.Mocked<ExperienceClaimStore>
}

function createPersistence(): jest.Mocked<ExperiencePersistenceService> {
  return {
    buildAndPersistSession: jest.fn().mockResolvedValue(1),
    markFailed: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<ExperiencePersistenceService>
}
