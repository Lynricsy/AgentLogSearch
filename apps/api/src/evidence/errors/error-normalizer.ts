export function normalizeErrorText(input: {
  readonly value: string
  readonly repositoryRoot?: string | null | undefined
  readonly homeDir?: string | null | undefined
}): string {
  let value = input.value.replaceAll("\\", "/")
  if (input.repositoryRoot !== undefined && input.repositoryRoot !== null) {
    value = replaceAllLiteral(value, input.repositoryRoot.replaceAll("\\", "/"), "<repo>")
  }
  if (input.homeDir !== undefined && input.homeDir !== null) {
    value = replaceAllLiteral(value, input.homeDir.replaceAll("\\", "/"), "~")
  }
  return value
    .replace(/:\d+:\d+\b/g, ":<line>:<column>")
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
      "<uuid>",
    )
    .replace(/\b[0-9a-f]{8,}\b/gi, "<hash>")
    .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?\b/g, "<timestamp>")
    .replace(/\b\d+(?:\.\d+)?\s*(?:ms|s|sec|seconds|m|min)\b/gi, "<duration>")
    .replace(/\b(?:port|localhost:|127\.0\.0\.1:)(\d{2,5})\b/gi, (match) =>
      match.replace(/\d{2,5}/, "<port>"),
    )
    .replace(/\s+/g, " ")
    .trim()
}

export function normalizeMessageWithoutIdentifiers(message: string): string {
  return message
    .replace(/(?:^|\s)(?:\.{0,2}\/)?[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+/g, " <path>")
    .replace(/\b\d+\b/g, "<number>")
    .replace(/\b[0-9a-f]{6,}\b/gi, "<hash>")
    .replace(/\s+/g, " ")
    .trim()
}

function replaceAllLiteral(value: string, search: string, replacement: string): string {
  if (search.length === 0) {
    return value
  }
  return value.split(search).join(replacement)
}
