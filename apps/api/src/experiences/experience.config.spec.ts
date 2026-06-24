import {
  DEFAULT_EXPERIENCE_WORKER_BATCH_SIZE,
  DEFAULT_EXPERIENCE_WORKER_INTERVAL_MS,
  DEFAULT_EXPERIENCE_WORKER_STALE_PROCESSING_MS,
  ExperienceConfigError,
  readExperienceConfig,
} from "./experience.config.js"

describe("readExperienceConfig", () => {
  it("defaults experience search and worker switches to disabled", () => {
    expect(readExperienceConfig({ NODE_ENV: "production" })).toEqual({
      workerEnabled: false,
      searchEnabled: false,
      workerIntervalMs: DEFAULT_EXPERIENCE_WORKER_INTERVAL_MS,
      workerBatchSize: DEFAULT_EXPERIENCE_WORKER_BATCH_SIZE,
      workerStaleProcessingMs: DEFAULT_EXPERIENCE_WORKER_STALE_PROCESSING_MS,
    })
  })

  it("parses explicit worker and search overrides", () => {
    expect(
      readExperienceConfig({
        EXPERIENCE_SEARCH_ENABLED: "on",
        EXPERIENCE_WORKER_BATCH_SIZE: "16",
        EXPERIENCE_WORKER_ENABLED: "yes",
        EXPERIENCE_WORKER_INTERVAL_MS: "5000",
        EXPERIENCE_WORKER_STALE_PROCESSING_MS: "120000",
        NODE_ENV: "test",
      }),
    ).toEqual({
      workerEnabled: true,
      searchEnabled: true,
      workerIntervalMs: 5_000,
      workerBatchSize: 16,
      workerStaleProcessingMs: 120_000,
    })
  })

  it("fails fast for invalid boolean values", () => {
    expect(() => readExperienceConfig({ EXPERIENCE_SEARCH_ENABLED: "sometimes" })).toThrow(
      ExperienceConfigError,
    )
  })

  it("fails fast for numeric values outside the supported bounds", () => {
    expect(() => readExperienceConfig({ EXPERIENCE_WORKER_BATCH_SIZE: "0" })).toThrow(
      ExperienceConfigError,
    )
    expect(() => readExperienceConfig({ EXPERIENCE_WORKER_INTERVAL_MS: "fast" })).toThrow(
      ExperienceConfigError,
    )
  })
})
