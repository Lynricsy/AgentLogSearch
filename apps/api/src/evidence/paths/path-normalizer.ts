import path from "node:path"
import type { PathEvidence, PathSourceQuality } from "../evidence-types.js"

const IGNORED_SEGMENTS = new Set([".git", "node_modules", ".next", "dist", "build", "coverage"])

export type NormalizePathInput = {
  readonly rawPath: string
  readonly cwd: string | null
  readonly repositoryRoot?: string | null | undefined
  readonly sourceQuality: PathSourceQuality
  readonly access: PathEvidence["access"]
}

export function normalizeEvidencePath(input: NormalizePathInput): PathEvidence | null {
  const cleaned = cleanRawPath(input.rawPath)
  if (cleaned.length === 0 || cleaned === "." || cleaned === ".." || cleaned.length > 500) {
    return null
  }
  const absolute = toAbsolutePath(cleaned, input.cwd)
  const repoRoot = input.repositoryRoot ?? input.cwd
  const relative =
    repoRoot === null || repoRoot === undefined
      ? absolute
      : path.relative(repoRoot, absolute).replaceAll(path.sep, "/")
  const isExternal = repoRoot !== null && repoRoot !== undefined && isOutsideRepository(relative)
  const normalized = isExternal ? absolute.replaceAll(path.sep, "/") : relative
  if (normalized.length === 0 || hasIgnoredSegment(normalized)) {
    return null
  }
  return {
    rawPath: input.rawPath,
    path: normalized,
    access: input.access,
    sourceQuality: input.sourceQuality,
    isExternal,
  }
}

export function pathToken(pathEvidence: PathEvidence): string | null {
  return pathEvidence.isExternal ? null : pathEvidence.path
}

function cleanRawPath(rawPath: string): string {
  let value = rawPath
    .trim()
    .replace(/^['"`]+|['"`]+$/g, "")
    .replace(/[),.;:]+$/g, "")
  if (value.startsWith("file://")) {
    value = value.slice("file://".length)
  }
  return value.replaceAll("\\", "/")
}

function toAbsolutePath(value: string, cwd: string | null): string {
  if (path.isAbsolute(value)) {
    return path.resolve(value)
  }
  return path.resolve(cwd ?? process.cwd(), value)
}

function isOutsideRepository(relative: string): boolean {
  return relative === ".." || relative.startsWith("../") || path.isAbsolute(relative)
}

function hasIgnoredSegment(value: string): boolean {
  return value.split("/").some((segment) => IGNORED_SEGMENTS.has(segment))
}
