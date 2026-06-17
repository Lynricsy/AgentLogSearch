import { createHash } from "node:crypto"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import type { ParserType } from "@agent-log-search/shared"
import {
  FileGlobSourceReader,
  type ParsedSession,
  type ParserSource,
  SqliteSourceReader,
} from "./parsers/index.js"

export const SAMPLE_DATA_ROOT = resolve(process.cwd(), "../../sample-data")

export type FixtureCase = {
  readonly parserType: ParserType
  readonly relativePath: string
  readonly threadId: string
  readonly cwd: string
  readonly title: string
  readonly model: string
  readonly contentSnippets: readonly [string, string, string]
}

export const FIXTURE_CASES = [
  {
    parserType: "codex-jsonl",
    relativePath: "codex/session-1.jsonl",
    threadId: "codex-thread-synthetic-001",
    cwd: "/workspace/synthetic-codex",
    title: "Synthetic Codex Session",
    model: "gpt-5-codex-synthetic",
    contentSnippets: [
      "Create a parser fixture",
      "Codex fixture contains cwd",
      "synthetic-codex-fixture",
    ],
  },
  {
    parserType: "claude-jsonl",
    relativePath: "claude/session-1.jsonl",
    threadId: "claude-thread-synthetic-001",
    cwd: "/workspace/synthetic-claude",
    title: "Synthetic Claude Session",
    model: "claude-sonnet-synthetic",
    contentSnippets: [
      "Explain the sanitized fixture",
      "Claude fixture contains synthetic",
      "synthetic file summary",
    ],
  },
  {
    parserType: "pi-jsonl",
    relativePath: "pi-agent/session-1.jsonl",
    threadId: "pi-thread-synthetic-001",
    cwd: "/workspace/synthetic-pi",
    title: "Synthetic Pi Agent Session",
    model: "pi-agent-synthetic",
    contentSnippets: [
      "Collect parser fixture requirements",
      "Pi fixture metadata includes cwd",
      "classification=synthetic",
    ],
  },
  {
    parserType: "generic-jsonl",
    relativePath: "generic/session-1.jsonl",
    threadId: "generic-jsonl-thread-synthetic-001",
    cwd: "/workspace/synthetic-generic",
    title: "Synthetic Generic JSONL Session",
    model: "generic-jsonl-synthetic",
    contentSnippets: [
      "Load a generic JSONL transcript",
      "Generic JSONL includes title",
      "synthetic-ok",
    ],
  },
  {
    parserType: "generic-json",
    relativePath: "generic/session-1.json",
    threadId: "generic-json-thread-synthetic-001",
    cwd: "/workspace/synthetic-generic",
    title: "Synthetic Generic JSON Session",
    model: "generic-json-synthetic",
    contentSnippets: [
      "Parse a generic JSON transcript",
      "extract threadId",
      "synthetic-json-fixture",
    ],
  },
  {
    parserType: "generic-markdown",
    relativePath: "generic/session-1.md",
    threadId: "generic-md-thread-synthetic-001",
    cwd: "/workspace/synthetic-generic",
    title: "Synthetic Generic Markdown Session",
    model: "generic-markdown-synthetic",
    contentSnippets: [
      "Parse a markdown transcript",
      "Markdown fixtures expose threadId",
      "markdown-tool-result",
    ],
  },
] as const satisfies readonly FixtureCase[]

export async function readTextSource(relativePath: string): Promise<ParserSource> {
  const filePath = resolve(SAMPLE_DATA_ROOT, relativePath)
  const reader = new FileGlobSourceReader()
  return only(
    await reader.read({
      rootPath: dirname(filePath),
      fileGlob: basename(filePath),
    }),
  )
}

export async function readSqliteSource(
  relativePath: string,
): Promise<ParserSource & { readonly kind: "sqlite" }> {
  const filePath = resolve(SAMPLE_DATA_ROOT, relativePath)
  const reader = new SqliteSourceReader()
  const source = only(
    await reader.read({
      rootPath: dirname(filePath),
      fileGlob: basename(filePath),
    }),
  )
  if (source.kind !== "sqlite") {
    throw new TestInvariantError("expected SQLite source")
  }
  return source
}

export async function readDirectTextSource(filePath: string): Promise<ParserSource> {
  return {
    kind: "text",
    filePath,
    content: await readFile(filePath, "utf8"),
  }
}

export async function writeTempFile(fileName: string, content: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "clisearch-parsers-"))
  const filePath = join(root, fileName)
  await writeFile(filePath, content, "utf8")
  return filePath
}

export function assertFixtureSession(session: ParsedSession, fixture: FixtureCase): void {
  expect(session.parserType).toBe(fixture.parserType)
  expect(session.sourcePath).toBe(resolve(SAMPLE_DATA_ROOT, fixture.relativePath))
  expect(session.threadId).toBe(fixture.threadId)
  expect(session.cwd).toBe(fixture.cwd)
  expect(session.title).toBe(fixture.title)
  expect(session.model).toBe(fixture.model)
  expect(session.messages.map((message) => message.sequence)).toEqual([0, 1, 2])
  expect(session.messages.map((message) => message.role)).toEqual(["user", "assistant", "tool"])
  expect(session.messages.map((message) => message.model)).toEqual([null, fixture.model, null])
  expect(session.messages[0]?.content).toContain(fixture.contentSnippets[0])
  expect(session.messages[1]?.content).toContain(fixture.contentSnippets[1])
  expect(session.messages[2]?.content).toContain(fixture.contentSnippets[2])
}

export function only<T>(values: readonly T[]): T {
  expect(values).toHaveLength(1)
  const value = values[0]
  if (value === undefined) {
    throw new TestInvariantError("expected exactly one value")
  }
  return value
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

class TestInvariantError extends Error {
  public readonly name = "TestInvariantError"
}
