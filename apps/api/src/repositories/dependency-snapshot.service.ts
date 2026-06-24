import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { Injectable } from "@nestjs/common"
import type {
  DependencyGroup,
  DependencyLockfileKind,
  DependencyLockfileSnapshot,
  DependencySnapshot,
  DependencyVersionSnapshot,
} from "./repository.types.js"

type ManifestFile = {
  readonly fileName: string
  readonly content: Buffer
}

type PackageManifest = ManifestFile & {
  readonly data: {
    readonly name?: unknown
    readonly packageManager?: unknown
    readonly dependencies?: unknown
    readonly devDependencies?: unknown
    readonly optionalDependencies?: unknown
    readonly peerDependencies?: unknown
  } | null
}

const PACKAGE_MANIFEST = "package.json"
const LOCKFILES: readonly {
  readonly fileName: string
  readonly kind: DependencyLockfileKind
}[] = [
  { fileName: "pnpm-lock.yaml", kind: "pnpm" },
  { fileName: "package-lock.json", kind: "npm" },
  { fileName: "yarn.lock", kind: "yarn" },
]
const DEPENDENCY_GROUPS: readonly DependencyGroup[] = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
]

@Injectable()
export class DependencySnapshotService {
  public async snapshot(rootPath: string): Promise<DependencySnapshot | null> {
    const [packageManifest, lockfiles] = await Promise.all([
      readPackageManifest(rootPath),
      readLockfiles(rootPath),
    ])
    const manifestFiles = [
      ...(packageManifest === null ? [] : [packageManifest]),
      ...lockfiles.map((lockfile) => ({
        content: lockfile.content,
        fileName: lockfile.fileName,
      })),
    ]
    if (manifestFiles.length === 0) {
      return null
    }

    return {
      lockfiles: lockfiles.map(toLockfileSnapshot),
      manifestHash: hashManifestFiles(manifestFiles),
      packageManagers: uniqueKinds([
        ...lockfiles.map((lockfile) => lockfile.kind),
        ...packageManagerFromPackageJson(packageManifest?.data?.packageManager),
      ]),
      packageName: packageName(packageManifest),
      topLevelDependencies: topLevelDependencies(packageManifest?.data ?? null),
    }
  }
}

async function readPackageManifest(rootPath: string): Promise<PackageManifest | null> {
  const content = await readOptionalFile(rootPath, PACKAGE_MANIFEST)
  if (content === null) {
    return null
  }
  return {
    content,
    data: parsePackageJson(content),
    fileName: PACKAGE_MANIFEST,
  }
}

async function readLockfiles(
  rootPath: string,
): Promise<readonly (ManifestFile & { readonly kind: DependencyLockfileKind })[]> {
  const results = await Promise.all(
    LOCKFILES.map(async (lockfile) => {
      const content = await readOptionalFile(rootPath, lockfile.fileName)
      return content === null ? null : { ...lockfile, content }
    }),
  )
  return results.filter((value): value is NonNullable<(typeof results)[number]> => value !== null)
}

async function readOptionalFile(rootPath: string, fileName: string): Promise<Buffer | null> {
  try {
    return await readFile(path.join(rootPath, fileName))
  } catch {
    return null
  }
}

function parsePackageJson(content: Buffer): PackageManifest["data"] {
  try {
    return JSON.parse(content.toString("utf8")) as PackageManifest["data"]
  } catch {
    return null
  }
}

function packageName(manifest: PackageManifest | null): string | null {
  const name = manifest?.data?.name
  return typeof name === "string" && name.trim().length > 0 ? name.trim() : null
}

function packageManagerFromPackageJson(value: unknown): readonly DependencyLockfileKind[] {
  if (typeof value !== "string") {
    return []
  }
  if (value.startsWith("pnpm@")) return ["pnpm"]
  if (value.startsWith("npm@")) return ["npm"]
  if (value.startsWith("yarn@")) return ["yarn"]
  return []
}

function topLevelDependencies(
  manifest: NonNullable<PackageManifest["data"]> | null,
): readonly DependencyVersionSnapshot[] {
  if (manifest === null) {
    return []
  }
  return DEPENDENCY_GROUPS.flatMap((group) => dependenciesForGroup(group, manifest[group]))
    .sort(
      (left, right) => left.name.localeCompare(right.name) || left.group.localeCompare(right.group),
    )
    .slice(0, 500)
}

function dependenciesForGroup(
  group: DependencyGroup,
  value: unknown,
): readonly DependencyVersionSnapshot[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return []
  }
  return Object.entries(value)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([name, versionRange]) => ({
      group,
      majorVersion: majorVersion(versionRange),
      name,
      versionRange,
    }))
}

function majorVersion(versionRange: string): number | null {
  const normalized = versionRange.trim().replace(/^npm:(?:@[^/]+\/[^@]+|[^@]+)@/, "")
  const match = /^[~^<>=\s]*(\d+)(?:\.|$)/.exec(normalized)
  if (match === null) {
    return null
  }
  const value = Number(match[1])
  return Number.isSafeInteger(value) ? value : null
}

function toLockfileSnapshot(input: ManifestFile & { readonly kind: DependencyLockfileKind }) {
  return {
    fileName: input.fileName,
    hash: sha256(input.content),
    kind: input.kind,
  } satisfies DependencyLockfileSnapshot
}

function hashManifestFiles(files: readonly ManifestFile[]): string {
  const hash = createHash("sha256")
  for (const file of [...files].sort((left, right) =>
    left.fileName.localeCompare(right.fileName),
  )) {
    hash.update(file.fileName)
    hash.update("\0")
    hash.update(file.content)
    hash.update("\0")
  }
  return hash.digest("hex")
}

function sha256(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex")
}

function uniqueKinds(values: readonly DependencyLockfileKind[]): readonly DependencyLockfileKind[] {
  return [...new Set(values)]
}
