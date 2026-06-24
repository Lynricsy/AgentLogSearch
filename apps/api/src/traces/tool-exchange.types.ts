import type { ParsedToolCallEvent, ParsedToolResultEvent } from "../parsers/index.js"

export type ToolExchangePairingQuality = "exact" | "inferred" | "missing"

export type ToolExchange = {
  readonly call: ParsedToolCallEvent
  readonly result?: ParsedToolResultEvent
  readonly pairingQuality: ToolExchangePairingQuality
  readonly warnings: readonly string[]
}
