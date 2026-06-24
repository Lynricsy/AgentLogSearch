import type { ParsedSession, ParsedTraceEvent } from "../parsers/index.js"
import { EvidencePipelineService } from "./evidence-pipeline.service.js"

describe("EvidencePipelineService", () => {
  it("extracts command, process, test, error, path, patch and redacted excerpt", () => {
    const session = makeSession([
      {
        kind: "user_message",
        sourceEventKey: "user-0",
        sequence: 0,
        subSequence: 0,
        rawPointer: { sourcePath: "fixture.jsonl", lineNumber: 1 },
        text: "修复 TypeScript 测试",
      },
      {
        kind: "tool_call",
        sourceEventKey: "call-1",
        sequence: 1,
        subSequence: 0,
        callId: "call-1",
        toolName: "exec_command",
        rawPointer: { sourcePath: "fixture.jsonl", lineNumber: 2 },
        arguments: { command: "pnpm --filter api test src/foo.spec.ts" },
      },
      {
        kind: "tool_result",
        sourceEventKey: "result-1",
        sequence: 2,
        subSequence: 0,
        callId: "call-1",
        rawPointer: { sourcePath: "fixture.jsonl", lineNumber: 3 },
        result: {
          exitCode: 1,
          status: "failed",
          text: [
            "FAIL apps/api/src/foo.spec.ts",
            "TypeError: Cannot read properties of undefined",
            "    at run (/repo/apps/api/src/foo.ts:12:3)",
            "Test Suites: 1 failed, 1 total",
            "Tests:       2 failed, 3 passed, 5 total",
            "Process exited with code 1",
            "SECRET_TOKEN=super-secret",
          ].join("\n"),
        },
      },
      {
        kind: "tool_call",
        sourceEventKey: "call-2",
        sequence: 3,
        subSequence: 0,
        callId: "call-2",
        toolName: "apply_patch",
        rawPointer: { sourcePath: "fixture.jsonl", lineNumber: 4 },
        arguments: {
          patch: [
            "*** Begin Patch",
            "*** Update File: apps/api/src/foo.ts",
            "@@",
            "-const a = 1",
            "+const a = 2",
            "*** End Patch",
          ].join("\n"),
        },
      },
      {
        kind: "tool_result",
        sourceEventKey: "result-2",
        sequence: 4,
        subSequence: 0,
        callId: "call-2",
        rawPointer: { sourcePath: "fixture.jsonl", lineNumber: 5 },
        result: { status: "success", text: "Done" },
      },
    ])
    const pipeline = new EvidencePipelineService()

    const events = pipeline.processSession(session, {
      cwd: "/repo",
      repositoryRoot: "/repo",
      maxErrorsPerEvent: 20,
      maxExcerptChars: 2_000,
      maxPathsPerEvent: 100,
      maxToolOutputChars: 2_000_000,
    })

    const testEvent = events.find((event) => event.sourceEventKey === "call-1")
    const patchEvent = events.find((event) => event.sourceEventKey === "call-2")

    expect(testEvent).toMatchObject({
      eventKind: "TOOL_EXECUTION",
      operationKind: "TEST",
      pairingQuality: "EXACT",
      commandFamilies: ["test"],
      errorCodes: [],
    })
    expect(testEvent?.facts.commands?.[0]).toMatchObject({
      family: "test",
      scope: "targeted",
      normalizedCommand: "pnpm --filter api test src/foo.spec.ts",
    })
    expect(testEvent?.facts.processResult).toMatchObject({ exitCode: 1, status: "failed" })
    expect(testEvent?.facts.testSummary).toMatchObject({
      framework: "jest",
      failed: 2,
      passed: 3,
      status: "failed",
    })
    expect(testEvent?.facts.errors?.[0]).toMatchObject({ type: "TypeError" })
    expect(testEvent?.pathTokens).toContain("apps/api/src/foo.spec.ts")
    expect(testEvent?.redactedExcerpt).toContain("<redacted:env-secret>")
    expect(JSON.stringify(testEvent)).not.toContain("super-secret")

    expect(patchEvent?.operationKind).toBe("OTHER")
    expect(patchEvent?.facts.patch?.files[0]).toMatchObject({
      path: "apps/api/src/foo.ts",
      operation: "update",
      addedLines: 1,
      deletedLines: 1,
    })
  })

  it("does not treat assistant text as validation evidence", () => {
    const session = makeSession([
      {
        kind: "assistant_message",
        sourceEventKey: "assistant-0",
        sequence: 0,
        subSequence: 0,
        rawPointer: { sourcePath: "fixture.jsonl", lineNumber: 1 },
        text: "测试已经全部通过",
      },
    ])

    const events = new EvidencePipelineService().processSession(session, {
      cwd: "/repo",
      repositoryRoot: "/repo",
      maxErrorsPerEvent: 20,
      maxExcerptChars: 2_000,
      maxPathsPerEvent: 100,
      maxToolOutputChars: 2_000_000,
    })

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      eventKind: "ASSISTANT_MESSAGE",
      operationKind: "NONE",
      commandFamilies: [],
      errorCodes: [],
    })
  })
})

function makeSession(traceEvents: readonly ParsedTraceEvent[]): ParsedSession {
  return {
    parserType: "generic-jsonl",
    sourcePath: "fixture.jsonl",
    threadId: "thread",
    cwd: "/repo",
    title: null,
    model: null,
    startedAt: null,
    updatedAt: null,
    messages: [],
    traceEvents,
  }
}
