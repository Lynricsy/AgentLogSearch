import type {
  ParsedToolCallEvent,
  ParsedToolResultEvent,
  ParsedTraceEvent,
} from "../parsers/index.js"
import { assembleToolExchanges } from "./tool-exchange-assembler.js"

describe("assembleToolExchanges", () => {
  it("pairs exact call ids after the call", () => {
    const exchanges = assembleToolExchanges([call(1, "call-1"), result(2, "call-1")])

    expect(exchanges).toHaveLength(1)
    expect(exchanges[0]).toMatchObject({ pairingQuality: "exact" })
    expect(exchanges[0]?.result?.callId).toBe("call-1")
  })

  it("ignores results that appear before the call", () => {
    const exchanges = assembleToolExchanges([result(1, "call-1"), call(2, "call-1")])

    expect(exchanges[0]).toMatchObject({ pairingQuality: "missing" })
  })

  it("warns when duplicate result ids exist and chooses the nearest result", () => {
    const exchanges = assembleToolExchanges([
      call(1, "call-1"),
      result(3, "call-1"),
      result(2, "call-1"),
    ])

    expect(exchanges[0]?.warnings).toContain("DUPLICATE_TOOL_RESULT_ID")
    expect(exchanges[0]?.result?.sequence).toBe(2)
  })

  it("warns when duplicate call ids exist", () => {
    const exchanges = assembleToolExchanges([
      call(1, "call-1"),
      call(2, "call-1"),
      result(3, "call-1"),
    ])

    expect(exchanges[0]?.warnings).toContain("DUPLICATE_TOOL_CALL_ID")
    expect(exchanges[1]?.warnings).toContain("DUPLICATE_TOOL_CALL_ID")
  })

  it("infers nearest no-id result without crossing a user message", () => {
    const exchanges = assembleToolExchanges([call(1), result(3)])

    expect(exchanges[0]).toMatchObject({ pairingQuality: "inferred" })
    expect(exchanges[0]?.result?.sequence).toBe(3)
  })

  it("does not infer across a user message", () => {
    const exchanges = assembleToolExchanges([call(1), user(2), result(3)])

    expect(exchanges[0]).toMatchObject({ pairingQuality: "missing" })
  })

  it("does not reuse a result for multiple calls", () => {
    const exchanges = assembleToolExchanges([call(1), call(2), result(3)])

    expect(exchanges.map((exchange) => exchange.pairingQuality)).toEqual(["inferred", "missing"])
  })

  it("does not infer when tool names disagree", () => {
    const exchanges = assembleToolExchanges([
      call(1, undefined, "Bash"),
      result(2, undefined, "Grep"),
    ])

    expect(exchanges[0]).toMatchObject({ pairingQuality: "missing" })
  })
})

function call(sequence: number, callId?: string, toolName = "Bash"): ParsedToolCallEvent {
  return {
    kind: "tool_call",
    sourceEventKey: `call-${sequence.toString()}`,
    sequence,
    subSequence: 0,
    rawPointer: { sourcePath: "fixture.jsonl", lineNumber: sequence },
    ...(callId === undefined ? {} : { callId }),
    toolName,
    arguments: {},
  }
}

function result(sequence: number, callId?: string, toolName = "Bash"): ParsedToolResultEvent {
  return {
    kind: "tool_result",
    sourceEventKey: `result-${sequence.toString()}`,
    sequence,
    subSequence: 0,
    rawPointer: { sourcePath: "fixture.jsonl", lineNumber: sequence },
    ...(callId === undefined ? {} : { callId }),
    toolName,
    result: { status: "success" },
  }
}

function user(sequence: number): ParsedTraceEvent {
  return {
    kind: "user_message",
    sourceEventKey: `user-${sequence.toString()}`,
    sequence,
    subSequence: 0,
    rawPointer: { sourcePath: "fixture.jsonl", lineNumber: sequence },
    text: "next task",
  }
}
