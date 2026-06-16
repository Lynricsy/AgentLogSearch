import { lstat, realpath, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"
import { BadRequestException, Injectable } from "@nestjs/common"

type NormalizeRootInput = {
  readonly rootPath: string
  readonly followSymlinks?: boolean
}

type NormalizedRoot = {
  readonly rootPath: string
}

type NodeError = Error & {
  readonly code?: string
}

@Injectable()
export class PathPolicyService {
  public async normalizeRoot(input: NormalizeRootInput): Promise<NormalizedRoot> {
    const expandedPath = this.expandHome(input.rootPath)
    if (!isAbsolute(expandedPath)) {
      throwInvalidSourcePath("rootPath must be absolute or home-relative")
    }

    const rootPath = resolve(expandedPath)
    const rootStats = await this.readLstat(rootPath)
    const followsSymlinks = input.followSymlinks ?? false

    if (rootStats.isSymbolicLink() && !followsSymlinks) {
      throwInvalidSourcePath("symlink roots require followSymlinks=true")
    }

    const resolvedPath = await this.readRealpath(rootPath)
    if (!followsSymlinks && resolvedPath !== rootPath) {
      throwInvalidSourcePath("rootPath must not contain symlinks")
    }

    const effectiveStats = rootStats.isSymbolicLink() ? await stat(rootPath) : rootStats
    if (!effectiveStats.isDirectory()) {
      throwInvalidSourcePath("rootPath must be an existing directory")
    }

    return { rootPath: followsSymlinks ? resolvedPath : rootPath }
  }

  private expandHome(rootPath: string): string {
    if (rootPath === "~") {
      return homedir()
    }

    if (rootPath.startsWith("~/")) {
      return join(homedir(), rootPath.slice(2))
    }

    return rootPath
  }

  private async readLstat(rootPath: string): Promise<Awaited<ReturnType<typeof lstat>>> {
    try {
      return await lstat(rootPath)
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        throwInvalidSourcePath("rootPath does not exist")
      }
      throw error
    }
  }

  private async readRealpath(rootPath: string): Promise<string> {
    try {
      return await realpath(rootPath)
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        throwInvalidSourcePath("rootPath does not exist")
      }
      throw error
    }
  }
}

function throwInvalidSourcePath(message: string): never {
  throw new BadRequestException({
    error: {
      code: "invalid_source_path",
      message,
      details: {
        field: "rootPath",
      },
    },
  })
}

function isNodeError(error: unknown): error is NodeError {
  return typeof error === "object" && error !== null && "code" in error
}
