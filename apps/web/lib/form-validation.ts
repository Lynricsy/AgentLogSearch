export type ValidationResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly message: string }

export function validateRequiredText(value: string, label: string): ValidationResult {
  const trimmed = value.trim()

  if (trimmed.length === 0) {
    return { ok: false, message: `${label}不能为空` }
  }

  if (trimmed.length > 500) {
    return { ok: false, message: `${label}不能超过 500 个字符` }
  }

  return { ok: true, value: trimmed }
}
