"use client"

import type { ExperienceSearchRequest } from "@agent-log-search/shared"

export type ExperienceSearchFormState = {
  readonly query: string
  readonly errorText: string
  readonly files: string
  readonly symbols: string
  readonly repositoryPath: string
  readonly mode: ExperienceSearchRequest["mode"]
  readonly topK: string
}

export type ExperienceSearchFormErrors = Partial<Record<keyof ExperienceSearchFormState, string>>

export const initialExperienceSearchFormState: ExperienceSearchFormState = {
  errorText: "",
  files: "",
  mode: "all",
  query: "",
  repositoryPath: "",
  symbols: "",
  topK: "10",
}

export type ExperienceSearchParseResult =
  | { readonly ok: true; readonly payload: ExperienceSearchRequest }
  | { readonly ok: false; readonly errors: ExperienceSearchFormErrors }

export function parseExperienceSearchForm(
  state: ExperienceSearchFormState,
): ExperienceSearchParseResult {
  const errors: ExperienceSearchFormErrors = {}
  const query = state.query.trim()
  const errorText = state.errorText.trim()
  const files = parseList(state.files)
  const repositoryPath = state.repositoryPath.trim()
  const symbols = parseList(state.symbols)
  const topK = readInteger(state.topK)

  if (query.length === 0) {
    errors.query = "查询文本不能为空"
  } else if (query.length > 2000) {
    errors.query = "查询文本不能超过 2000 个字符。"
  }

  if (errorText.length > 10000) {
    errors.errorText = "错误文本不能超过 10000 个字符。"
  }

  if (files.length > 50) {
    errors.files = "文件路径最多 50 个。"
  }

  if (repositoryPath.length > 2000) {
    errors.repositoryPath = "仓库路径不能超过 2000 个字符。"
  }

  if (symbols.length > 50) {
    errors.symbols = "符号最多 50 个。"
  }

  if (topK === null || topK < 1 || topK > 50) {
    errors.topK = "返回数量必须在 1 到 50 之间。"
  }

  if (Object.keys(errors).length > 0) return { errors, ok: false }

  return {
    ok: true,
    payload: {
      ...(errorText.length > 0 ? { errorText } : {}),
      files,
      mode: state.mode,
      query,
      ...(repositoryPath.length > 0 ? { repositoryPath } : {}),
      symbols,
      topK: topK ?? 10,
    },
  }
}

function parseList(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\n,]+/)
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ]
}

function readInteger(value: string): number | null {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const parsed = Number(trimmed)
  return Number.isSafeInteger(parsed) ? parsed : null
}
