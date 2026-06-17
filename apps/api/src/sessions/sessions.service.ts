import type { AgentSessionDetail } from "@agent-log-search/shared"
import { Injectable, NotFoundException } from "@nestjs/common"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { PrismaService } from "../database/prisma.service.js"
import { toSessionDetail } from "./session-records.js"

@Injectable()
export class SessionsService {
  public constructor(private readonly prisma: PrismaService) {}

  public async get(id: string): Promise<AgentSessionDetail> {
    const sessionId = parseSessionId(id)
    const record = await this.prisma.agentSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: {
          orderBy: { seqNo: "asc" },
        },
      },
    })
    if (record === null) {
      throwSessionNotFound()
    }
    return toSessionDetail(record)
  }
}

function parseSessionId(id: string): bigint {
  if (!/^[1-9]\d*$/.test(id)) {
    throwSessionNotFound()
  }
  return BigInt(id)
}

function throwSessionNotFound(): never {
  throw new NotFoundException({
    error: {
      code: "session_not_found",
      message: "Session not found",
    },
  })
}
