export type RepositorySnapshotQuality = "exact" | "near_time" | "late" | "unknown"

export type RepositorySnapshot = {
  readonly repoKey: string
  readonly rootPath: string
  readonly gitHead: string | null
  readonly branch: string | null
  readonly dirtyHash: string
  readonly manifestHash: string | null
  readonly dependencies: DependencySnapshot | null
  readonly capturedAt: string
  readonly quality: RepositorySnapshotQuality
}

export type DependencyLockfileKind = "npm" | "pnpm" | "yarn"

export type DependencyLockfileSnapshot = {
  readonly fileName: string
  readonly kind: DependencyLockfileKind
  readonly hash: string
}

export type DependencyGroup =
  | "dependencies"
  | "devDependencies"
  | "optionalDependencies"
  | "peerDependencies"

export type DependencyVersionSnapshot = {
  readonly group: DependencyGroup
  readonly name: string
  readonly versionRange: string
  readonly majorVersion: number | null
}

export type DependencySnapshot = {
  readonly manifestHash: string
  readonly packageName: string | null
  readonly packageManagers: readonly DependencyLockfileKind[]
  readonly lockfiles: readonly DependencyLockfileSnapshot[]
  readonly topLevelDependencies: readonly DependencyVersionSnapshot[]
}

export type RepositoryFileStatus = {
  readonly currentPath: string | null
  readonly historicalPath: string
  readonly status: "present" | "missing" | "renamed"
}

export type RepositoryCompatibilityLevel =
  | "COMPATIBLE"
  | "LIKELY_COMPATIBLE"
  | "UNCERTAIN"
  | "LIKELY_STALE"
  | "STALE"

export type RepositoryCompatibilityInput = {
  readonly currentRepositoryPath: string
  readonly historicalRepoKey?: string | null
  readonly historicalPaths: readonly string[]
  readonly historicalSymbols?: readonly string[]
  readonly historicalHead?: string | null
}

export type RepositoryCompatibilityResult = {
  readonly level: RepositoryCompatibilityLevel
  readonly score: number
  readonly coverage: number
  readonly reasonCodes: readonly string[]
  readonly snapshot: RepositorySnapshot
  readonly files: readonly RepositoryFileStatus[]
  readonly disclaimer: string
}
