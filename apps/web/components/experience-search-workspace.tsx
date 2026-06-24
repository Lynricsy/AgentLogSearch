"use client"

import type { ExperienceSearchResponse } from "@agent-log-search/shared"
import { Button, Skeleton } from "@heroui/react"
import { RefreshCw } from "lucide-react"
import { useState } from "react"

import { type ApiClient, ApiClientError, apiClient } from "../lib/api"
import { ExperienceResultSection } from "./experience-result-section"
import { ExperienceSearchForm } from "./experience-search-form"
import {
  type ExperienceSearchFormErrors,
  type ExperienceSearchFormState,
  initialExperienceSearchFormState,
  parseExperienceSearchForm,
} from "./experience-search-types"
import { PageHeader } from "./page-header"
import { EmptyState, ErrorState } from "./state-block"

type ExperienceSearchWorkspaceProps = {
  readonly client?: ApiClient
}

type ExperienceSearchState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly response: ExperienceSearchResponse }
  | { readonly kind: "error"; readonly message: string }

export function ExperienceSearchWorkspace({ client = apiClient }: ExperienceSearchWorkspaceProps) {
  const [formState, setFormState] = useState<ExperienceSearchFormState>(
    initialExperienceSearchFormState,
  )
  const [formErrors, setFormErrors] = useState<ExperienceSearchFormErrors>({})
  const [searchState, setSearchState] = useState<ExperienceSearchState>({ kind: "idle" })

  async function submitSearch() {
    const parsed = parseExperienceSearchForm(formState)
    if (!parsed.ok) {
      setFormErrors(parsed.errors)
      return
    }

    setFormErrors({})
    setSearchState({ kind: "loading" })
    try {
      const response = await client.searchExperiences(parsed.payload)
      setSearchState({ kind: "ready", response })
    } catch (error) {
      setSearchState({ kind: "error", message: describeError(error) })
    }
  }

  async function rebuildPending() {
    setSearchState({ kind: "loading" })
    try {
      await client.rebuildExperiences({ includeReady: false })
      setSearchState({
        kind: "error",
        message: "已请求重新构建待处理经验。等待 worker 完成后再次搜索。",
      })
    } catch (error) {
      setSearchState({ kind: "error", message: describeError(error) })
    }
  }

  return (
    <section aria-label="经验搜索工作区" className="space-y-5">
      <PageHeader
        actions={
          <Button
            onPress={rebuildPending}
            radius="sm"
            size="sm"
            startContent={<RefreshCw aria-hidden="true" className="size-4" />}
            variant="flat"
          >
            重建待处理
          </Button>
        }
        eyebrow="经验搜索"
        subtitle="按错误、文件和符号检索已构建的工程经验，区分经过验证、失败尝试和证据不足的记录。"
        title="搜索工程经验"
      />

      <ExperienceSearchForm
        errors={formErrors}
        isSearching={searchState.kind === "loading"}
        onChange={setFormState}
        onSubmit={submitSearch}
        state={formState}
      />

      <ExperienceSearchResults state={searchState} />
    </section>
  )
}

function ExperienceSearchResults({ state }: { readonly state: ExperienceSearchState }) {
  if (state.kind === "idle") {
    return (
      <EmptyState
        description="输入查询后，将搜索已就绪的 experience；每组结果会保留空状态，便于判断没有命中的 outcome。"
        title="尚未提交查询"
      />
    )
  }

  if (state.kind === "loading") {
    return <ExperienceResultsSkeleton />
  }

  if (state.kind === "error") {
    return <ErrorState description={state.message} title="经验搜索暂不可用" />
  }

  const total =
    state.response.successful.length +
    state.response.failedAttempts.length +
    state.response.partial.length +
    state.response.unverified.length

  if (total === 0) {
    return (
      <EmptyState
        description="当前查询没有匹配到已就绪的经验。确认 evidence pipeline、experience worker 和 search 开关已启用。"
        title="没有匹配的经验"
      />
    )
  }

  return (
    <div className="space-y-6">
      <ExperienceResultSection
        description="历史上执行过并观察到验证通过的操作。"
        experiences={state.response.successful}
        title="经过验证的历史操作"
      />
      <ExperienceResultSection
        description="历史上执行过但验证失败的尝试，可用于识别相似风险。"
        experiences={state.response.failedAttempts}
        title="历史失败尝试"
      />
      <ExperienceResultSection
        description="观察到部分验证信号，但没有形成完整通过结论。"
        experiences={state.response.partial}
        title="部分验证"
      />
      <ExperienceResultSection
        description="证据不足或没有找到修改后的验证结果。"
        experiences={state.response.unverified}
        title="未充分验证"
      />
    </div>
  )
}

function ExperienceResultsSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-3">
      <h2 className="text-sm font-medium">正在搜索经验</h2>
      <span className="sr-only">正在检索已构建的 experience。</span>
      <Skeleton className="h-36 w-full rounded-lg" />
      <Skeleton className="h-36 w-full rounded-lg" />
      <Skeleton className="h-36 w-full rounded-lg" />
    </div>
  )
}

function describeError(error: unknown): string {
  if (error instanceof ApiClientError) return error.message
  if (error instanceof Error) return error.message
  return "经验搜索请求失败。"
}
