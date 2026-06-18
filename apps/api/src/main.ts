import "reflect-metadata"
import { NestFactory } from "@nestjs/core"
import { AppModule } from "./app.module.js"
import { configureApp } from "./bootstrap.js"

const DEFAULT_API_HOST = "127.0.0.1"

export function resolveApiHost(value: string | undefined): string {
  return value?.trim() || DEFAULT_API_HOST
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)
  configureApp(app)

  const { API_HOST, API_PORT } = process.env
  const port = Number(API_PORT ?? "3001")
  await app.listen(port, resolveApiHost(API_HOST))
}

const { NODE_ENV } = process.env

if (NODE_ENV !== "test") {
  void bootstrap()
}
