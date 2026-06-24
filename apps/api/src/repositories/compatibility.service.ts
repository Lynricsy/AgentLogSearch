import { access } from "node:fs/promises"
import path from "node:path"
import { Injectable } from "@nestjs/common"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { GitInspectorService } from "./git-inspector.service.js"
import type {
  DependencySnapshot,
  RepositoryCompatibilityInput,
  RepositoryCompatibilityLevel,
  RepositoryCompatibilityResult,
  RepositoryFileStatus,
  RepositorySymbolSnapshot,
} from "./repository.types.js"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { RepositorySnapshotService } from "./repository-snapshot.service.js"
// biome-ignore lint/style/useImportType: Nest needs runtime constructor metadata for DI.
import { SymbolIndexService } from "./symbol-index.service.js"

export const COMPATIBILITY_DISCLAIMER =
  "该结果只表示相关工程对象仍然存在或相似，不代表历史 patch 可以直接应用。"

@Injectable()
export class CompatibilityService {
  public constructor(
    private readonly git: GitInspectorService,
    private readonly snapshots: RepositorySnapshotService,
    private readonly symbols: SymbolIndexService,
  ) {}

  public async check(input: RepositoryCompatibilityInput): Promise<RepositoryCompatibilityResult> {
    const snapshot = await this.snapshots.snapshot(input.currentRepositoryPath)
    if (snapshot === null) {
      throw new RepositoryCompatibilityError("repository_not_found")
    }
    const paths = unique(input.historicalPaths.map(normalizeRelativePath).filter(isPresent))
    const renameMap =
      input.historicalHead !== null &&
      input.historicalHead !== undefined &&
      (await this.git.commitExists(snapshot.rootPath, input.historicalHead))
        ? await this.git.renamesSince(snapshot.rootPath, input.historicalHead, paths)
        : new Map<string, string>()
    const files = await Promise.all(
      paths.map((historicalPath) => fileStatus(snapshot.rootPath, historicalPath, renameMap)),
    )
    const historicalSymbols = unique(
      (input.historicalSymbols ?? []).map(normalizeSymbolName).filter(isPresent),
    )
    const currentSymbols =
      historicalSymbols.length === 0
        ? []
        : await this.symbols.index(snapshot.rootPath, symbolIndexPaths(files))
    const score = scoreCompatibility({
      files,
      historicalManifestHash: input.historicalManifestHash ?? null,
      historicalRepoKey: input.historicalRepoKey ?? null,
      historicalSymbols,
      historicalDependencies: input.historicalDependencies ?? null,
      manifestHash: snapshot.manifestHash,
      repoKey: snapshot.repoKey,
      dependencies: snapshot.dependencies,
      symbols: currentSymbols,
    })

    return {
      coverage: score.coverage,
      disclaimer: COMPATIBILITY_DISCLAIMER,
      files,
      level: score.level,
      reasonCodes: score.reasonCodes,
      score: score.score,
      snapshot,
    }
  }
}

export class RepositoryCompatibilityError extends Error {
  public readonly name = "RepositoryCompatibilityError"

  public constructor(public readonly code: "repository_not_found") {
    super(code)
  }
}

async function fileStatus(
  rootPath: string,
  historicalPath: string,
  renameMap: ReadonlyMap<string, string>,
): Promise<RepositoryFileStatus> {
  if (await fileExists(path.join(rootPath, historicalPath))) {
    return { currentPath: historicalPath, historicalPath, status: "present" }
  }
  const renamedPath = renameMap.get(historicalPath)
  if (renamedPath !== undefined && (await fileExists(path.join(rootPath, renamedPath)))) {
    return { currentPath: renamedPath, historicalPath, status: "renamed" }
  }
  return { currentPath: null, historicalPath, status: "missing" }
}

function scoreCompatibility(input: {
  readonly files: readonly RepositoryFileStatus[]
  readonly dependencies: DependencySnapshot | null
  readonly historicalDependencies: DependencySnapshot | null
  readonly historicalManifestHash: string | null
  readonly historicalRepoKey: string | null
  readonly historicalSymbols: readonly string[]
  readonly manifestHash: string | null
  readonly repoKey: string
  readonly symbols: readonly RepositorySymbolSnapshot[]
}): {
  readonly coverage: number
  readonly level: RepositoryCompatibilityLevel
  readonly reasonCodes: readonly string[]
  readonly score: number
} {
  const reasonCodes: string[] = []
  const signals: { readonly score: number; readonly weight: number }[] = []
  if (input.historicalRepoKey !== null) {
    const sameRepo = input.historicalRepoKey === input.repoKey
    signals.push({ score: sameRepo ? 1 : 0, weight: 0.25 })
    reasonCodes.push(sameRepo ? "REPO_IDENTITY_MATCH" : "REPO_IDENTITY_MISMATCH")
  } else {
    reasonCodes.push("REPO_IDENTITY_UNKNOWN")
  }

  if (input.files.length > 0) {
    const present = input.files.filter((file) => file.status === "present").length
    const renamed = input.files.filter((file) => file.status === "renamed").length
    const existenceScore = (present + renamed) / input.files.length
    const renameScore = renamed > 0 ? 1 : present / input.files.length
    signals.push({ score: existenceScore, weight: 0.3 })
    signals.push({ score: renameScore, weight: 0.15 })
    if (input.files.every((file) => file.status === "missing")) {
      reasonCodes.push("ALL_FILES_MISSING")
    } else if (renamed > 0) {
      reasonCodes.push("RENAMES_DETECTED")
    } else if (input.files.some((file) => file.status === "missing")) {
      reasonCodes.push("SOME_FILES_MISSING")
    } else {
      reasonCodes.push("FILES_PRESENT")
    }
  } else {
    reasonCodes.push("FILES_UNKNOWN")
  }

  if (input.historicalSymbols.length > 0) {
    const currentSymbolNames = new Set(input.symbols.map((symbol) => symbol.name))
    const matched = input.historicalSymbols.filter((symbol) =>
      currentSymbolNames.has(symbol),
    ).length
    const symbolScore = matched / input.historicalSymbols.length
    signals.push({ score: symbolScore, weight: 0.15 })
    reasonCodes.push(symbolScore === 1 ? "SYMBOL_STILL_EXISTS" : "SYMBOL_MISSING")
  } else {
    reasonCodes.push("SYMBOLS_UNKNOWN")
  }

  if (
    input.historicalDependencies !== null &&
    input.dependencies !== null &&
    hasMajorDependencyDrift(input.historicalDependencies, input.dependencies)
  ) {
    reasonCodes.push("DEPENDENCY_MAJOR_CHANGED")
  } else if (input.historicalManifestHash === null || input.manifestHash === null) {
    reasonCodes.push("DEPENDENCY_VERSION_UNKNOWN")
  } else if (input.historicalManifestHash === input.manifestHash) {
    reasonCodes.push("DEPENDENCIES_UNCHANGED")
  } else {
    reasonCodes.push("LOCKFILE_CHANGED")
  }

  const totalWeight = signals.reduce((sum, signal) => sum + signal.weight, 0)
  const coverage = totalWeight / 1
  const score =
    totalWeight === 0
      ? 0
      : signals.reduce((sum, signal) => sum + signal.score * signal.weight, 0) / totalWeight
  return {
    coverage,
    level: levelFor(score, coverage, input.files),
    reasonCodes,
    score: round(score),
  }
}

function levelFor(
  score: number,
  coverage: number,
  files: readonly RepositoryFileStatus[],
): RepositoryCompatibilityLevel {
  if (files.length > 0 && files.every((file) => file.status === "missing")) {
    return "STALE"
  }
  if (coverage < 0.4) {
    return "UNCERTAIN"
  }
  if (score >= 0.8) return "COMPATIBLE"
  if (score >= 0.65) return "LIKELY_COMPATIBLE"
  if (score >= 0.4) return "LIKELY_STALE"
  return "STALE"
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

function normalizeRelativePath(value: string): string | null {
  const normalized = value.trim().replaceAll("\\", "/")
  if (
    normalized.length === 0 ||
    normalized.startsWith("/") ||
    normalized.includes("\0") ||
    normalized.split("/").includes("..")
  ) {
    return null
  }
  return normalized
}

function normalizeSymbolName(value: string): string | null {
  const normalized = value.trim()
  if (normalized.length === 0 || normalized.includes("\0")) {
    return null
  }
  return normalized
}

function symbolIndexPaths(files: readonly RepositoryFileStatus[]): readonly string[] {
  return files.flatMap((file) => {
    if (file.currentPath === null || file.status === "missing") {
      return []
    }
    return [file.currentPath]
  })
}

function hasMajorDependencyDrift(
  historical: DependencySnapshot,
  current: DependencySnapshot,
): boolean {
  const currentMajorVersions = new Map(
    current.topLevelDependencies.map((dependency) => [dependency.name, dependency.majorVersion]),
  )
  return historical.topLevelDependencies.some((dependency) => {
    if (dependency.majorVersion === null) {
      return false
    }
    const currentMajor = currentMajorVersions.get(dependency.name)
    return (
      currentMajor !== undefined &&
      currentMajor !== null &&
      currentMajor !== dependency.majorVersion
    )
  })
}

function isPresent<T>(value: T | null): value is T {
  return value !== null
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)]
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}
