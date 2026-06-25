import { classifyCommand } from "../evidence/command/command-classifier.js"
import { tokenizeShellCommand } from "../evidence/command/shell-tokenizer.js"
import { normalizeErrorText } from "../evidence/errors/error-normalizer.js"

export type ExperienceQueryFeatures = {
  readonly query: string
  readonly lexicalText: string
  readonly errorCodes: readonly string[]
  readonly errorTextTokens: readonly string[]
  readonly pathTokens: readonly string[]
  readonly symbolTokens: readonly string[]
  readonly commandFamilies: readonly string[]
}

const ERROR_CODE_PATTERN = /\b(?:TS\d{4}|SQLSTATE\s*[0-9A-Z]{5}|HTTP\/?\s*[45]\d\d)\b/gi
const ASCII_TOKEN_PATTERN = /\b[A-Za-z_][A-Za-z0-9_.:-]{1,}\b/g
const PATH_PATTERN = /(?:\.{0,2}\/)?[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+/g
const CODE_MODULE_HINTS = new Set([
  "api",
  "builder",
  "controller",
  "database",
  "embedding",
  "experience",
  "importer",
  "migration",
  "parser",
  "pipeline",
  "prisma",
  "repository",
  "runner",
  "scanner",
  "schema",
  "search",
  "service",
  "session",
  "store",
  "worker",
])
const PATH_ALIASES: Readonly<Record<string, readonly string[]>> = {
  migration: ["prisma/migrations"],
  migrations: ["prisma/migrations"],
  prisma: ["prisma/schema.prisma", "schema.prisma"],
  schema: ["schema.prisma", "prisma/schema.prisma"],
}

export function extractExperienceQueryFeatures(input: {
  readonly query: string
  readonly errorText?: string | undefined
  readonly files?: readonly string[] | undefined
  readonly symbols?: readonly string[] | undefined
}): ExperienceQueryFeatures {
  const query = input.query.trim()
  const normalizedError = input.errorText
    ? normalizeErrorText({ value: input.errorText })
    : undefined
  const errorCodes = unique([
    ...matchAll(query, ERROR_CODE_PATTERN),
    ...(normalizedError === undefined ? [] : matchAll(normalizedError, ERROR_CODE_PATTERN)),
  ])
  const pathTokens = unique([
    ...(input.files ?? []).flatMap(expandPathTokens),
    ...matchAll(query, PATH_PATTERN).flatMap(expandPathTokens),
    ...extractImplicitPathTokens(query),
  ])
  const symbolTokens = unique([...(input.symbols ?? []), ...extractSymbolLikeTokens(query)])
  const commandFamilies = unique(detectCommandFamilies(query))
  const errorTextTokens =
    normalizedError === undefined ? [] : unique(extractSymbolLikeTokens(normalizedError))
  const lexicalText = unique([
    ...errorCodes,
    ...pathTokens,
    ...symbolTokens,
    ...commandFamilies,
    ...errorTextTokens,
    ...extractSymbolLikeTokens(query),
  ]).join(" ")

  return {
    query,
    lexicalText,
    errorCodes,
    errorTextTokens,
    pathTokens,
    symbolTokens,
    commandFamilies,
  }
}

export function extractFailedAttemptCheckFeatures(input: {
  readonly task: string
  readonly files?: readonly string[] | undefined
  readonly symbols?: readonly string[] | undefined
  readonly operationKinds?: readonly string[] | undefined
  readonly plannedCommand?: string | undefined
}): ExperienceQueryFeatures & {
  readonly operationKinds: readonly string[]
  readonly actionTokens: readonly string[]
} {
  const plannedCommand = input.plannedCommand?.trim()
  const plannedCommandFamilies =
    plannedCommand === undefined || plannedCommand.length === 0
      ? []
      : commandFamiliesFromCommand(plannedCommand)
  const operationKindFamilies = commandFamiliesFromOperationKinds(input.operationKinds ?? [])
  const features = extractExperienceQueryFeatures({
    query: [input.task, plannedCommand]
      .filter((value): value is string => value !== undefined)
      .join(" "),
    files: input.files,
    symbols: input.symbols,
  })
  const actionTokens = unique([
    ...extractSymbolLikeTokens(input.task),
    ...(input.symbols ?? []),
    ...plannedCommandFamilies,
    ...operationKindFamilies,
  ])
  return {
    ...features,
    commandFamilies: unique([
      ...features.commandFamilies,
      ...plannedCommandFamilies,
      ...operationKindFamilies,
    ]),
    operationKinds: unique(input.operationKinds ?? []),
    actionTokens,
  }
}

function expandPathTokens(value: string): readonly string[] {
  const cleaned = value
    .trim()
    .replaceAll("\\", "/")
    .replace(/^['"`]+|['"`]+$/g, "")
  if (cleaned.length === 0) {
    return []
  }
  const parts = cleaned.split("/").filter(Boolean)
  const basename = parts.at(-1)
  const tailTwo = parts.length >= 2 ? parts.slice(-2).join("/") : undefined
  return unique(
    [cleaned, basename, tailTwo].filter((token): token is string => token !== undefined),
  )
}

function extractSymbolLikeTokens(value: string): readonly string[] {
  return unique(matchAll(value, ASCII_TOKEN_PATTERN).flatMap(expandCodeToken))
}

function extractImplicitPathTokens(value: string): readonly string[] {
  return unique(
    matchAll(value, ASCII_TOKEN_PATTERN).flatMap((token) => {
      const expanded = expandCodeToken(token)
      return expanded.flatMap((entry) => {
        const lower = entry.toLocaleLowerCase("en-US")
        const aliases = PATH_ALIASES[lower] ?? []
        if (aliases.length > 0) {
          return aliases.flatMap(expandPathTokens)
        }
        if (looksPathLike(entry) || CODE_MODULE_HINTS.has(lower)) {
          return expandPathTokens(entry)
        }
        return []
      })
    }),
  )
}

function expandCodeToken(token: string): readonly string[] {
  const cleaned = token.trim().replace(/^['"`]+|['"`]+$/g, "")
  if (cleaned.length < 2) {
    return []
  }
  const pieces = cleaned
    .split(/[._:/-]+/)
    .flatMap(splitCamelCase)
    .filter((piece) => piece.length >= 2)
  const separatorPieces = cleaned.split(/[._:/-]+/).filter((piece) => piece.length >= 2)
  const variants = [
    cleaned,
    ...separatorPieces,
    ...pieces,
    ...separatorPieces.flatMap((piece) => {
      const camelPieces = splitCamelCase(piece)
      return camelPieces.length > 1 ? [camelPieces.join("_"), camelPieces.join("-")] : []
    }),
  ]
  if (separatorPieces.length > 1) {
    variants.push(separatorPieces.join("_"), separatorPieces.join("-"))
  }
  return unique(variants)
}

function splitCamelCase(value: string): readonly string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/\s+/)
    .filter((piece) => piece.length >= 2)
}

function looksPathLike(value: string): boolean {
  return (
    value.includes("/") ||
    value.includes("\\") ||
    /\.(?:[cm]?[jt]sx?|json|md|prisma|sql|ya?ml|toml|rs|go|py|java|kt|swift|php|rb)$/i.test(value)
  )
}

function detectCommandFamilies(value: string): readonly string[] {
  const lower = value.toLocaleLowerCase("en-US")
  return [
    ...(containsAny(lower, ["test", "jest", "vitest", "pytest", "go test"]) ? ["test"] : []),
    ...(containsAny(lower, ["build", "next build"]) ? ["build"] : []),
    ...(containsAny(lower, ["typecheck", "tsc --noemit", "tsc --noEmit"]) ? ["typecheck"] : []),
    ...(containsAny(lower, ["lint", "eslint", "biome check"]) ? ["lint"] : []),
    ...(containsAny(lower, ["git "]) ? ["git"] : []),
  ]
}

function commandFamiliesFromCommand(value: string): readonly string[] {
  const result = tokenizeShellCommand(value)
  return unique(
    result.segments
      .map((segment) => classifyCommand(segment.tokens).family)
      .filter((family) => family !== "other"),
  )
}

function commandFamiliesFromOperationKinds(operationKinds: readonly string[]): readonly string[] {
  return operationKinds.flatMap((kind) => {
    switch (kind) {
      case "TEST":
        return ["test"]
      case "BUILD":
        return ["build"]
      case "TYPECHECK":
        return ["typecheck"]
      case "LINT":
        return ["lint"]
      case "GIT":
        return ["git"]
      case "PACKAGE_CHANGE":
        return ["package"]
      case "SHELL":
        return ["run"]
      default:
        return []
    }
  })
}

function containsAny(value: string, needles: readonly string[]): boolean {
  return needles.some((needle) => value.includes(needle.toLocaleLowerCase("en-US")))
}

function matchAll(value: string, pattern: RegExp): readonly string[] {
  return [...value.matchAll(pattern)].map((match) => match[0].trim()).filter(Boolean)
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.length > 0))]
}
