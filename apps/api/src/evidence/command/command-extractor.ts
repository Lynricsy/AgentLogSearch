import type { OperationKind } from "@agent-log-search/shared"
import type { ParsedToolCallEvent } from "../../parsers/parser-types.js"
import { readPath, readString } from "../../parsers/record-access.js"
import type { CanonicalToolKind, CommandFact } from "../evidence-types.js"
import { classifyCommand } from "./command-classifier.js"
import { tokenizeShellCommand } from "./shell-tokenizer.js"

const COMMAND_PATHS = [
  ["command"],
  ["cmd"],
  ["script"],
  ["shell_command"],
  ["input", "command"],
  ["arguments", "command"],
] as const

export function extractCommands(input: {
  readonly call: ParsedToolCallEvent
  readonly canonicalToolKind: CanonicalToolKind
}): readonly CommandFact[] {
  const rawCommands = commandCandidates(input.call.arguments, input.canonicalToolKind)
  return rawCommands.flatMap((rawCommand, commandIndex) =>
    commandToFacts(input.call, rawCommand, commandIndex),
  )
}

function commandCandidates(args: unknown, canonicalToolKind: CanonicalToolKind): readonly string[] {
  if (canonicalToolKind === "shell" && typeof args === "string") {
    return [args]
  }
  const values: string[] = []
  for (const path of COMMAND_PATHS) {
    const value = readPath(args, path)
    if (typeof value === "string" && value.trim().length > 0) {
      values.push(value)
    } else if (Array.isArray(value)) {
      values.push(...value.filter((entry): entry is string => typeof entry === "string"))
    }
  }
  const direct = readString(args, [["command"]])
  if (direct !== undefined) {
    values.push(direct)
  }
  return [...new Set(values)]
}

function commandToFacts(
  call: ParsedToolCallEvent,
  rawCommand: string,
  commandIndex: number,
): readonly CommandFact[] {
  const tokenizeResult = tokenizeShellCommand(rawCommand)
  return tokenizeResult.segments.map((segment, segmentIndex) => {
    const normalized = normalizeCommandSegment(segment.tokens)
    const classification = classifyCommand(normalized.tokens)
    return optionalFields(
      {
        sourceEventKey: `${call.sourceEventKey}:command:${commandIndex.toString()}:${segmentIndex.toString()}`,
        rawCommand: segment.raw,
        normalizedCommand: normalized.tokens.join(" "),
        tokens: normalized.tokens,
        family: classification.family,
        operationKind: classification.operationKind,
        scope: classification.scope,
        segmentIndex,
        warnings: tokenizeResult.warnings,
      },
      normalized.cwdOverride,
      classification.scriptName,
    )
  })
}

function normalizeCommandSegment(tokens: readonly string[]): {
  readonly tokens: readonly string[]
  readonly cwdOverride?: string
} {
  const withoutEnv = dropEnvAssignments(tokens)
  if (withoutEnv[0] === "cd" && withoutEnv[1] !== undefined) {
    const operatorIndex = withoutEnv.findIndex((token) => token === "&&" || token === ";")
    if (operatorIndex > 1) {
      return { tokens: withoutEnv.slice(operatorIndex + 1), cwdOverride: withoutEnv[1] }
    }
  }
  return { tokens: withoutEnv }
}

function dropEnvAssignments(tokens: readonly string[]): readonly string[] {
  let index = 0
  while (index < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=[^$`(]*$/.test(tokens[index] ?? "")) {
    index += 1
  }
  return tokens.slice(index)
}

function optionalFields(
  base: Omit<CommandFact, "cwdOverride" | "scriptName">,
  cwdOverride: string | undefined,
  scriptName: string | undefined,
): CommandFact {
  const withCwd = cwdOverride === undefined ? base : { ...base, cwdOverride }
  return scriptName === undefined ? withCwd : { ...withCwd, scriptName }
}

export function dominantOperationKind(commands: readonly CommandFact[]): OperationKind {
  return commands[0]?.operationKind ?? "OTHER"
}
