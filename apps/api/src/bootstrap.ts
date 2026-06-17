import type { INestApplication } from "@nestjs/common"

const WEB_APP_ORIGINS = ["http://127.0.0.1:3000", "http://localhost:3000"] as const

export function configureApp(app: INestApplication): void {
  app.enableCors({
    origin: [...WEB_APP_ORIGINS],
  })
  app.setGlobalPrefix("api")
}
