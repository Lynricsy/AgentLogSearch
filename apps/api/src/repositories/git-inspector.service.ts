import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { promisify } from "node:util"
import { Injectable } from "@nestjs/common"

const execFileAsync = promisify(execFile)
const GIT_TIMEOUT_MS = 5_000
const MAX_BUFFER_BYTES = 1024 * 1024

const ALLOWED_GIT_COMMANDS = new Set(["cat-file", "diff", "remote", "rev-parse", "status"])

@Injectable()
export class GitInspectorService {
  public async git(cwd: string, args: readonly string[]): Promise<string | null> {
    const [command] = args
    if (command === undefined || !ALLOWED_GIT_COMMANDS.has(command)) {
      throw new GitCommandRejectedError(command ?? "")
    }
    try {
      const result = await execFileAsync("git", [...args], {
        cwd,
        maxBuffer: MAX_BUFFER_BYTES,
        timeout: GIT_TIMEOUT_MS,
      })
      return result.stdout.trim()
    } catch {
      return null
    }
  }

  public async repoRoot(cwd: string): Promise<string | null> {
    return this.git(cwd, ["rev-parse", "--show-toplevel"])
  }

  public async head(cwd: string): Promise<string | null> {
    return this.git(cwd, ["rev-parse", "HEAD"])
  }

  public async branch(cwd: string): Promise<string | null> {
    const branch = await this.git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])
    return branch === "HEAD" ? null : branch
  }

  public async originUrl(cwd: string): Promise<string | null> {
    return this.git(cwd, ["remote", "get-url", "origin"])
  }

  public async dirtyHash(cwd: string): Promise<string> {
    const status = await this.git(cwd, ["status", "--porcelain=v1", "-z"])
    return sha256(status ?? "")
  }

  public async commitExists(cwd: string, commit: string): Promise<boolean> {
    const result = await this.git(cwd, ["cat-file", "-e", `${commit}^{commit}`])
    return result !== null
  }

  public async renamesSince(
    cwd: string,
    historicalHead: string,
    paths: readonly string[],
  ): Promise<Map<string, string>> {
    if (paths.length === 0) {
      return new Map()
    }
    const renameMap = new Map<string, string>()
    const historicalPaths = new Set(paths)
    const output = await this.git(cwd, [
      "diff",
      "--name-status",
      "--find-renames=50%",
      `${historicalHead}..HEAD`,
    ])
    for (const line of output?.split("\n") ?? []) {
      const [status, oldPath, newPath] = line.split("\t")
      if (
        status?.startsWith("R") &&
        oldPath !== undefined &&
        newPath !== undefined &&
        historicalPaths.has(oldPath)
      ) {
        renameMap.set(oldPath, newPath)
      }
    }
    return renameMap
  }
}

export class GitCommandRejectedError extends Error {
  public readonly name = "GitCommandRejectedError"

  public constructor(command: string) {
    super(`Rejected git command: ${command}`)
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}
