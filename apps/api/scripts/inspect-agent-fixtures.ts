import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { inspectAgentFixtures } from "../src/evidence/fixture-shape-inventory.js"

const usage = [
  "Usage:",
  "  tsx scripts/inspect-agent-fixtures.ts <sample-data-root> [--output <path>]",
].join("\n")

const { outputPath, sampleRoot } = parseArgs(process.argv.slice(2))
const inventory = await inspectAgentFixtures(sampleRoot)
const json = `${JSON.stringify(inventory, null, 2)}\n`

if (outputPath === null) {
  process.stdout.write(json)
} else {
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, json, "utf8")
}

function parseArgs(args: readonly string[]): {
  readonly outputPath: string | null
  readonly sampleRoot: string
} {
  const [sampleRootArg, ...rest] = args
  if (sampleRootArg === undefined || sampleRootArg === "--help" || sampleRootArg === "-h") {
    throw new Error(usage)
  }

  let outputPath: string | null = null
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]
    if (arg === "--output") {
      const value = rest[index + 1]
      if (value === undefined) {
        throw new Error("--output requires a path")
      }
      outputPath = resolve(value)
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${arg}\n${usage}`)
  }

  return { outputPath, sampleRoot: resolve(sampleRootArg) }
}
