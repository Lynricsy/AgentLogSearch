import { createHash } from "node:crypto"
import type { PatchChangedRange, PatchFileSummary, PatchSummary } from "../evidence-types.js"

export function parsePatch(text: string): PatchSummary | null {
  if (text.includes("*** Begin Patch")) {
    return parseApplyPatch(text)
  }
  if (text.includes("diff --git ")) {
    return parseGitDiff(text)
  }
  return null
}

function parseApplyPatch(text: string): PatchSummary {
  const files: PatchFileBuilder[] = []
  let current: PatchFileBuilder | undefined

  for (const line of text.split(/\r?\n/)) {
    const addPath = /^\*\*\* Add File:\s+(.+)$/.exec(line)?.[1]
    const updatePath = /^\*\*\* Update File:\s+(.+)$/.exec(line)?.[1]
    const deletePath = /^\*\*\* Delete File:\s+(.+)$/.exec(line)?.[1]
    const moveTo = /^\*\*\* Move to:\s+(.+)$/.exec(line)?.[1]
    if (addPath !== undefined || updatePath !== undefined || deletePath !== undefined) {
      current = {
        path: String(addPath ?? updatePath ?? deletePath),
        operation: addPath !== undefined ? "add" : deletePath !== undefined ? "delete" : "update",
        addedLines: 0,
        deletedLines: 0,
        changedRanges: [],
      }
      files.push(current)
      continue
    }
    if (moveTo !== undefined && current !== undefined) {
      current.previousPath = current.path
      current.path = moveTo
      current.operation = "rename"
      continue
    }
    const range = /^@@(?:\s+-(\d+)(?:,(\d+))?)?(?:\s+\+(\d+)(?:,(\d+))?)?/.exec(line)
    if (range !== null && current !== undefined) {
      current.changedRanges.push(toChangedRange(range))
      continue
    }
    if (current !== undefined && line.startsWith("+") && !line.startsWith("+++")) {
      current.addedLines += 1
    } else if (current !== undefined && line.startsWith("-") && !line.startsWith("---")) {
      current.deletedLines += 1
    }
  }
  return { patchSha256: sha256(text), files: files.map(freezePatchFile) }
}

function parseGitDiff(text: string): PatchSummary {
  const files: PatchFileBuilder[] = []
  let current: PatchFileBuilder | undefined
  for (const line of text.split(/\r?\n/)) {
    const diffMatch = /^diff --git a\/(.+?) b\/(.+)$/.exec(line)
    if (diffMatch !== null) {
      current = {
        path: diffMatch[2] ?? "",
        operation: "update",
        addedLines: 0,
        deletedLines: 0,
        changedRanges: [],
      }
      files.push(current)
      continue
    }
    if (current === undefined) continue
    const renameFrom = /^rename from (.+)$/.exec(line)?.[1]
    const renameTo = /^rename to (.+)$/.exec(line)?.[1]
    if (renameFrom !== undefined) {
      current.previousPath = renameFrom
      current.operation = "rename"
    } else if (renameTo !== undefined) {
      current.path = renameTo
      current.operation = "rename"
    } else if (line.startsWith("new file mode")) {
      current.operation = "add"
    } else if (line.startsWith("deleted file mode")) {
      current.operation = "delete"
    }
    const range = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line)
    if (range !== null) {
      current.changedRanges.push(toChangedRange(range))
      continue
    }
    if (line.startsWith("+") && !line.startsWith("+++")) {
      current.addedLines += 1
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      current.deletedLines += 1
    }
  }
  return { patchSha256: sha256(text), files: files.map(freezePatchFile) }
}

type PatchFileBuilder = {
  path: string
  operation: PatchFileSummary["operation"]
  addedLines: number
  deletedLines: number
  changedRanges: PatchChangedRange[]
  previousPath?: string
}

function toChangedRange(match: RegExpExecArray): PatchChangedRange {
  const oldStart = parseOptionalInt(match[1])
  const oldCount = parseOptionalInt(match[2])
  const newStart = parseOptionalInt(match[3])
  const newCount = parseOptionalInt(match[4])
  return {
    ...(oldStart === undefined ? {} : { oldStart }),
    ...(oldCount === undefined ? {} : { oldCount }),
    ...(newStart === undefined ? {} : { newStart }),
    ...(newCount === undefined ? {} : { newCount }),
  }
}

function freezePatchFile(file: PatchFileBuilder): PatchFileSummary {
  return file.previousPath === undefined
    ? {
        path: file.path,
        operation: file.operation,
        addedLines: file.addedLines,
        deletedLines: file.deletedLines,
        changedRanges: file.changedRanges,
      }
    : {
        path: file.path,
        previousPath: file.previousPath,
        operation: file.operation,
        addedLines: file.addedLines,
        deletedLines: file.deletedLines,
        changedRanges: file.changedRanges,
      }
}

function parseOptionalInt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : undefined
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}
