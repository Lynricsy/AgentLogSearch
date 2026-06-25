import { buildAttempts } from "./attempt-builder.js"
import { segmentEpisodes } from "./episode-segmenter.js"
import type { ExperienceTraceEvent } from "./experience.types.js"
import { buildExperiences } from "./experience-builder.js"

describe("segmentEpisodes", () => {
  it("uses real user messages and continuation whitelist", () => {
    const episodes = segmentEpisodes([
      user(0, "修复登录测试"),
      assistant(1, "working"),
      user(2, "继续"),
      user(3, "新增搜索页面"),
    ])

    expect(episodes).toHaveLength(2)
    expect(episodes[0]?.taskText).toBe("修复登录测试")
    expect(episodes[0]?.events.map((event) => event.seqNo)).toEqual([0, 1, 2])
    expect(episodes[1]?.taskText).toBe("新增搜索页面")
  })
})

describe("buildAttempts", () => {
  it("keeps pre-mutation failed validation as observation before the first attempt", () => {
    const episode = segmentEpisodes([
      user(0, "修复 TS 错误"),
      validation(1, "test-before", "failed"),
      mutation(2, "patch-1", ["apps/api/src/foo.ts"]),
    ])[0]

    expect(episode).toBeDefined()
    if (episode === undefined) {
      throw new Error("missing episode")
    }
    const attempts = buildAttempts(episode)

    expect(attempts).toHaveLength(1)
    expect(attempts[0]).toMatchObject({
      outcome: "UNVERIFIED",
      errorBefore: ["err-test-before"],
      reasonCodes: ["NO_POST_MUTATION_VALIDATION"],
    })
  })

  it("splits attempts when a new mutation follows validation", () => {
    const episode = segmentEpisodes([
      user(0, "修复测试"),
      mutation(1, "patch-1", ["apps/api/src/foo.ts"]),
      validation(2, "test-1", "failed"),
      mutation(3, "patch-2", ["apps/api/src/foo.ts"]),
      validation(4, "test-2", "succeeded"),
    ])[0]

    if (episode === undefined) {
      throw new Error("missing episode")
    }
    const attempts = buildAttempts(episode)

    expect(attempts.map((attempt) => attempt.outcome)).toEqual(["FAILED", "SUCCEEDED"])
    expect(attempts[0]?.evidenceLinks.map((link) => link.role)).toEqual(["MUTATION", "VALIDATION"])
    expect(attempts[1]?.errorBefore).toEqual(["err-test-1"])
  })
})

describe("buildExperiences", () => {
  it("builds a change experience with deterministic summary and search text", () => {
    const experiences = buildExperiences({
      cwd: "/repo",
      sourceRevision: 3,
      events: [
        user(0, "修复 API TypeError"),
        mutation(1, "patch-1", ["apps/api/src/foo.ts"]),
        validation(2, "test-1", "succeeded"),
      ],
    })

    expect(experiences).toHaveLength(1)
    expect(experiences[0]).toMatchObject({
      kind: "change",
      outcome: "SUCCEEDED",
      failedAttemptCount: 0,
      successfulAttemptCount: 1,
      sourceRevision: 3,
    })
    expect(experiences[0]?.title).toContain("foo.ts")
    expect(experiences[0]?.templateSummary).toContain("验证通过")
    expect(experiences[0]?.searchText).toContain("修复 API TypeError")
    expect(experiences[0]?.evidenceScore).toBeGreaterThanOrEqual(0.5)
  })

  it("builds diagnostic experience when there is evidence without mutation", () => {
    const experiences = buildExperiences({
      cwd: "/repo",
      sourceRevision: 1,
      events: [user(0, "诊断失败"), validation(1, "test-before", "failed")],
    })

    expect(experiences).toHaveLength(1)
    expect(experiences[0]).toMatchObject({
      kind: "diagnostic",
      outcome: "UNKNOWN",
      failedAttemptCount: 0,
    })
  })

  it("adds diagnostic excerpts to the search document for fuzzy error search", () => {
    const experiences = buildExperiences({
      cwd: "/repo",
      sourceRevision: 1,
      events: [
        user(0, "这是怎么了"),
        assistant(1, "Invalid `historyFile.findUnique()` invocation in scanner-file-runner Prisma"),
        mutation(2, "patch-1", ["apps/api/src/scanner/scanner-file-runner.ts"]),
        validation(3, "test-1", "succeeded"),
      ],
    })

    expect(experiences).toHaveLength(1)
    expect(experiences[0]?.searchText).toContain("diagnostic excerpts:")
    expect(experiences[0]?.searchText).toContain("historyFile.findUnique")
    expect(experiences[0]?.searchText).toContain("scanner-file-runner")
    expect(experiences[0]?.searchText).toContain("Prisma")
  })
})

function user(seqNo: number, text: string): ExperienceTraceEvent {
  return event({
    sourceEventKey: `user-${seqNo.toString()}`,
    seqNo,
    eventKind: "USER_MESSAGE",
    redactedExcerpt: text,
  })
}

function assistant(seqNo: number, text: string): ExperienceTraceEvent {
  return event({
    sourceEventKey: `assistant-${seqNo.toString()}`,
    seqNo,
    eventKind: "ASSISTANT_MESSAGE",
    redactedExcerpt: text,
  })
}

function mutation(
  seqNo: number,
  sourceEventKey: string,
  pathTokens: readonly string[],
): ExperienceTraceEvent {
  return event({
    sourceEventKey,
    seqNo,
    eventKind: "TOOL_EXECUTION",
    operationKind: "FILE_PATCH",
    pathTokens,
    facts: { patch: { files: pathTokens.map((path) => ({ path, operation: "update" })) } },
  })
}

function validation(
  seqNo: number,
  sourceEventKey: string,
  status: "succeeded" | "failed",
): ExperienceTraceEvent {
  return event({
    sourceEventKey,
    seqNo,
    eventKind: "TOOL_EXECUTION",
    operationKind: "TEST",
    commandFamilies: ["test"],
    errorSignatures: status === "failed" ? [`err-${sourceEventKey}`] : [],
    errorCodes: status === "failed" ? ["TS2339"] : [],
    facts: {
      commands: [{ family: "test", operationKind: "TEST", scope: "targeted" }],
      processResult: { status, exitCode: status === "succeeded" ? 0 : 1 },
      testSummary: { status, failed: status === "failed" ? 1 : 0, passed: 3 },
      errors:
        status === "failed"
          ? [
              {
                code: "TS2339",
                strictFingerprint: `err-${sourceEventKey}`,
                normalizedMessage: "TS2339 bad property",
              },
            ]
          : [],
    },
  })
}

function event(
  input: Partial<ExperienceTraceEvent> & {
    readonly sourceEventKey: string
    readonly seqNo: number
    readonly eventKind: ExperienceTraceEvent["eventKind"]
  },
): ExperienceTraceEvent {
  return {
    sourceEventKey: input.sourceEventKey,
    seqNo: input.seqNo,
    subSeqNo: input.subSeqNo ?? 0,
    eventKind: input.eventKind,
    operationKind: input.operationKind ?? "NONE",
    pairingQuality: input.pairingQuality ?? "EXACT",
    facts: input.facts ?? {},
    pathTokens: input.pathTokens ?? [],
    errorSignatures: input.errorSignatures ?? [],
    errorCodes: input.errorCodes ?? [],
    commandFamilies: input.commandFamilies ?? [],
    redactedExcerpt: input.redactedExcerpt ?? null,
    rawPointer: { sourcePath: "fixture.jsonl", lineNumber: input.seqNo + 1 },
  }
}
