import "reflect-metadata"
import { NestFactory } from "@nestjs/core"
import { AppModule } from "./app.module.js"
import { configureApp } from "./bootstrap.js"

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)
  configureApp(app)

  const { API_PORT } = process.env
  const port = Number(API_PORT ?? "3001")
  await app.listen(port)
}

void bootstrap()
