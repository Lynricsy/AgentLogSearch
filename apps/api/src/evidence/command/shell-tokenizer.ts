export type ShellSegment = {
  readonly raw: string
  readonly tokens: readonly string[]
  readonly precedingOperator?: "&&" | "||" | ";" | "|"
}

export type ShellTokenizeResult = {
  readonly segments: readonly ShellSegment[]
  readonly warnings: readonly string[]
}

const MAX_COMMAND_CHARS = 20_000
const MAX_TOKENS = 1_000

export function tokenizeShellCommand(command: string): ShellTokenizeResult {
  const warnings: string[] = []
  const input = command.length > MAX_COMMAND_CHARS ? command.slice(0, MAX_COMMAND_CHARS) : command
  if (input.length !== command.length) {
    warnings.push("COMMAND_TRUNCATED")
  }

  const segments: ShellSegment[] = []
  let segmentStart = 0
  let token = ""
  let tokens: string[] = []
  let precedingOperator: ShellSegment["precedingOperator"]
  let inSingleQuote = false
  let inDoubleQuote = false
  let escapeNext = false

  const flushToken = () => {
    if (token.length === 0) {
      return
    }
    if (tokens.length < MAX_TOKENS) {
      tokens.push(token)
    } else if (!warnings.includes("TOKEN_LIMIT_REACHED")) {
      warnings.push("TOKEN_LIMIT_REACHED")
    }
    token = ""
  }

  const flushSegment = (end: number, nextOperator: ShellSegment["precedingOperator"]) => {
    flushToken()
    const raw = input.slice(segmentStart, end).trim()
    if (raw.length > 0 || tokens.length > 0) {
      const segment: ShellSegment =
        precedingOperator === undefined ? { raw, tokens } : { raw, tokens, precedingOperator }
      segments.push(segment)
    }
    tokens = []
    precedingOperator = nextOperator
  }

  for (let index = 0; index < input.length; index += 1) {
    const char = input.charAt(index)
    const next = input.charAt(index + 1)

    if (escapeNext) {
      token += char
      escapeNext = false
      continue
    }

    if (inSingleQuote) {
      if (char === "'") {
        inSingleQuote = false
      } else {
        token += char
      }
      continue
    }

    if (inDoubleQuote) {
      if (char === "\\") {
        escapeNext = true
      } else if (char === '"') {
        inDoubleQuote = false
      } else {
        token += char
      }
      continue
    }

    if (char === "'") {
      inSingleQuote = true
      continue
    }
    if (char === '"') {
      inDoubleQuote = true
      continue
    }
    if (char === "\\") {
      escapeNext = true
      continue
    }
    if (/\s/.test(char)) {
      flushToken()
      continue
    }
    if (char === "&" && next === "&") {
      flushSegment(index, "&&")
      index += 1
      segmentStart = index + 1
      continue
    }
    if (char === "|" && next === "|") {
      flushSegment(index, "||")
      index += 1
      segmentStart = index + 1
      continue
    }
    if (char === ";" || char === "|") {
      flushSegment(index, char)
      segmentStart = index + 1
      continue
    }
    token += char
  }

  if (escapeNext) {
    token += "\\"
  }
  if (inSingleQuote || inDoubleQuote) {
    warnings.push("UNCLOSED_QUOTE")
  }
  flushSegment(input.length, undefined)

  return { segments, warnings }
}
