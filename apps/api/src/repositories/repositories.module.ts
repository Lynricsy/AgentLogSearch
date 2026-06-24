import { Module } from "@nestjs/common"
import { CompatibilityService } from "./compatibility.service.js"
import { DependencySnapshotService } from "./dependency-snapshot.service.js"
import { GitInspectorService } from "./git-inspector.service.js"
import { RepositoryLocatorService } from "./repository-locator.service.js"
import { RepositoryPathPolicyService } from "./repository-path-policy.service.js"
import { RepositorySnapshotService } from "./repository-snapshot.service.js"

@Module({
  exports: [
    CompatibilityService,
    DependencySnapshotService,
    RepositoryLocatorService,
    RepositorySnapshotService,
  ],
  providers: [
    CompatibilityService,
    DependencySnapshotService,
    GitInspectorService,
    RepositoryLocatorService,
    RepositoryPathPolicyService,
    RepositorySnapshotService,
  ],
})
export class RepositoriesModule {}
