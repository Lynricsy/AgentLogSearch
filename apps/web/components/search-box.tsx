"use client"

import { SEMANTIC_SEARCH_DEFAULTS } from "@agent-log-search/shared"
import { Accordion, AccordionItem, Button, Input } from "@heroui/react"
import { Search } from "lucide-react"

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
          label="语义查询"
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
          label="召回片段数"
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
          label="会话上限"
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

      <div className="mt-3 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-muted)]/40 px-3 py-1">
        <Accordion className="px-0" defaultSelectedKeys={[]} selectionMode="single">
          <AccordionItem key="filters" aria-label="筛选条件" title="筛选条件">
            <div className="grid gap-3 pb-3 md:grid-cols-2">
              <Input
                isClearable
                errorMessage={errors.agentName}
                isInvalid={Boolean(errors.agentName)}
                label="Agent 筛选"
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
                label="工作目录关键词"
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
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          color="primary"
          isLoading={isSearching}
          onPress={onSubmit}
          radius="sm"
          startContent={isSearching ? null : <Search aria-hidden="true" className="size-4" />}
        >
          搜索
        </Button>
      </div>
    </div>
  )
}
