import { readdir, readFile, stat } from "node:fs/promises"
import { join, relative, resolve, sep } from "node:path"
import type {
  SourceReader,
  SourceReaderRequest,
  SqliteParserSource,
  TextParserSource,
} from "./parser-types.js"

export class FileGlobSourceReader implements SourceReader<TextParserSource> {
  public async read(request: SourceReaderRequest): Promise<readonly TextParserSource[]> {
    const rootPath = resolve(request.rootPath)
    const matcher = globMatcher(request.fileGlob)
    const filePaths = await listMatchingFiles(rootPath, matcher)
    return Promise.all(
      filePaths.map(async (filePath) => ({
        kind: "text",
        filePath,
        content: await readFile(filePath, "utf8"),
      })),
    )
  }
}

export class SqliteSourceReader implements SourceReader<SqliteParserSource> {
  public async read(request: SourceReaderRequest): Promise<readonly SqliteParserSource[]> {
    const rootPath = resolve(request.rootPath)
    const matcher = globMatcher(request.fileGlob)
    const filePaths = await listMatchingFiles(rootPath, matcher)
    return filePaths.map((filePath) => ({
      kind: "sqlite",
      filePath,
      databasePath: filePath,
    }))
  }
}

async function listMatchingFiles(
  rootPath: string,
  matcher: (relativePath: string) => boolean,
): Promise<readonly string[]> {
  const discovered = await collectFiles(rootPath)
  return discovered
    .map((filePath) => ({ filePath, relativePath: toPortablePath(relative(rootPath, filePath)) }))
    .filter((entry) => matcher(entry.relativePath))
    .map((entry) => entry.filePath)
    .sort((left, right) => left.localeCompare(right))
}

async function collectFiles(rootPath: string): Promise<readonly string[]> {
  const metadata = await stat(rootPath)
  if (metadata.isFile()) {
    return [rootPath]
  }
  const entries = await readdir(rootPath, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(rootPath, entry.name)
      if (entry.isDirectory()) {
        return collectFiles(path)
      }
      return entry.isFile() ? [path] : []
    }),
  )
  return nested.flat()
}

function globMatcher(pattern: string): (relativePath: string) => boolean {
  const regex = new RegExp(`^${globToRegex(toPortablePath(pattern))}$`)
  return (relativePath) => regex.test(relativePath)
}

function globToRegex(pattern: string): string {
  let output = ""
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index] ?? ""
    const next = pattern[index + 1]
    if (char === "*" && next === "*") {
      const afterNext = pattern[index + 2]
      output += afterNext === "/" ? "(?:.*/)?" : ".*"
      index += afterNext === "/" ? 2 : 1
      continue
    }
    if (char === "*") {
      output += "[^/]*"
      continue
    }
    if (char === "?") {
      output += "[^/]"
      continue
    }
    if (char === "{") {
      const braceEnd = pattern.indexOf("}", index + 1)
      if (braceEnd > index) {
        output += braceAlternates(pattern.slice(index + 1, braceEnd))
        index = braceEnd
        continue
      }
    }
    output += escapeRegexChar(char)
  }
  return output
}

function braceAlternates(raw: string): string {
  return `(?:${raw.split(",").map(escapeRegexLiteral).join("|")})`
}

function escapeRegexLiteral(value: string): string {
  return value
    .split("")
    .map((char) => escapeRegexChar(char))
    .join("")
}

function escapeRegexChar(char: string): string {
  return REGEX_SPECIALS.has(char) ? `\\${char}` : char
}

function toPortablePath(path: string): string {
  return sep === "/" ? path : path.split(sep).join("/")
}

const REGEX_SPECIALS = new Set([".", "+", "^", "$", "(", ")", "|", "[", "]", "\\"])
