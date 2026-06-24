import {
  DEFAULT_EVIDENCE_MAX_ERRORS_PER_EVENT,
  DEFAULT_EVIDENCE_MAX_EXCERPT_CHARS,
  DEFAULT_EVIDENCE_MAX_PATHS_PER_EVENT,
  DEFAULT_EVIDENCE_MAX_TOOL_OUTPUT_CHARS,
  EvidenceConfigError,
  readEvidenceConfig,
} from "./evidence.config.js"

describe("readEvidenceConfig", () => {
  it("defaults the M0 evidence pipeline switches to disabled", () => {
    expect(readEvidenceConfig({})).toEqual({
      pipelineEnabled: false,
      repositoryCompatibilityEnabled: false,
      maxToolOutputChars: DEFAULT_EVIDENCE_MAX_TOOL_OUTPUT_CHARS,
      maxExcerptChars: DEFAULT_EVIDENCE_MAX_EXCERPT_CHARS,
      maxErrorsPerEvent: DEFAULT_EVIDENCE_MAX_ERRORS_PER_EVENT,
      maxPathsPerEvent: DEFAULT_EVIDENCE_MAX_PATHS_PER_EVENT,
    })
  })

  it("parses explicit boolean and bounded numeric overrides", () => {
    expect(
      readEvidenceConfig({
        EVIDENCE_MAX_ERRORS_PER_EVENT: "7",
        EVIDENCE_MAX_EXCERPT_CHARS: "1500",
        EVIDENCE_MAX_PATHS_PER_EVENT: "55",
        EVIDENCE_MAX_TOOL_OUTPUT_CHARS: "500000",
        EVIDENCE_PIPELINE_ENABLED: "true",
        REPOSITORY_COMPATIBILITY_ENABLED: "1",
      }),
    ).toEqual({
      pipelineEnabled: true,
      repositoryCompatibilityEnabled: true,
      maxToolOutputChars: 500_000,
      maxExcerptChars: 1_500,
      maxErrorsPerEvent: 7,
      maxPathsPerEvent: 55,
    })
  })

  it("fails fast for invalid boolean values", () => {
    expect(() => readEvidenceConfig({ EVIDENCE_PIPELINE_ENABLED: "maybe" })).toThrow(
      EvidenceConfigError,
    )
  })

  it("fails fast for numeric values outside the supported bounds", () => {
    expect(() => readEvidenceConfig({ EVIDENCE_MAX_EXCERPT_CHARS: "99" })).toThrow(
      EvidenceConfigError,
    )
    expect(() => readEvidenceConfig({ EVIDENCE_MAX_ERRORS_PER_EVENT: "2.5" })).toThrow(
      EvidenceConfigError,
    )
  })
})
