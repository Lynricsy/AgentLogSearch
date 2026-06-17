import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { AppModule } from "../src/app.module"
import { configureApp } from "../src/bootstrap"
import { resolveApiHost } from "../src/main"

describe("GET /api/health", () => {
  let app: INestApplication

  beforeAll(async () => {
    // Given
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleRef.createNestApplication()
    configureApp(app)
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it("returns an ok health payload when the API is running", async () => {
    // When
    const response = await request(app.getHttpServer()).get("/api/health")

    // Then
    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      status: "ok",
      service: "api",
    })
  })

  it("allows the local web origin for browser API requests", async () => {
    // When
    const response = await request(app.getHttpServer())
      .get("/api/health")
      .set("Origin", "http://127.0.0.1:3000")

    // Then
    expect(response.status).toBe(200)
    expect(response.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:3000")
  })
})

describe("API host binding", () => {
  it("defaults to loopback when API_HOST is unset or blank", () => {
    // Given
    const blankHost = "  "

    // When
    const missingHost = resolveApiHost(undefined)
    const trimmedBlankHost = resolveApiHost(blankHost)

    // Then
    expect(missingHost).toBe("127.0.0.1")
    expect(trimmedBlankHost).toBe("127.0.0.1")
  })

  it("uses an explicit API_HOST after trimming surrounding space", () => {
    // Given
    const configuredHost = " localhost "

    // When
    const host = resolveApiHost(configuredHost)

    // Then
    expect(host).toBe("localhost")
  })
})
