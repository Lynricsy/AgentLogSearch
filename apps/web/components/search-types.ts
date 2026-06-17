"use client"

import { SEMANTIC_SEARCH_DEFAULTS, type SemanticSearchRequest } from "@agent-log-search/shared"

export type SearchFormState = {
  readonly query: string
  readonly agentName: string
  readonly cwdKeyword: string
  readonly topK: string
  readonly sessionLimit: string
}

export type SearchFormErrors = Partial<Record<keyof SearchFormState, string>>

export const initialSearchFormState: SearchFormState = {
  agentName: "",
  cwdKeyword: "",
  query: "",
  sessionLimit: String(SEMANTIC_SEARCH_DEFAULTS.sessionLimit),
  topK: String(SEMANTIC_SEARCH_DEFAULTS.topK),
}

export type SearchParseResult =
  | { readonly ok: true; readonly payload: SemanticSearchRequest }
  | { readonly ok: false; readonly errors: SearchFormErrors }

export function parseSearchForm(state: SearchFormState): SearchParseResult {
  const errors: SearchFormErrors = {}
  const query = state.query.trim()
  const agentName = state.agentName.trim()
  const cwdKeyword = state.cwdKeyword.trim()
  const topK = readInteger(state.topK)
  const sessionLimit = readInteger(state.sessionLimit)

  if (query.length === 0) {
    errors.query = "Semantic query不能为空"
  } else if (query.length > SEMANTIC_SEARCH_DEFAULTS.maxQueryLength) {
    errors.query = `Semantic query cannot exceed ${SEMANTIC_SEARCH_DEFAULTS.maxQueryLength} characters.`
  }

  if (topK === null || topK < 1 || topK > SEMANTIC_SEARCH_DEFAULTS.maxTopK) {
    errors.topK = `Top K must be between 1 and ${SEMANTIC_SEARCH_DEFAULTS.maxTopK}.`
  }

  if (
    sessionLimit === null ||
    sessionLimit < 1 ||
    sessionLimit > SEMANTIC_SEARCH_DEFAULTS.maxSessionLimit
  ) {
    errors.sessionLimit = `Session limit must be between 1 and ${SEMANTIC_SEARCH_DEFAULTS.maxSessionLimit}.`
  }

  if (Object.keys(errors).length > 0) return { errors, ok: false }

  return {
    ok: true,
    payload: {
      ...(agentName.length > 0 ? { agentName } : {}),
      ...(cwdKeyword.length > 0 ? { cwdKeyword } : {}),
      query,
      sessionLimit: sessionLimit ?? SEMANTIC_SEARCH_DEFAULTS.sessionLimit,
      topK: topK ?? SEMANTIC_SEARCH_DEFAULTS.topK,
    },
  }
}

function readInteger(value: string): number | null {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const parsed = Number(trimmed)
  return Number.isSafeInteger(parsed) ? parsed : null
}
