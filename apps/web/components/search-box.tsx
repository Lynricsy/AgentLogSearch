"use client"

import { SEMANTIC_SEARCH_DEFAULTS } from "@agent-log-search/shared"
import { Button } from "@heroui/react"
import { Filter, Search } from "lucide-react"
import { useId } from "react"

import type { SearchFormErrors, SearchFormState } from "./search-types"

type SearchBoxProps = {
  readonly errors: SearchFormErrors
  readonly isSearching: boolean
  readonly onChange: (state: SearchFormState) => void
  readonly onSubmit: () => void
  readonly state: SearchFormState
}

const fieldClassName =
  "mt-1 w-full min-w-0 rounded-md border border-[var(--app-border)] bg-white px-3 py-2 text-sm text-[var(--app-ink)] outline-none transition focus:border-[var(--app-accent)] focus:ring-2 focus:ring-[var(--app-accent-soft)]"

export function SearchBox({ errors, isSearching, onChange, onSubmit, state }: SearchBoxProps) {
  function update<K extends keyof SearchFormState>(key: K, value: SearchFormState[K]) {
    onChange({ ...state, [key]: value })
  }

  return (
    <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_9rem_9rem]">
        <TextField
          error={errors.query}
          label="Semantic query"
          onChange={(query) => update("query", query)}
          placeholder="之前修过登录接口 500 的那次"
          value={state.query}
        />
        <TextField
          error={errors.topK}
          label="Top K"
          max={SEMANTIC_SEARCH_DEFAULTS.maxTopK}
          min={1}
          onChange={(topK) => update("topK", topK)}
          type="number"
          value={state.topK}
        />
        <TextField
          error={errors.sessionLimit}
          label="Session limit"
          max={SEMANTIC_SEARCH_DEFAULTS.maxSessionLimit}
          min={1}
          onChange={(sessionLimit) => update("sessionLimit", sessionLimit)}
          type="number"
          value={state.sessionLimit}
        />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <TextField
          error={errors.agentName}
          label="Agent filter"
          onChange={(agentName) => update("agentName", agentName)}
          placeholder="generic, codex, claude"
          value={state.agentName}
        />
        <TextField
          error={errors.cwdKeyword}
          label="CWD keyword"
          onChange={(cwdKeyword) => update("cwdKeyword", cwdKeyword)}
          placeholder="CliSearch"
          value={state.cwdKeyword}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          color="primary"
          isLoading={isSearching}
          onPress={onSubmit}
          radius="sm"
          startContent={isSearching ? null : <Search aria-hidden="true" className="size-4" />}
        >
          Search
        </Button>
        <div className="inline-flex items-center gap-2 rounded-md border border-[var(--app-border)] px-3 py-2 text-sm text-[var(--app-muted)]">
          <Filter aria-hidden="true" className="size-4" />
          Filters applied inline
        </div>
      </div>
    </div>
  )
}

function TextField({
  error,
  label,
  max,
  min,
  onChange,
  placeholder,
  type = "text",
  value,
}: {
  readonly error?: string | undefined
  readonly label: string
  readonly max?: number | undefined
  readonly min?: number | undefined
  readonly onChange: (value: string) => void
  readonly placeholder?: string
  readonly type?: "number" | "text"
  readonly value: string
}) {
  const errorId = useId()

  return (
    <div className="min-w-0">
      <label className="text-xs font-medium text-[var(--app-muted)]">
        {label}
        <input
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? "true" : undefined}
          className={fieldClassName}
          max={max}
          min={min}
          onChange={(event) => onChange(event.currentTarget.value)}
          placeholder={placeholder}
          type={type}
          value={value}
        />
      </label>
      {error ? (
        <span className="mt-1 block text-xs text-danger-700" id={errorId}>
          {error}
        </span>
      ) : null}
    </div>
  )
}
