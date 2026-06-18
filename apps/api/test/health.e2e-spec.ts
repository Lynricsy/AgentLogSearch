import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { INestApplication } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { ENV_FILE_PATH_OVERRIDE_KEY } from "../src/env-file-config"

const ENV_FILE_ONLY_KEY = "CLISEARCH_HEALTH_E2E_ENV_FILE_VALUE"
const ENV_FILE_ONLY_VALUE = "loaded-from-test-env"

describe("GET /api/health", () => {
  let app: INestApplication | undefined
  let temporaryEnvDirectory: string | undefined
  let previousProcessEnvValue: string | undefined
  let previousEnvFilePathOverride: string | undefined

  beforeAll(async () => {
    // Given
    previousProcessEnvValue = process.env[ENV_FILE_ONLY_KEY]
    previousEnvFilePathOverride = process.env[ENV_FILE_PATH_OVERRIDE_KEY]
    delete process.env[ENV_FILE_ONLY_KEY]
    temporaryEnvDirectory = mkdtempSync(join(tmpdir(), "clisearch-health-e2e-"))
    const temporaryEnvPath = join(temporaryEnvDirectory, ".env")
    writeFileSync(temporaryEnvPath, `${ENV_FILE_ONLY_KEY}=${ENV_FILE_ONLY_VALUE}\n`, "utf8")
    process.env[ENV_FILE_PATH_OVERRIDE_KEY] = temporaryEnvPath

    const { AppModule } = await import("../src/app.module")
    const { configureApp } = await import("../src/bootstrap")
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleRef.createNestApplication()
    configureApp(app)
    await app.init()
  })

  afterAll(async () => {
    try {
      await app?.close()
    } finally {
      if (previousProcessEnvValue === undefined) {
        delete process.env[ENV_FILE_ONLY_KEY]
      } else {
        process.env[ENV_FILE_ONLY_KEY] = previousProcessEnvValue
      }
      if (previousEnvFilePathOverride === undefined) {
        delete process.env[ENV_FILE_PATH_OVERRIDE_KEY]
      } else {
        process.env[ENV_FILE_PATH_OVERRIDE_KEY] = previousEnvFilePathOverride
      }
      if (temporaryEnvDirectory !== undefined) {
        rmSync(temporaryEnvDirectory, { force: true, recursive: true })
      }
    }
  })

  it("returns an ok health payload when the API is running", async () => {
    // When
    const response = await request(getInitializedApp().getHttpServer()).get("/api/health")

    // Then
    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      status: "ok",
      service: "api",
    })
  })

  it("allows the local web origin for browser API requests", async () => {
    // When
    const response = await request(getInitializedApp().getHttpServer())
      .get("/api/health")
      .set("Origin", "http://127.0.0.1:3000")

    // Then
    expect(response.status).toBe(200)
    expect(response.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:3000")
  })

  it("loads runtime configuration from a test-specific env file", () => {
    // When
    const configService = getInitializedApp().get(ConfigService)

    // Then
    expect(configService.get<string>(ENV_FILE_ONLY_KEY)).toBe(ENV_FILE_ONLY_VALUE)
  })

  function getInitializedApp(): INestApplication {
    if (app === undefined) {
      throw new Error("Nest application was not initialized")
    }
    return app
  }
})

describe("API host binding", () => {
  it("defaults to loopback when API_HOST is unset or blank", async () => {
    // Given
    const { resolveApiHost } = await import("../src/main")
    const blankHost = "  "

    // When
    const missingHost = resolveApiHost(undefined)
    const trimmedBlankHost = resolveApiHost(blankHost)

    // Then
    expect(missingHost).toBe("127.0.0.1")
    expect(trimmedBlankHost).toBe("127.0.0.1")
  })

  it("uses an explicit API_HOST after trimming surrounding space", async () => {
    // Given
    const { resolveApiHost } = await import("../src/main")
    const configuredHost = " localhost "

    // When
    const host = resolveApiHost(configuredHost)

    // Then
    expect(host).toBe("localhost")
  })
})
