import type { INestApplication } from "@nestjs/common"
import { Test } from "@nestjs/testing"
import request from "supertest"
import { AppModule } from "../src/app.module"
import { configureApp } from "../src/bootstrap"

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
})
