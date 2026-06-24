"use client"

import type { SemanticSearchResult } from "@agent-log-search/shared"
import { Skeleton } from "@heroui/react"
import { AnimatePresence, motion } from "framer-motion"
import { Bot, FolderOpen, Hash, MessageSquareText, RefreshCw } from "lucide-react"
import type { ReactNode } from "react"
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
import { EmptyState, ErrorState } from "./state-block"

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
    <section aria-label="搜索工作区" className="space-y-5">
      <PageHeader
        eyebrow="语义搜索"
        subtitle="搜索本机已索引的 Agent CLI 会话，可按 Agent 或工作目录缩小范围，并复制恢复命令但不执行。"
        title="搜索 Agent 历史"
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
  return (
    <AnimatePresence mode="wait">
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        initial={false}
        key={state.kind}
      >
        {renderState(state)}
      </motion.div>
    </AnimatePresence>
  )
}

function renderState(state: SearchState) {
  if (state.kind === "idle") {
    return (
      <EmptyState
        description="输入语义查询后，将在本机会话中搜索已就绪的索引片段。"
        title="尚未提交查询"
      />
    )
  }

  if (state.kind === "loading") {
    return <SearchResultsSkeleton />
  }

  if (state.kind === "error") {
    return <ErrorState description={state.message} title="搜索暂不可用" />
  }

  if (state.records.length === 0) {
    return (
      <EmptyState description="当前查询和筛选条件没有匹配到已就绪的会话。" title="没有匹配的会话" />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-[var(--app-muted)]">
        <RefreshCw aria-hidden="true" className="size-4" />共 {state.records.length} 个会话结果
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
  return "搜索请求失败。"
}

function SearchResultsSkeleton() {
  return (
    <output aria-busy="true" aria-label="正在加载搜索结果" aria-live="polite" className="space-y-3">
      <span className="sr-only">正在搜索已就绪的片段。</span>
      <div className="flex items-center gap-2 text-sm text-[var(--app-muted)]">
        <RefreshCw aria-hidden="true" className="size-4 animate-spin" />
        <Skeleton className="h-4 w-36 rounded-md" />
      </div>
      <div className="space-y-3">
        <SearchResultCardSkeleton />
        <SearchResultCardSkeleton isCompact />
      </div>
    </output>
  )
}

function SearchResultCardSkeleton({ isCompact = false }: { readonly isCompact?: boolean }) {
  return (
    <article className="rounded-lg border border-white/25 bg-white/55 p-4 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-black/35">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-5 w-3/5 max-w-96 rounded-md" />
          <div className="mt-2 flex flex-wrap gap-2">
            <Skeleton className="h-6 w-24 rounded-md" />
            <Skeleton className="h-6 w-16 rounded-md" />
            <Skeleton className="h-6 w-20 rounded-md" />
          </div>
        </div>
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>

      <div className="mt-4 space-y-2">
        <p className="flex items-center gap-2 text-xs font-medium text-[var(--app-muted)]">
          <MessageSquareText aria-hidden="true" className="size-4" />
          匹配片段
        </p>
        <div className="space-y-2">
          <MatchedChunkSkeleton />
          {isCompact ? null : <MatchedChunkSkeleton hasSecondMessage />}
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-[var(--app-border)] bg-[var(--app-accent-soft)] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-[var(--app-muted)]">恢复命令</p>
          <Skeleton className="h-8 w-16 rounded-md" />
        </div>
        <Skeleton className="mt-2 h-8 w-full rounded-md" />
      </div>
    </article>
  )
}

function MatchedChunkSkeleton({
  hasSecondMessage = false,
}: {
  readonly hasSecondMessage?: boolean
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] shadow-sm">
      <div className="flex flex-col gap-2 border-b border-[var(--app-border)] bg-[var(--app-panel-muted)]/45 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Skeleton className="h-6 w-24 rounded-md" />
          <Skeleton className="h-4 w-28 rounded-md" />
          <Skeleton className="h-4 w-20 rounded-md" />
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>

      <div className="space-y-3 p-3">
        <div className="grid gap-2 lg:grid-cols-[minmax(9rem,0.8fr)_minmax(12rem,1.25fr)_minmax(14rem,1.5fr)]">
          <SkeletonMetaPill icon={<Bot aria-hidden="true" className="size-4" />} />
          <SkeletonMetaPill icon={<FolderOpen aria-hidden="true" className="size-4" />} />
          <SkeletonMetaPill icon={<Hash aria-hidden="true" className="size-4" />} />
        </div>

        <div className="space-y-2">
          <SkeletonMessageBlock />
          {hasSecondMessage ? <SkeletonMessageBlock isAssistant /> : null}
        </div>
      </div>
    </section>
  )
}

function SkeletonMetaPill({ icon }: { readonly icon: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-[var(--app-border)] bg-white/75 px-3 py-2 shadow-sm dark:bg-white/5">
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-[var(--app-accent-soft)] text-[var(--app-accent)]">
        {icon}
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-3 w-14 rounded-md" />
        <Skeleton className="h-3.5 w-5/6 rounded-md" />
      </div>
    </div>
  )
}

function SkeletonMessageBlock({ isAssistant = false }: { readonly isAssistant?: boolean }) {
  return (
    <div className="rounded-lg border border-[var(--app-border)] bg-white/55 p-2.5 shadow-sm dark:bg-white/5">
      <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
        <Skeleton className="h-4 w-4 rounded-md" />
        <Skeleton className="h-3.5 w-12 rounded-md" />
        <Skeleton className="h-3.5 w-8 rounded-md" />
        {isAssistant ? <Skeleton className="h-3.5 w-14 rounded-md" /> : null}
      </div>
      <div className="rounded-lg border border-[var(--app-border)] bg-white/85 px-3 py-3 shadow-sm dark:bg-white/5">
        <Skeleton className="mb-2 h-3.5 w-20 rounded-md" />
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-full rounded-md" />
          <Skeleton className="h-3.5 w-11/12 rounded-md" />
          <Skeleton className="h-3.5 w-7/12 rounded-md" />
        </div>
      </div>
    </div>
  )
}
