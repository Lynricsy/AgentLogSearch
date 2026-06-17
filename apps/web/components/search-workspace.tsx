"use client"

import type { SemanticSearchResult } from "@agent-log-search/shared"
import { RefreshCw } from "lucide-react"
import { useState } from "react"

import { type ApiClient, ApiClientError, apiClient } from "../lib/api"
import { PageHeader } from "./page-header"
import { SearchBox } from "./search-box"
import { SearchResultCard } from "./search-result-card"
import {
  initialSearchFormState,
  parseSearchForm,
  type SearchFormErrors,
  type SearchFormState,
} from "./search-types"
import { EmptyState, ErrorState, LoadingState } from "./state-block"
import { StatusBadge } from "./status-badge"

type SearchWorkspaceProps = {
  readonly client?: ApiClient
}

type SearchState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly records: readonly SemanticSearchResult[] }
  | { readonly kind: "error"; readonly message: string }

export function SearchWorkspace({ client = apiClient }: SearchWorkspaceProps) {
  const [formState, setFormState] = useState<SearchFormState>(initialSearchFormState)
  const [formErrors, setFormErrors] = useState<SearchFormErrors>({})
  const [searchState, setSearchState] = useState<SearchState>({ kind: "idle" })

  async function submitSearch() {
    const parsed = parseSearchForm(formState)
    if (!parsed.ok) {
      setFormErrors(parsed.errors)
      return
    }

    setFormErrors({})
    setSearchState({ kind: "loading" })
    try {
      const response = await client.searchSemantic(parsed.payload)
      setSearchState({ kind: "ready", records: response.records })
    } catch (error) {
      setSearchState({ kind: "error", message: describeError(error) })
    }
  }

  return (
    <section aria-label="Search workspace" className="space-y-5">
      <PageHeader
        actions={
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={searchState.kind === "ready" ? "success" : "neutral"}>
              POST {client.baseUrl}/search/semantic
            </StatusBadge>
          </div>
        }
        eyebrow="Semantic search"
        subtitle="Search local indexed Agent CLI sessions, narrow by agent or working directory, then copy resume commands without executing them."
        title="Search agent history"
      />

      <SearchBox
        errors={formErrors}
        isSearching={searchState.kind === "loading"}
        onChange={setFormState}
        onSubmit={submitSearch}
        state={formState}
      />

      <SearchResults state={searchState} />
    </section>
  )
}

function SearchResults({ state }: { readonly state: SearchState }) {
  if (state.kind === "idle") {
    return (
      <EmptyState
        description="Enter a semantic query to search ready indexed chunks from local sessions."
        title="No query submitted"
      />
    )
  }

  if (state.kind === "loading") {
    return <LoadingState description="Searching ready chunks." title="Loading search results" />
  }

  if (state.kind === "error") {
    return <ErrorState description={state.message} title="Search unavailable" />
  }

  if (state.records.length === 0) {
    return (
      <EmptyState
        description="No ready session matched the current query and filters."
        title="No matching sessions"
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-[var(--app-muted)]">
        <RefreshCw aria-hidden="true" className="size-4" />
        {state.records.length} session result{state.records.length === 1 ? "" : "s"}
      </div>
      {state.records.map((record) => (
        <SearchResultCard key={record.sessionId} result={record} />
      ))}
    </div>
  )
}

function describeError(error: unknown): string {
  if (error instanceof ApiClientError) return error.message
  if (error instanceof Error) return error.message
  return "Search request failed."
}
