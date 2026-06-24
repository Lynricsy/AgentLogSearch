import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { Injectable } from "@nestjs/common"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { GitInspectorService } from "./git-inspector.service.js"
import type { RepositorySnapshot } from "./repository.types.js"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { RepositoryLocatorService } from "./repository-locator.service.js"

const MANIFEST_FILES = ["package.json", "pnpm-lock.yaml", "package-lock.json", "yarn.lock"]

@Injectable()
export class RepositorySnapshotService {
  public constructor(
    private readonly git: GitInspectorService,
    private readonly locator: RepositoryLocatorService,
  ) {}

  public async snapshot(repositoryPath: string): Promise<RepositorySnapshot | null> {
    const repository = await this.locator.locate(repositoryPath)
    if (repository === null) {
      return null
    }
    const [gitHead, branch, dirtyHash, manifestHash] = await Promise.all([
      this.git.head(repository.rootPath),
      this.git.branch(repository.rootPath),
      this.git.dirtyHash(repository.rootPath),
      hashManifests(repository.rootPath),
    ])
    return {
      branch,
      capturedAt: new Date().toISOString(),
      dirtyHash,
      gitHead,
      manifestHash,
      quality: "unknown",
      repoKey: repository.repoKey,
      rootPath: repository.rootPath,
    }
  }
}

async function hashManifests(rootPath: string): Promise<string | null> {
  const hash = createHash("sha256")
  let found = false
  for (const fileName of MANIFEST_FILES) {
    try {
      const content = await readFile(path.join(rootPath, fileName))
      hash.update(fileName)
      hash.update("\0")
      hash.update(content)
      found = true
    } catch {
      // Missing manifests are allowed; they only reduce dependency signal coverage.
    }
  }
  return found ? hash.digest("hex") : null
}
