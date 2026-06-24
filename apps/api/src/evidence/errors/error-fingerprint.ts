import { createHash } from "node:crypto"
import { normalizeMessageWithoutIdentifiers } from "./error-normalizer.js"

export function strictErrorFingerprint(input: {
  readonly type: string
  readonly code?: string
  readonly normalizedMessage: string
  readonly frames: readonly string[]
}): string {
  return sha256(
    [input.type, input.code ?? "", input.normalizedMessage, ...input.frames.slice(0, 3)].join("\n"),
  )
}

export function coarseErrorFingerprint(input: {
  readonly type: string
  readonly code?: string
  readonly normalizedMessage: string
}): string {
  return sha256(
    [
      input.type,
      input.code ?? "",
      normalizeMessageWithoutIdentifiers(input.normalizedMessage),
    ].join("\n"),
  )
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}
