import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { DependencySnapshotService } from "./dependency-snapshot.service.js"

let roots: string[] = []

describe("DependencySnapshotService", () => {
  afterEach(async () => {
    await Promise.all(roots.map((root) => rm(root, { force: true, recursive: true })))
    roots = []
  })

  it("returns null when no package manifest or lockfile exists", async () => {
    const root = await createWorkspace()

    await expect(new DependencySnapshotService().snapshot(root)).resolves.toBeNull()
  })

  it("captures package metadata, lockfiles and top-level dependency majors", async () => {
    const root = await createWorkspace()
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        dependencies: {
          "@nestjs/common": "^11.1.27",
          react: "npm:@preact/compat@10.22.0",
          typescript: "workspace:*",
        },
        devDependencies: {
          jest: "~30.4.2",
        },
        name: "dependency-test",
        packageManager: "pnpm@10.20.0",
      }),
    )
    await writeFile(path.join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n")

    const snapshot = await new DependencySnapshotService().snapshot(root)

    expect(snapshot).toMatchObject({
      packageManagers: ["pnpm"],
      packageName: "dependency-test",
    })
    expect(snapshot?.manifestHash).toMatch(/^[a-f0-9]{64}$/)
    expect(snapshot?.lockfiles).toEqual([
      expect.objectContaining({
        fileName: "pnpm-lock.yaml",
        hash: expect.stringMatching(/^[a-f0-9]{64}$/),
        kind: "pnpm",
      }),
    ])
    expect(snapshot?.topLevelDependencies).toEqual(
      expect.arrayContaining([
        {
          group: "dependencies",
          majorVersion: 11,
          name: "@nestjs/common",
          versionRange: "^11.1.27",
        },
        {
          group: "dependencies",
          majorVersion: 10,
          name: "react",
          versionRange: "npm:@preact/compat@10.22.0",
        },
        {
          group: "dependencies",
          majorVersion: null,
          name: "typescript",
          versionRange: "workspace:*",
        },
        {
          group: "devDependencies",
          majorVersion: 30,
          name: "jest",
          versionRange: "~30.4.2",
        },
      ]),
    )
  })

  it("changes manifestHash when a lockfile changes", async () => {
    const root = await createWorkspace()
    await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "dependency-test" }))
    await writeFile(path.join(root, "package-lock.json"), '{"lockfileVersion":3}\n')
    const before = await new DependencySnapshotService().snapshot(root)

    await writeFile(path.join(root, "package-lock.json"), '{"lockfileVersion":2}\n')
    const after = await new DependencySnapshotService().snapshot(root)

    expect(before?.manifestHash).toBeDefined()
    expect(after?.manifestHash).toBeDefined()
    expect(after?.manifestHash).not.toBe(before?.manifestHash)
  })
})

async function createWorkspace(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "clisearch-deps-"))
  roots.push(root)
  return root
}
