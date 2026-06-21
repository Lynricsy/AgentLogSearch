"use client"

import { SEMANTIC_SEARCH_DEFAULTS } from "@agent-log-search/shared"
import { Accordion, AccordionItem, Button, Input } from "@heroui/react"
import { Filter, Search } from "lucide-react"

import type { SearchFormErrors, SearchFormState } from "./search-types"

type SearchBoxProps = {
  readonly errors: SearchFormErrors
  readonly isSearching: boolean
  readonly onChange: (state: SearchFormState) => void
  readonly onSubmit: () => void
  readonly state: SearchFormState
}

export function SearchBox({ errors, isSearching, onChange, onSubmit, state }: SearchBoxProps) {
  function update<K extends keyof SearchFormState>(key: K, value: SearchFormState[K]) {
    onChange({ ...state, [key]: value })
  }

  return (
    <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_6rem_6rem]">
        <Input
          errorMessage={errors.query}
          isClearable
          isInvalid={Boolean(errors.query)}
          label="Semantic query"
          labelPlacement="outside"
          onValueChange={(query) => update("query", query)}
          placeholder="之前修过登录接口 500 的那次"
          radius="lg"
          size="md"
          startContent={<Search aria-hidden="true" className="size-4" />}
          validationBehavior="aria"
          value={state.query}
          variant="bordered"
        />
        <Input
          errorMessage={errors.topK}
          isInvalid={Boolean(errors.topK)}
          label="Top K"
          labelPlacement="outside"
          max={SEMANTIC_SEARCH_DEFAULTS.maxTopK}
          min={1}
          onValueChange={(topK) => update("topK", topK)}
          radius="lg"
          size="md"
          type="number"
          validationBehavior="aria"
          value={state.topK}
          variant="bordered"
        />
        <Input
          errorMessage={errors.sessionLimit}
          isInvalid={Boolean(errors.sessionLimit)}
          label="Session limit"
          labelPlacement="outside"
          max={SEMANTIC_SEARCH_DEFAULTS.maxSessionLimit}
          min={1}
          onValueChange={(sessionLimit) => update("sessionLimit", sessionLimit)}
          radius="lg"
          size="md"
          type="number"
          validationBehavior="aria"
          value={state.sessionLimit}
          variant="bordered"
        />
      </div>

      <Accordion defaultSelectedKeys={[]} selectionMode="single" className="mt-3">
        <AccordionItem key="filters" aria-label="Filters" title="Filters">
          <div className="grid gap-3 pb-2 md:grid-cols-2">
            <Input
              isClearable
              errorMessage={errors.agentName}
              isInvalid={Boolean(errors.agentName)}
              label="Agent filter"
              labelPlacement="outside"
              onValueChange={(agentName) => update("agentName", agentName)}
              placeholder="generic, codex, claude"
              radius="lg"
              size="md"
              validationBehavior="aria"
              value={state.agentName}
              variant="bordered"
            />
            <Input
              isClearable
              errorMessage={errors.cwdKeyword}
              isInvalid={Boolean(errors.cwdKeyword)}
              label="CWD keyword"
              labelPlacement="outside"
              onValueChange={(cwdKeyword) => update("cwdKeyword", cwdKeyword)}
              placeholder="CliSearch"
              radius="lg"
              size="md"
              validationBehavior="aria"
              value={state.cwdKeyword}
              variant="bordered"
            />
          </div>
        </AccordionItem>
      </Accordion>

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
