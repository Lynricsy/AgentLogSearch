import { Controller, Get } from "@nestjs/common"

const HEALTH_PAYLOAD = {
  status: "ok",
  service: "api",
} as const

@Controller("health")
export class HealthController {
  @Get()
  public getHealth(): Record<string, string> {
    return HEALTH_PAYLOAD
  }
}
