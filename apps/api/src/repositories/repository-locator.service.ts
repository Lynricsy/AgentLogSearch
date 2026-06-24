import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { Injectable } from "@nestjs/common"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { GitInspectorService } from "./git-inspector.service.js"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { RepositoryPathPolicyService } from "./repository-path-policy.service.js"

export type LocatedRepository = {
  readonly repoKey: string
  readonly rootPath: string
}

@Injectable()
export class RepositoryLocatorService {
  public constructor(
    private readonly git: GitInspectorService,
    private readonly pathPolicy: RepositoryPathPolicyService,
  ) {}

  public async locate(inputPath: string): Promise<LocatedRepository | null> {
    const safePath = await this.pathPolicy.resolveRepositoryPath(inputPath)
    if (safePath === null) {
      return null
    }
    const root = await this.git.repoRoot(safePath)
    if (root === null) {
      return null
    }
    const rootPath = await this.pathPolicy.resolveRepositoryPath(root)
    if (rootPath === null) {
      return null
    }
    return {
      repoKey: await this.buildRepoKey(rootPath),
      rootPath,
    }
  }

  private async buildRepoKey(rootPath: string): Promise<string> {
    const origin = await this.git.originUrl(rootPath)
    if (origin !== null && origin.length > 0) {
      return sha256(normalizeRemote(origin))
    }
    return sha256(`${rootPath}:${await readPackageName(rootPath)}`)
  }
}

export function normalizeRemote(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) return ""
  const scpLike = /^([^@]+@)?([^:/]+):(.+)$/.exec(trimmed)
  if (scpLike !== null && !trimmed.includes("://")) {
    return normalizeHostPath(scpLike[2] ?? "", scpLike[3] ?? "")
  }
  try {
    const url = new URL(trimmed)
    const pathName = url.pathname.replace(/^\/+/, "")
    return normalizeHostPath(url.hostname, pathName)
  } catch {
    return trimmed.replace(/\.git$/i, "").toLocaleLowerCase("en-US")
  }
}

async function readPackageName(rootPath: string): Promise<string> {
  try {
    const raw = await readFile(path.join(rootPath, "package.json"), "utf8")
    const parsed = JSON.parse(raw) as { readonly name?: unknown }
    return typeof parsed.name === "string" ? parsed.name : ""
  } catch {
    return ""
  }
}

function normalizeHostPath(host: string, rawPath: string): string {
  const pathName = rawPath.replace(/^\/+/, "").replace(/\.git$/i, "")
  return `${host.toLocaleLowerCase("en-US")}/${pathName}`
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}
