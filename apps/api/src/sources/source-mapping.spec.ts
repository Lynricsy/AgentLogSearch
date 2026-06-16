import {
  PARSER_TYPE_TO_PRISMA,
  PRISMA_PARSER_TYPE_TO_API,
  PRISMA_SOURCE_PRESET_TO_API,
  PRISMA_SOURCE_READER_TYPE_TO_API,
  SOURCE_PRESET_TO_PRISMA,
  SOURCE_READER_TYPE_TO_PRISMA,
} from "./source-mapping.js"

describe("source mapping", () => {
  it("maps hyphenated shared source values to Prisma underscore enum values", () => {
    // Given / When / Then
    expect(SOURCE_PRESET_TO_PRISMA).toMatchObject({
      "claude-code": "claude_code",
      "pi-agent": "pi_agent",
    })
    expect(PARSER_TYPE_TO_PRISMA).toMatchObject({
      "codex-jsonl": "codex_jsonl",
      "opencode-sqlite": "opencode_sqlite",
      "generic-markdown": "generic_markdown",
    })
    expect(SOURCE_READER_TYPE_TO_PRISMA).toMatchObject({
      "file-glob": "file_glob",
      sqlite: "sqlite",
    })
  })

  it("maps Prisma underscore source values back to API hyphenated values", () => {
    // Given / When / Then
    expect(PRISMA_SOURCE_PRESET_TO_API).toMatchObject({
      claude_code: "claude-code",
      pi_agent: "pi-agent",
    })
    expect(PRISMA_PARSER_TYPE_TO_API).toMatchObject({
      codex_jsonl: "codex-jsonl",
      opencode_sqlite: "opencode-sqlite",
      generic_markdown: "generic-markdown",
    })
    expect(PRISMA_SOURCE_READER_TYPE_TO_API).toMatchObject({
      file_glob: "file-glob",
      sqlite: "sqlite",
    })
  })
})
