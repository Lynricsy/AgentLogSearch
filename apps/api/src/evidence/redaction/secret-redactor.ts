export type RedactionResult = {
  readonly text: string
  readonly redactionCount: number
  readonly types: readonly string[]
}

type RedactionRule = {
  readonly type: string
  readonly pattern: RegExp
  readonly replacement?: string
}

const SECRET_FIELD_NAMES = new Set([
  "token",
  "secret",
  "password",
  "authorization",
  "apikey",
  "api_key",
])

const RULES: readonly RedactionRule[] = [
  {
    type: "private-key",
    pattern: /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,
  },
  {
    type: "url-credentials",
    pattern: /([a-z][a-z0-9+.-]*:\/\/)([^/\s:@]+):([^@\s/]+)@/gi,
    replacement: "$1<redacted:user>:<redacted:password>@",
  },
  {
    type: "authorization",
    pattern: /\bAuthorization\s*:\s*(?:Bearer|Basic)\s+[^\s]+/gi,
  },
  {
    type: "github-token",
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g,
  },
  {
    type: "github-pat",
    pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  },
  {
    type: "aws-access-key",
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  {
    type: "env-secret",
    pattern: /\b([A-Z0-9_]*(?:TOKEN|KEY|SECRET|PASSWORD|PASSWD)[A-Z0-9_]*)\s*=\s*([^\s]+)/gi,
    replacement: "$1=<redacted:env-secret>",
  },
  {
    type: "json-secret",
    pattern: /("(?:token|secret|password|authorization|apiKey|api_key)"\s*:\s*)"[^"]*"/gi,
    replacement: '$1"<redacted:json-secret>"',
  },
]

export class SecretRedactor {
  public redact(text: string): RedactionResult {
    let redacted = text
    let redactionCount = 0
    const types = new Set<string>()

    for (const rule of RULES) {
      redacted = redacted.replace(rule.pattern, (...args: unknown[]) => {
        const match = String(args[0] ?? "")
        if (match.length === 0) {
          return match
        }
        redactionCount += 1
        types.add(rule.type)
        return rule.replacement ?? `<redacted:${rule.type}>`
      })
    }

    return { text: redacted, redactionCount, types: [...types] }
  }

  public redactUnknown(value: unknown): unknown {
    return redactUnknownValue(value, 0)
  }
}

function redactUnknownValue(value: unknown, depth: number): unknown {
  if (typeof value === "string") {
    return new SecretRedactor().redact(value).text
  }
  if (value === null || typeof value !== "object") {
    return value
  }
  if (depth > 8) {
    return "[MaxDepth]"
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactUnknownValue(entry, depth + 1))
  }
  const output: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    output[key] = isSecretFieldName(key)
      ? `<redacted:json-secret>`
      : redactUnknownValue(entry, depth + 1)
  }
  return output
}

function isSecretFieldName(key: string): boolean {
  return SECRET_FIELD_NAMES.has(key.toLocaleLowerCase("en-US"))
}
