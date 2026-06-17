import { createHash } from "node:crypto"
import { readFile, stat } from "node:fs/promises"
import type { ParserType } from "@agent-log-search/shared"
import type { ParserSource } from "../parsers/index.js"
import type { FileFingerprint } from "./scanner.types.js"

export async function fingerprintSource(
  source: ParserSource,
  parserType: ParserType,
): Promise<FileFingerprint> {
  if (source.kind === "text") {
    const metadata = await stat(source.filePath)
    return {
      hash: createHash("sha256").update(source.content).digest("hex"),
      fileSize: BigInt(metadata.size),
      modifiedAt: metadata.mtime,
    }
  }

  const paths = sqliteFingerprintPaths(source.databasePath, parserType)
  const hash = createHash("sha256")
  let fileSize = 0n
  let modifiedAt: Date | null = null
  for (const path of paths) {
    const metadata = await readOptionalMetadata(path)
    if (metadata === null) {
      continue
    }
    hash.update(await readFile(path))
    fileSize += BigInt(metadata.size)
    modifiedAt = latestDate(modifiedAt, metadata.mtime)
  }
  return {
    hash: hash.digest("hex"),
    fileSize,
    modifiedAt,
  }
}

function sqliteFingerprintPaths(databasePath: string, parserType: ParserType): readonly string[] {
  if (parserType !== "opencode-sqlite") {
    return [databasePath]
  }
  return [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]
}

async function readOptionalMetadata(
  path: string,
): Promise<{ readonly size: number; readonly mtime: Date } | null> {
  try {
    const metadata = await stat(path)
    return { size: metadata.size, mtime: metadata.mtime }
  } catch (error) {
    if (isMissingFile(error)) {
      return null
    }
    throw error
  }
}

function latestDate(left: Date | null, right: Date): Date {
  if (left === null || right.getTime() > left.getTime()) {
    return right
  }
  return left
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && Reflect.get(error, "code") === "ENOENT"
}
