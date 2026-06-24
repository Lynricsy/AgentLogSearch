import {
  type AgentSource,
  type CreateSourceRequest,
  type ParserType,
  SOURCE_PRESET_METADATA,
  SOURCE_SCAN_DEFAULTS,
  type SourcePreset,
  type SourcePresetMetadata,
  type SourcePresetMetadataId,
  type SourceReaderType,
  type UpdateSourceRequest,
} from "@agent-log-search/shared"

import { formatDisplayName } from "./display-labels"

export type SourceFormMode = "create" | "edit"

export type SourceFormState = {
  readonly enabled: boolean
  readonly fileGlob: string
  readonly name: string
  readonly parserType: ParserType
  readonly presetId: SourcePresetMetadataId
  readonly readerType: SourceReaderType
  readonly resumeTemplate: string
  readonly rootPath: string
  readonly scanIntervalSeconds: string
  readonly sourcePreset: SourcePreset
}

export type SourceFormErrors = Partial<Record<keyof SourceFormState, string>>

export type SourceScanState = {
  readonly message: string
  readonly tone: "success" | "danger" | "warning" | "neutral"
}

export function createFormStateFromPreset(preset: SourcePresetMetadata): SourceFormState {
  return {
    enabled: true,
    fileGlob: preset.fileGlob,
    name: "",
    parserType: preset.parserType,
    presetId: preset.id,
    readerType: preset.readerType,
    resumeTemplate: preset.resumeTemplate,
    rootPath: preset.rootPath,
    scanIntervalSeconds: String(SOURCE_SCAN_DEFAULTS.scanIntervalSeconds),
    sourcePreset: preset.sourcePreset,
  }
}

export function createFormStateFromSource(
  source: AgentSource,
  presets: readonly SourcePresetMetadata[],
): SourceFormState {
  const matchingPreset = presets.find(
    (preset) =>
      preset.sourcePreset === source.sourcePreset &&
      preset.parserType === source.parserType &&
      preset.readerType === source.readerType,
  )
  return {
    enabled: source.enabled,
    fileGlob: source.fileGlob,
    name: formatDisplayName(source.name, "未命名数据源"),
    parserType: source.parserType,
    presetId: matchingPreset?.id ?? "generic-jsonl",
    readerType: source.readerType,
    resumeTemplate: source.resumeTemplate,
    rootPath: source.rootPath,
    scanIntervalSeconds: String(source.scanIntervalSeconds),
    sourcePreset: source.sourcePreset,
  }
}

export function firstPreset(presets: readonly SourcePresetMetadata[]): SourcePresetMetadata {
  const first = presets[0]
  return first ?? SOURCE_PRESET_METADATA[0]
}

export function formStateToCreateRequest(state: SourceFormState): CreateSourceRequest {
  return {
    enabled: state.enabled,
    fileGlob: state.fileGlob.trim(),
    followSymlinks: SOURCE_SCAN_DEFAULTS.followSymlinks,
    maxFileSizeBytes: SOURCE_SCAN_DEFAULTS.maxFileSizeBytes,
    maxFilesPerScan: SOURCE_SCAN_DEFAULTS.maxFilesPerScan,
    name: state.name.trim(),
    parserType: state.parserType,
    readerType: state.readerType,
    resumeTemplate: state.resumeTemplate.trim(),
    rootPath: state.rootPath.trim(),
    scanIntervalSeconds: Number(state.scanIntervalSeconds),
    sourcePreset: state.sourcePreset,
  }
}

export function formStateToUpdateRequest(state: SourceFormState): UpdateSourceRequest {
  return {
    enabled: state.enabled,
    fileGlob: state.fileGlob.trim(),
    name: state.name.trim(),
    parserType: state.parserType,
    readerType: state.readerType,
    resumeTemplate: state.resumeTemplate.trim(),
    rootPath: state.rootPath.trim(),
    scanIntervalSeconds: Number(state.scanIntervalSeconds),
    sourcePreset: state.sourcePreset,
  }
}
