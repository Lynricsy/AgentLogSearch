import type {
  ParsedToolCallEvent,
  ParsedToolResultEvent,
  ParsedTraceEvent,
} from "../parsers/index.js"
import type { ToolExchange } from "./tool-exchange.types.js"

const MAX_EVENT_DISTANCE = 20

export function assembleToolExchanges(
  events: readonly ParsedTraceEvent[],
): readonly ToolExchange[] {
  const calls = events.filter(isToolCallEvent)
  const results = events.filter(isToolResultEvent)
  const usedResults = new Set<ParsedToolResultEvent>()
  const duplicateCallIds = duplicateIds(calls)
  const duplicateResultIds = duplicateIds(results)

  return calls.map((call) => {
    const warnings: string[] = []
    if (call.callId !== undefined && duplicateCallIds.has(call.callId)) {
      warnings.push("DUPLICATE_TOOL_CALL_ID")
    }
    const exact = findExactResult(call, results, usedResults, duplicateResultIds, warnings)
    if (exact !== undefined) {
      usedResults.add(exact)
      return { call, result: exact, pairingQuality: "exact", warnings }
    }
    const inferred = findInferredResult(call, events, results, usedResults)
    if (inferred !== undefined) {
      usedResults.add(inferred)
      return { call, result: inferred, pairingQuality: "inferred", warnings }
    }
    return { call, pairingQuality: "missing", warnings }
  })
}

function findExactResult(
  call: ParsedToolCallEvent,
  results: readonly ParsedToolResultEvent[],
  usedResults: ReadonlySet<ParsedToolResultEvent>,
  duplicateResultIds: ReadonlySet<string>,
  warnings: string[],
): ParsedToolResultEvent | undefined {
  if (call.callId === undefined) {
    return undefined
  }
  const matches = results.filter(
    (result) =>
      !usedResults.has(result) &&
      result.callId === call.callId &&
      compareEventPosition(result, call) > 0,
  )
  if (matches.length === 0) {
    return undefined
  }
  if (duplicateResultIds.has(call.callId)) {
    warnings.push("DUPLICATE_TOOL_RESULT_ID")
  }
  return [...matches].sort((left, right) => compareEventDistance(call, left, right))[0]
}

function findInferredResult(
  call: ParsedToolCallEvent,
  events: readonly ParsedTraceEvent[],
  results: readonly ParsedToolResultEvent[],
  usedResults: ReadonlySet<ParsedToolResultEvent>,
): ParsedToolResultEvent | undefined {
  if (call.callId !== undefined) {
    return undefined
  }
  const candidates = results.filter(
    (result) =>
      !usedResults.has(result) &&
      result.callId === undefined &&
      compareEventPosition(result, call) > 0 &&
      eventDistance(call, result) <= MAX_EVENT_DISTANCE &&
      !hasUserMessageBetween(events, call, result) &&
      (result.toolName === undefined || result.toolName === call.toolName),
  )
  return [...candidates].sort((left, right) => compareEventDistance(call, left, right))[0]
}

function hasUserMessageBetween(
  events: readonly ParsedTraceEvent[],
  call: ParsedToolCallEvent,
  result: ParsedToolResultEvent,
): boolean {
  return events.some(
    (event) =>
      event.kind === "user_message" &&
      compareEventPosition(event, call) > 0 &&
      compareEventPosition(result, event) > 0,
  )
}

function duplicateIds(
  events: readonly (ParsedToolCallEvent | ParsedToolResultEvent)[],
): ReadonlySet<string> {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const event of events) {
    if (event.callId === undefined) {
      continue
    }
    if (seen.has(event.callId)) {
      duplicates.add(event.callId)
    }
    seen.add(event.callId)
  }
  return duplicates
}

function compareEventDistance(
  call: ParsedToolCallEvent,
  left: ParsedToolResultEvent,
  right: ParsedToolResultEvent,
): number {
  return eventDistance(call, left) - eventDistance(call, right)
}

function eventDistance(left: ParsedTraceEvent, right: ParsedTraceEvent): number {
  return Math.abs(compareEventPosition(left, right))
}

function compareEventPosition(left: ParsedTraceEvent, right: ParsedTraceEvent): number {
  return left.sequence === right.sequence
    ? left.subSequence - right.subSequence
    : left.sequence - right.sequence
}

function isToolCallEvent(event: ParsedTraceEvent): event is ParsedToolCallEvent {
  return event.kind === "tool_call"
}

function isToolResultEvent(event: ParsedTraceEvent): event is ParsedToolResultEvent {
  return event.kind === "tool_result"
}
