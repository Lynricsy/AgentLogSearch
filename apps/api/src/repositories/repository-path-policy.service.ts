import { realpath } from "node:fs/promises"
import path from "node:path"
import { Injectable } from "@nestjs/common"

@Injectable()
export class RepositoryPathPolicyService {
  public async resolveRepositoryPath(inputPath: string): Promise<string | null> {
    if (!path.isAbsolute(inputPath)) {
      return null
    }
    try {
      return await realpath(inputPath)
    } catch {
      return null
    }
  }
}
