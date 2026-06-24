import type { ParsedToolCallEvent } from "../../parsers/parser-types.js"
import { readPath } from "../../parsers/record-access.js"
import type { CanonicalToolKind, PathEvidence } from "../evidence-types.js"
import { normalizeEvidencePath } from "./path-normalizer.js"

const ARG_PATHS = [["path"], ["file_path"], ["filePath"], ["target_file"]] as const
const TEXT_PATH_PATTERN =
  /(?:[A-Za-z]:\\[^\s)]+|\/[A-Za-z0-9._~/-]+|(?:\.{1,2}\/)?[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+(?::\d+(?::\d+)?)?)/g

export function extractPaths(input: {
  readonly call: ParsedToolCallEvent
  readonly output: string
  readonly canonicalToolKind: CanonicalToolKind
  readonly cwd: string | null
  readonly repositoryRoot?: string | null | undefined
  readonly maxPaths: number
}): readonly PathEvidence[] {
  const candidates: PathEvidence[] = []
  for (const pathValue of pathArguments(input.call.arguments)) {
    const evidence = normalizeEvidencePath({
      rawPath: pathValue,
      cwd: input.cwd,
      repositoryRoot: input.repositoryRoot,
      sourceQuality: "tool_argument",
      access: accessForTool(input.canonicalToolKind),
    })
    if (evidence !== null) candidates.push(evidence)
  }
  for (const rawPath of outputPathCandidates(input.output)) {
    const evidence = normalizeEvidencePath({
      rawPath,
      cwd: input.cwd,
      repositoryRoot: input.repositoryRoot,
      sourceQuality: "output_text",
      access: "mention",
    })
    if (evidence !== null) candidates.push(evidence)
  }
  return dedupePaths(candidates).slice(0, input.maxPaths)
}

export function extractPathCandidatesFromText(text: string): readonly string[] {
  return [...text.matchAll(TEXT_PATH_PATTERN)]
    .map((match) => match[0])
    .filter((value) => value.includes("/") || value.includes("\\"))
}

function pathArguments(args: unknown): readonly string[] {
  const values: string[] = []
  for (const path of ARG_PATHS) {
    const value = readPath(args, path)
    if (typeof value === "string") values.push(value)
  }
  return values
}

function outputPathCandidates(output: string): readonly string[] {
  return extractPathCandidatesFromText(output).slice(0, 200)
}

function accessForTool(canonicalToolKind: CanonicalToolKind): PathEvidence["access"] {
  switch (canonicalToolKind) {
    case "read_file":
    case "search":
      return "read"
    case "write_file":
      return "write"
    case "edit_file":
      return "write"
    case "apply_patch":
      return "patch"
    case "shell":
    case "unknown":
      return "mention"
  }
}

function dedupePaths(paths: readonly PathEvidence[]): readonly PathEvidence[] {
  const seen = new Set<string>()
  const output: PathEvidence[] = []
  for (const path of paths) {
    const key = `${path.path}:${path.access}:${path.sourceQuality}`
    if (seen.has(key)) continue
    seen.add(key)
    output.push(path)
  }
  return output
}
