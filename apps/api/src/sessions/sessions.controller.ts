import type { AgentSessionDetail } from "@agent-log-search/shared"
import { Bind, Controller, Get, Param } from "@nestjs/common"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { SessionsService } from "./sessions.service.js"

@Controller("sessions")
export class SessionsController {
  public constructor(private readonly sessions: SessionsService) {}

  @Get(":id")
  @Bind(Param("id"))
  public async get(id: string): Promise<AgentSessionDetail> {
    return this.sessions.get(id)
  }
}
