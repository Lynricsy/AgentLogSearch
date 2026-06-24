import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { CompatibilityService } from "./compatibility.service.js"
import { DependencySnapshotService } from "./dependency-snapshot.service.js"
import { GitInspectorService } from "./git-inspector.service.js"
import { RepositoryLocatorService } from "./repository-locator.service.js"
import { RepositoryPathPolicyService } from "./repository-path-policy.service.js"
import { RepositorySnapshotService } from "./repository-snapshot.service.js"
import type { SymbolIndexService } from "./symbol-index.service.js"

let roots: string[] = []

describe("CompatibilityService", () => {
  afterEach(async () => {
    await Promise.all(roots.map((root) => rm(root, { force: true, recursive: true })))
    roots = []
  })

  it("marks an experience stale when every historical file is missing", async () => {
    const repo = await createGitRepository()
    await writeFile(path.join(repo, "src/removed.ts"), "export const removed = true\n")
    const head = await commitAll(repo, "initial")
    await rm(path.join(repo, "src/removed.ts"))
    await commitAll(repo, "remove file")

    const result = await createService().check({
      currentRepositoryPath: repo,
      historicalHead: head,
      historicalPaths: ["src/removed.ts"],
    })

    expect(result.level).toBe("STALE")
    expect(result.files).toEqual([
      { currentPath: null, historicalPath: "src/removed.ts", status: "missing" },
    ])
    expect(result.reasonCodes).toContain("ALL_FILES_MISSING")
    expect(result.disclaimer).toContain("不代表历史 patch 可以直接应用")
  })

  it("treats git renames as continuity instead of a missing file", async () => {
    const repo = await createGitRepository()
    await writeFile(
      path.join(repo, "src/old-name.ts"),
      [
        "export function calculateValue(input: number): number {",
        "  const normalized = input + 1",
        "  return normalized * 2",
        "}",
        "",
      ].join("\n"),
    )
    const head = await commitAll(repo, "initial")
    await rename(path.join(repo, "src/old-name.ts"), path.join(repo, "src/new-name.ts"))
    await commitAll(repo, "rename file")

    const result = await createService().check({
      currentRepositoryPath: repo,
      historicalHead: head,
      historicalPaths: ["src/old-name.ts"],
    })

    expect(result.level).not.toBe("STALE")
    expect(result.files).toEqual([
      {
        currentPath: "src/new-name.ts",
        historicalPath: "src/old-name.ts",
        status: "renamed",
      },
    ])
    expect(result.reasonCodes).toContain("RENAMES_DETECTED")
  })

  it("adds a lockfile warning when the historical manifest hash differs", async () => {
    const repo = await createGitRepository()
    await writeFile(path.join(repo, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n")
    await commitAll(repo, "add lockfile")

    const result = await createService().check({
      currentRepositoryPath: repo,
      historicalManifestHash: "0".repeat(64),
      historicalPaths: ["package.json"],
    })

    expect(result.reasonCodes).toContain("LOCKFILE_CHANGED")
    expect(result.reasonCodes).not.toContain("DEPENDENCY_VERSION_UNKNOWN")
  })

  it("marks dependency version unknown when no historical manifest hash is available", async () => {
    const repo = await createGitRepository()

    const result = await createService().check({
      currentRepositoryPath: repo,
      historicalPaths: ["package.json"],
    })

    expect(result.reasonCodes).toContain("DEPENDENCY_VERSION_UNKNOWN")
  })

  it("marks dependency major changes when historical dependency snapshot is available", async () => {
    const repo = await createGitRepository()
    await writeFile(
      path.join(repo, "package.json"),
      JSON.stringify({ dependencies: { "@nestjs/common": "^11.1.0" }, name: "compat-test" }),
    )
    await commitAll(repo, "add dependency")

    const result = await createService().check({
      currentRepositoryPath: repo,
      historicalDependencies: dependencySnapshot("@nestjs/common", 10),
      historicalManifestHash: "0".repeat(64),
      historicalPaths: ["package.json"],
    })

    expect(result.reasonCodes).toContain("DEPENDENCY_MAJOR_CHANGED")
    expect(result.reasonCodes).not.toContain("LOCKFILE_CHANGED")
  })

  it("marks historical symbols present when Tree-sitter finds them in current files", async () => {
    const repo = await createGitRepository()
    await writeFile(path.join(repo, "src/current.ts"), "export const current = true\n")
    await commitAll(repo, "add symbol")

    const symbols = createSymbolIndexFake(["ScannerImporter", "importSession"])
    const result = await createService(symbols).check({
      currentRepositoryPath: repo,
      historicalPaths: ["src/current.ts"],
      historicalSymbols: ["ScannerImporter", "importSession"],
    })

    expect(symbols.index).toHaveBeenCalledWith(repo, ["src/current.ts"])
    expect(result.reasonCodes).toContain("SYMBOL_STILL_EXISTS")
    expect(result.reasonCodes).not.toContain("SYMBOL_INDEX_NOT_AVAILABLE")
  })

  it("marks historical symbols missing when current files no longer contain them", async () => {
    const repo = await createGitRepository()
    await writeFile(path.join(repo, "src/current.ts"), "export const different = true\n")
    await commitAll(repo, "add different symbol")

    const result = await createService(createSymbolIndexFake(["different"])).check({
      currentRepositoryPath: repo,
      historicalPaths: ["src/current.ts"],
      historicalSymbols: ["ScannerImporter"],
    })

    expect(result.reasonCodes).toContain("SYMBOL_MISSING")
    expect(result.score).toBeLessThan(1)
  })
})

function createService(
  symbols: SymbolIndexService = createSymbolIndexFake([]),
): CompatibilityService {
  const git = new GitInspectorService()
  const pathPolicy = new RepositoryPathPolicyService()
  const locator = new RepositoryLocatorService(git, pathPolicy)
  const snapshots = new RepositorySnapshotService(git, locator, new DependencySnapshotService())
  return new CompatibilityService(git, snapshots, symbols)
}

function createSymbolIndexFake(symbolNames: readonly string[]): SymbolIndexService {
  return {
    index: jest.fn(async (_rootPath: string, paths: readonly string[]) =>
      symbolNames.map((name, index) => ({
        column: 1,
        container: null,
        kind: "function" as const,
        line: index + 1,
        name,
        path: paths[0] ?? "src/current.ts",
      })),
    ),
  } as unknown as SymbolIndexService
}

function dependencySnapshot(name: string, majorVersion: number) {
  return {
    lockfiles: [],
    manifestHash: "0".repeat(64),
    packageManagers: [],
    packageName: "compat-test",
    topLevelDependencies: [
      {
        group: "dependencies" as const,
        majorVersion,
        name,
        versionRange: `^${majorVersion}.0.0`,
      },
    ],
  }
}

async function createGitRepository(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "clisearch-repo-"))
  roots.push(root)
  await mkdir(path.join(root, "src"), { recursive: true })
  await runGit(root, ["init"])
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "compat-test" }))
  return root
}

async function commitAll(cwd: string, message: string): Promise<string> {
  await runGit(cwd, ["add", "."])
  await runGit(cwd, ["commit", "-m", message])
  const head = await runGit(cwd, ["rev-parse", "HEAD"])
  return head.trim()
}

async function runGit(cwd: string, args: readonly string[]): Promise<string> {
  const { execFile } = await import("node:child_process")
  const { promisify } = await import("node:util")
  const execFileAsync = promisify(execFile)
  const result = await execFileAsync("git", [...args], {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_EMAIL: "test@example.invalid",
      GIT_AUTHOR_NAME: "Compatibility Test",
      GIT_COMMITTER_EMAIL: "test@example.invalid",
      GIT_COMMITTER_NAME: "Compatibility Test",
    },
  })
  return result.stdout
}
