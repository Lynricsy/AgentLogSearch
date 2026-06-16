import { describe, expect, it } from "vitest"
import { createSourceRequestSchema, SOURCE_PRESET_DEFAULTS } from "./index"

describe("createSourceRequestSchema", () => {
  it("parses a valid source payload when preset defaults are explicit", () => {
    // Given
    const codexDefaults = SOURCE_PRESET_DEFAULTS.codex
    const payload = {
      name: "Codex local history",
      sourcePreset: "codex",
      parserType: codexDefaults.parserType,
      readerType: codexDefaults.readerType,
      rootPath: codexDefaults.rootPath,
      fileGlob: codexDefaults.fileGlob,
      resumeTemplate: codexDefaults.resumeTemplate,
      enabled: true,
      scanIntervalSeconds: 900,
      maxFileSizeBytes: 1_048_576,
      maxFilesPerScan: 500,
      followSymlinks: false,
    }

    // When
    const result = createSourceRequestSchema.parse(payload)

    // Then
    expect(result).toEqual(payload)
  })

  it("rejects invalid source preset, parser, reader, and scan bounds", () => {
    // Given
    const payloads: readonly unknown[] = [
      {
        name: "Bad",
        sourcePreset: "cursor",
        parserType: "codex-jsonl",
        readerType: "file-glob",
        rootPath: "~/.codex/sessions",
      },
      {
        name: "Bad",
        sourcePreset: "codex",
        parserType: "markdown",
        readerType: "file-glob",
        rootPath: "~/.codex/sessions",
      },
      {
        name: "Bad",
        sourcePreset: "codex",
        parserType: "codex-jsonl",
        readerType: "http",
        rootPath: "~/.codex/sessions",
      },
      {
        name: "",
        sourcePreset: "codex",
        parserType: "codex-jsonl",
        readerType: "file-glob",
        rootPath: "~/.codex/sessions",
      },
      {
        name: "Bad",
        sourcePreset: "codex",
        parserType: "codex-jsonl",
        readerType: "file-glob",
        rootPath: "relative/path",
      },
      {
        name: "Bad",
        sourcePreset: "codex",
        parserType: "codex-jsonl",
        readerType: "file-glob",
        rootPath: "~/.codex/sessions",
        scanIntervalSeconds: 0,
      },
    ]

    // When
    const results = payloads.map((payload) => createSourceRequestSchema.safeParse(payload))

    // Then
    expect(results.every((result) => !result.success)).toBe(true)
  })
})
