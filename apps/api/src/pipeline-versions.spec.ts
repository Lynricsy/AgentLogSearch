import {
  EVIDENCE_EXTRACTOR_VERSION,
  EXPERIENCE_BUILDER_VERSION,
  EXPERIENCE_SEARCH_DOCUMENT_VERSION,
  TRACE_PARSER_VERSION,
} from "./pipeline-versions.js"

describe("pipeline version constants", () => {
  it("pins the first evidence edition parser and search document versions", () => {
    expect({
      TRACE_PARSER_VERSION,
      EVIDENCE_EXTRACTOR_VERSION,
      EXPERIENCE_BUILDER_VERSION,
      EXPERIENCE_SEARCH_DOCUMENT_VERSION,
    }).toEqual({
      TRACE_PARSER_VERSION: "trace-v1",
      EVIDENCE_EXTRACTOR_VERSION: "evidence-v1",
      EXPERIENCE_BUILDER_VERSION: "experience-v1",
      EXPERIENCE_SEARCH_DOCUMENT_VERSION: "experience-search-v2",
    })
  })
})
