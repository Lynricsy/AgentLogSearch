import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { SymbolIndexService } from "./symbol-index.service.js"

let roots: string[] = []

describe("SymbolIndexService", () => {
  afterEach(async () => {
    await Promise.all(roots.map((root) => rm(root, { force: true, recursive: true })))
    roots = []
  })

  it("indexes TypeScript declarations from selected files", async () => {
    const root = await createWorkspace()
    await writeFixture(
      root,
      "src/example.ts",
      `
        export class Alpha {
          public run(value: string) {
            const localOnly = value
            return localOnly
          }
          private readonly enabled = true
        }

        export function beta() {}
        export const gamma = () => {}
        export type Delta = { value: string }
        export interface Echo {
          ok(): void
          label: string
        }
        export enum Foxtrot {
          One,
        }
      `,
    )

    const symbols = await new SymbolIndexService().index(root, ["src/example.ts"])

    expect(symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          container: null,
          kind: "class",
          name: "Alpha",
          path: "src/example.ts",
        }),
        expect.objectContaining({
          container: "Alpha",
          kind: "method",
          name: "run",
          path: "src/example.ts",
        }),
        expect.objectContaining({
          container: "Alpha",
          kind: "property",
          name: "enabled",
          path: "src/example.ts",
        }),
        expect.objectContaining({
          container: null,
          kind: "function",
          name: "beta",
          path: "src/example.ts",
        }),
        expect.objectContaining({
          container: null,
          kind: "variable",
          name: "gamma",
          path: "src/example.ts",
        }),
        expect.objectContaining({
          container: null,
          kind: "type",
          name: "Delta",
          path: "src/example.ts",
        }),
        expect.objectContaining({
          container: null,
          kind: "interface",
          name: "Echo",
          path: "src/example.ts",
        }),
        expect.objectContaining({
          container: "Echo",
          kind: "method",
          name: "ok",
          path: "src/example.ts",
        }),
        expect.objectContaining({
          container: "Echo",
          kind: "property",
          name: "label",
          path: "src/example.ts",
        }),
        expect.objectContaining({
          container: null,
          kind: "enum",
          name: "Foxtrot",
          path: "src/example.ts",
        }),
      ]),
    )
    expect(symbols).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "localOnly" })]),
    )
  })

  it("indexes TSX and JSX files with the TSX grammar", async () => {
    const root = await createWorkspace()
    await writeFixture(
      root,
      "src/view.tsx",
      `
        export function View() {
          return <main />
        }
      `,
    )
    await writeFixture(
      root,
      "src/widget.jsx",
      `
        export const Widget = () => <section />
      `,
    )

    const symbols = await new SymbolIndexService().index(root, ["src/view.tsx", "src/widget.jsx"])

    expect(symbols).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "function", name: "View", path: "src/view.tsx" }),
        expect.objectContaining({ kind: "variable", name: "Widget", path: "src/widget.jsx" }),
      ]),
    )
  })

  it("ignores unsupported, missing and unsafe paths", async () => {
    const root = await createWorkspace()
    await writeFixture(root, "src/example.ts", "export const indexed = true\n")
    await writeFixture(root, "src/readme.md", "# ignored\n")

    const symbols = await new SymbolIndexService().index(root, [
      "src/example.ts",
      "src/readme.md",
      "../outside.ts",
      "/absolute.ts",
      "src/missing.ts",
    ])

    expect(symbols).toEqual([
      expect.objectContaining({ kind: "variable", name: "indexed", path: "src/example.ts" }),
    ])
  })
})

async function createWorkspace(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "clisearch-symbols-"))
  roots.push(root)
  return root
}

async function writeFixture(root: string, relativePath: string, content: string): Promise<void> {
  const filePath = path.join(root, relativePath)
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, content.trimStart())
}
