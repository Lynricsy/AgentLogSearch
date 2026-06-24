import type { ErrorEvidence } from "../evidence-types.js"
import { coarseErrorFingerprint, strictErrorFingerprint } from "./error-fingerprint.js"
import { normalizeErrorText } from "./error-normalizer.js"

const ERROR_PATTERNS = [
  /\b(TS\d{4})\b/,
  /\b([A-Z][A-Za-z]+Error)\s*:\s*(.+)/,
  /\b(PrismaClient[A-Za-z]+Error)\b/,
  /\b(ModuleNotFoundError|ImportError|SyntaxError|TypeError|ReferenceError)\b/,
  /\b(SQLSTATE\s*[0-9A-Z]{5})\b/i,
  /\bHTTP\/?\s*(4\d\d|5\d\d)\b/i,
] as const

export type ExtractErrorsResult = {
  readonly errors: readonly ErrorEvidence[]
  readonly omittedErrorCount: number
}

export function extractErrors(input: {
  readonly output: string
  readonly maxErrors: number
  readonly repositoryRoot?: string | null | undefined
}): ExtractErrorsResult {
  const lines = input.output
    .replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"), "")
    .split(/\r?\n/)
    .map((line) => (line.length > 4_000 ? line.slice(0, 4_000) : line))
  const candidates: ErrorEvidence[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ""
    const parsed = parseErrorLine(line)
    if (parsed === null) {
      continue
    }
    const frames = collectFrames(lines, index + 1, input.repositoryRoot)
    const normalizedMessage = normalizeErrorText({
      value: parsed.message,
      repositoryRoot: input.repositoryRoot,
    })
    const evidenceBase = {
      type: parsed.type,
      message: parsed.message,
      normalizedMessage,
      frames,
    }
    const evidence =
      parsed.code === undefined ? evidenceBase : { ...evidenceBase, code: parsed.code }
    candidates.push({
      ...evidence,
      strictFingerprint: strictErrorFingerprint(evidence),
      coarseFingerprint: coarseErrorFingerprint(evidence),
    })
  }

  const deduped = dedupeByStrictFingerprint(candidates)
  const ranked = [...deduped].sort(scoreError)
  return {
    errors: ranked.slice(0, input.maxErrors),
    omittedErrorCount: Math.max(0, ranked.length - input.maxErrors),
  }
}

function parseErrorLine(
  line: string,
): { readonly type: string; readonly message: string; readonly code?: string } | null {
  for (const pattern of ERROR_PATTERNS) {
    const match = pattern.exec(line)
    if (match === null) {
      continue
    }
    const first = match[1] ?? "Error"
    if (/^TS\d{4}$/.test(first)) {
      return { type: "TypeScriptError", code: first, message: line.trim() }
    }
    if (/^HTTP/.test(match[0])) {
      return { type: "HttpError", code: first, message: line.trim() }
    }
    if (/^SQLSTATE/i.test(first)) {
      return { type: "SqlStateError", code: first.toUpperCase(), message: line.trim() }
    }
    return { type: first, message: line.trim() }
  }
  return null
}

function collectFrames(
  lines: readonly string[],
  startIndex: number,
  repositoryRoot: string | null | undefined,
): readonly string[] {
  const frames: string[] = []
  for (let index = startIndex; index < Math.min(lines.length, startIndex + 8); index += 1) {
    const line = lines[index]?.trim() ?? ""
    if (!/^at\s+/.test(line)) {
      if (frames.length > 0) break
      continue
    }
    frames.push(normalizeErrorText({ value: line, repositoryRoot }))
    if (frames.length >= 3) break
  }
  return frames
}

function dedupeByStrictFingerprint(errors: readonly ErrorEvidence[]): readonly ErrorEvidence[] {
  const seen = new Set<string>()
  const output: ErrorEvidence[] = []
  for (const error of errors) {
    if (seen.has(error.strictFingerprint)) {
      continue
    }
    seen.add(error.strictFingerprint)
    output.push(error)
  }
  return output
}

function scoreError(a: ErrorEvidence, b: ErrorEvidence): number {
  return errorScore(b) - errorScore(a)
}

function errorScore(error: ErrorEvidence): number {
  return (error.code === undefined ? 0 : 4) + (error.frames.length > 0 ? 2 : 0) + 1
}
