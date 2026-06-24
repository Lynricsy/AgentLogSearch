import { Injectable } from "@nestjs/common"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { DependencySnapshotService } from "./dependency-snapshot.service.js"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { GitInspectorService } from "./git-inspector.service.js"
import type { RepositorySnapshot } from "./repository.types.js"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { RepositoryLocatorService } from "./repository-locator.service.js"

@Injectable()
export class RepositorySnapshotService {
  public constructor(
    private readonly git: GitInspectorService,
    private readonly locator: RepositoryLocatorService,
    private readonly dependencies: DependencySnapshotService,
  ) {}

  public async snapshot(repositoryPath: string): Promise<RepositorySnapshot | null> {
    const repository = await this.locator.locate(repositoryPath)
    if (repository === null) {
      return null
    }
    const [gitHead, branch, dirtyHash, dependencies] = await Promise.all([
      this.git.head(repository.rootPath),
      this.git.branch(repository.rootPath),
      this.git.dirtyHash(repository.rootPath),
      this.dependencies.snapshot(repository.rootPath),
    ])
    return {
      branch,
      capturedAt: new Date().toISOString(),
      dependencies,
      dirtyHash,
      gitHead,
      manifestHash: dependencies?.manifestHash ?? null,
      quality: "unknown",
      repoKey: repository.repoKey,
      rootPath: repository.rootPath,
    }
  }
}
