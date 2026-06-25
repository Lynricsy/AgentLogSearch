export const TRACE_PARSER_VERSION = "trace-v1"
export const EVIDENCE_EXTRACTOR_VERSION = "evidence-v1"
export const EXPERIENCE_BUILDER_VERSION = "experience-v1"
export const EXPERIENCE_SEARCH_DOCUMENT_VERSION = "experience-search-v2"

export function evidenceExtractorVersionFor(pipelineEnabled: boolean): string {
  return `${EVIDENCE_EXTRACTOR_VERSION}:${pipelineEnabled ? "enabled" : "disabled"}`
}
