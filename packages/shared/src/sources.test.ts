import { describe, expect, it } from "vitest"
import {
  createSourceRequestSchema,
  SOURCE_PRESET_DEFAULTS,
  SOURCE_PRESET_METADATA,
  SOURCE_SCAN_DEFAULTS,
  updateSourceRequestSchema,
} from "./index"

const invalidScanIntervalSeconds = [
  Number.NaN,
  Number.POSITIVE_INFINITY,
  60.5,
  -60,
  59,
  86_401,
  Number.MAX_SAFE_INTEGER,
] as const

describe("createSourceRequestSchema", () => {
  it("defaults omitted source scan settings when creating a source", () => {
    // Given
    const codexDefaults = SOURCE_PRESET_DEFAULTS.codex
    const payload = {
      name: "Codex local history",
      sourcePreset: "codex",
      parserType: codexDefaults.parserType,
      readerType: codexDefaults.readerType,
      rootPath: codexDefaults.rootPath,
      resumeTemplate: codexDefaults.resumeTemplate,
    }

    // When
    const result = createSourceRequestSchema.parse(payload)

    // Then
    expect(result).toEqual({
      ...payload,
      fileGlob: "**/*",
      enabled: true,
      scanIntervalSeconds: SOURCE_SCAN_DEFAULTS.scanIntervalSeconds,
      maxFileSizeBytes: SOURCE_SCAN_DEFAULTS.maxFileSizeBytes,
      maxFilesPerScan: SOURCE_SCAN_DEFAULTS.maxFilesPerScan,
      followSymlinks: SOURCE_SCAN_DEFAULTS.followSymlinks,
    })
  })

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

  it.each(invalidScanIntervalSeconds)(
    "rejects invalid scan interval seconds value %s when creating a source",
    (scanIntervalSeconds) => {
      // Given
      const codexDefaults = SOURCE_PRESET_DEFAULTS.codex
      const payload = {
        name: "Codex local history",
        sourcePreset: "codex",
        parserType: codexDefaults.parserType,
        readerType: codexDefaults.readerType,
        rootPath: codexDefaults.rootPath,
        scanIntervalSeconds,
      }

      // When
      const result = createSourceRequestSchema.safeParse(payload)

      // Then
      expect(result.success).toBe(false)
    },
  )

  it("exposes first-class preset metadata for agent CLIs and generic imports", () => {
    // Given / When
    const metadata = SOURCE_PRESET_METADATA.map((preset) => ({
      id: preset.id,
      parserType: preset.parserType,
      readerType: preset.readerType,
    }))

    // Then
    expect(metadata).toEqual([
      { id: "codex", parserType: "codex-jsonl", readerType: "file-glob" },
      { id: "claude-code", parserType: "claude-jsonl", readerType: "file-glob" },
      { id: "pi-agent", parserType: "pi-jsonl", readerType: "file-glob" },
      { id: "opencode", parserType: "opencode-sqlite", readerType: "sqlite" },
      { id: "generic-jsonl", parserType: "generic-jsonl", readerType: "file-glob" },
      { id: "generic-json", parserType: "generic-json", readerType: "file-glob" },
      { id: "generic-markdown", parserType: "generic-markdown", readerType: "file-glob" },
    ])
  })
})

describe("updateSourceRequestSchema", () => {
  it("does not inject create defaults when updating a source", () => {
    // Given
    const renamedPayload = { name: "Renamed" }
    const disabledPayload = { enabled: false }

    // When
    const renamedResult = updateSourceRequestSchema.parse(renamedPayload)
    const disabledResult = updateSourceRequestSchema.parse(disabledPayload)

    // Then
    expect(renamedResult).toEqual(renamedPayload)
    expect(disabledResult).toEqual(disabledPayload)
    expect(renamedResult).not.toHaveProperty("enabled")
    expect(renamedResult).not.toHaveProperty("scanIntervalSeconds")
    expect(renamedResult).not.toHaveProperty("maxFileSizeBytes")
    expect(renamedResult).not.toHaveProperty("maxFilesPerScan")
    expect(renamedResult).not.toHaveProperty("followSymlinks")
  })

  it.each(invalidScanIntervalSeconds)(
    "rejects invalid scan interval seconds value %s when updating a source",
    (scanIntervalSeconds) => {
      // Given
      const payload = { scanIntervalSeconds }

      // When
      const result = updateSourceRequestSchema.safeParse(payload)

      // Then
      expect(result.success).toBe(false)
    },
  )
})
