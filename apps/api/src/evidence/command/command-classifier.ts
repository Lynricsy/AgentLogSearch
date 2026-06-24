import type { OperationKind } from "@agent-log-search/shared"
import type { CommandFamily, ValidationScope } from "../evidence-types.js"

export type CommandClassification = {
  readonly family: CommandFamily
  readonly operationKind: OperationKind
  readonly scope: ValidationScope
  readonly scriptName?: string
}

const PACKAGE_MANAGERS = new Set(["pnpm", "npm", "yarn", "bun"])
const TEST_RUNNERS = new Set(["jest", "vitest", "pytest"])

export function classifyCommand(tokens: readonly string[]): CommandClassification {
  const normalizedTokens = normalizeWrapperTokens(tokens)
  const command = normalizedTokens[0] ?? ""
  const scriptName = detectScriptName(normalizedTokens)
  const family = detectFamily(command, normalizedTokens, scriptName)
  return optionalScriptName(
    {
      family,
      operationKind: toOperationKind(family),
      scope: detectScope(normalizedTokens, family),
    },
    scriptName,
  )
}

export function normalizeWrapperTokens(tokens: readonly string[]): readonly string[] {
  const withoutEnv = dropEnvAssignments(tokens)
  if (withoutEnv[0] === "cd" && withoutEnv[2] === "&&") {
    return withoutEnv.slice(3)
  }
  return withoutEnv
}

function dropEnvAssignments(tokens: readonly string[]): readonly string[] {
  let index = 0
  while (index < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=[^$`(]*$/.test(tokens[index] ?? "")) {
    index += 1
  }
  return tokens.slice(index)
}

function detectFamily(
  command: string,
  tokens: readonly string[],
  scriptName: string | undefined,
): CommandFamily {
  if (isTestCommand(command, tokens, scriptName)) return "test"
  if (isBuildCommand(command, tokens, scriptName)) return "build"
  if (isTypecheckCommand(command, tokens, scriptName)) return "typecheck"
  if (isLintCommand(command, tokens, scriptName)) return "lint"
  if (command === "git") return "git"
  if (isPackageChangeCommand(command, tokens)) return "package"
  if (command.length > 0) return "run"
  return "other"
}

function isTestCommand(
  command: string,
  tokens: readonly string[],
  scriptName: string | undefined,
): boolean {
  if (command === "cargo" && tokens[1] === "test") return true
  if (command === "go" && tokens[1] === "test") return true
  if (TEST_RUNNERS.has(command)) return true
  if (scriptName !== undefined && /^test(:|$)|^spec(:|$)/.test(scriptName)) return true
  return PACKAGE_MANAGERS.has(command) && tokens.includes("test")
}

function isBuildCommand(
  command: string,
  tokens: readonly string[],
  scriptName: string | undefined,
): boolean {
  return (
    scriptName === "build" ||
    (PACKAGE_MANAGERS.has(command) && tokens.includes("build")) ||
    (command === "next" && tokens[1] === "build") ||
    (command === "tsc" && tokens.includes("-b"))
  )
}

function isTypecheckCommand(
  command: string,
  tokens: readonly string[],
  scriptName: string | undefined,
): boolean {
  return (
    scriptName === "typecheck" ||
    (PACKAGE_MANAGERS.has(command) && tokens.includes("typecheck")) ||
    (command === "tsc" && tokens.includes("--noEmit"))
  )
}

function isLintCommand(
  command: string,
  tokens: readonly string[],
  scriptName: string | undefined,
): boolean {
  return (
    scriptName === "lint" ||
    (PACKAGE_MANAGERS.has(command) && tokens.includes("lint")) ||
    command === "eslint" ||
    (command === "biome" && tokens[1] === "check")
  )
}

function isPackageChangeCommand(command: string, tokens: readonly string[]): boolean {
  if (!PACKAGE_MANAGERS.has(command)) return false
  const action = tokens.find((token) => !token.startsWith("-") && token !== command)
  return (
    action === "add" ||
    action === "remove" ||
    action === "update" ||
    action === "install" ||
    action === "uninstall"
  )
}

function detectScriptName(tokens: readonly string[]): string | undefined {
  const command = tokens[0]
  if (command === "npm" && tokens[1] === "run") return tokens[2]
  if (command === "pnpm" && tokens.includes("run")) {
    const runIndex = tokens.indexOf("run")
    return tokens[runIndex + 1]
  }
  return undefined
}

function detectScope(tokens: readonly string[], family: CommandFamily): ValidationScope {
  if (family !== "test") {
    return "unknown"
  }
  if (
    tokens.some(
      (token) =>
        token === "-t" ||
        token === "--testNamePattern" ||
        token === "--filter" ||
        token.startsWith("--filter=") ||
        isRepositoryPathToken(token),
    )
  ) {
    return "targeted"
  }
  return "full"
}

function isRepositoryPathToken(token: string): boolean {
  return (
    /[\\/]/.test(token) ||
    /\.(spec|test|ts|tsx|js|jsx|mjs|cjs|json|md)$/i.test(token) ||
    token.startsWith(".")
  )
}

function toOperationKind(family: CommandFamily): OperationKind {
  switch (family) {
    case "test":
      return "TEST"
    case "build":
      return "BUILD"
    case "typecheck":
      return "TYPECHECK"
    case "lint":
      return "LINT"
    case "git":
      return "GIT"
    case "package":
      return "PACKAGE_CHANGE"
    case "run":
      return "SHELL"
    case "other":
      return "OTHER"
  }
}

function optionalScriptName(
  classification: Omit<CommandClassification, "scriptName">,
  scriptName: string | undefined,
): CommandClassification {
  return scriptName === undefined ? classification : { ...classification, scriptName }
}
