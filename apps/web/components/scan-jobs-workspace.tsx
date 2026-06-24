"use client"

import type { PaginatedResponse, ScanJob } from "@agent-log-search/shared"
import { Button, Tab, Tabs } from "@heroui/react"
import { RefreshCw } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { type ApiClient, ApiClientError, apiClient } from "../lib/api"
import { PageHeader } from "./page-header"
import { ScanJobsTable } from "./scan-jobs-table"
import { EmptyState, ErrorState, LoadingState } from "./state-block"

const PAGE_SIZE = 20

type StatusFilter = "all" | "running" | "completed" | "failed"

type ScanJobsWorkspaceProps = {
  readonly client?: ApiClient
}

export type ScanJobsState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly page: PaginatedResponse<ScanJob> }
  | { readonly kind: "error"; readonly message: string }

export function ScanJobsWorkspace({ client = apiClient }: ScanJobsWorkspaceProps) {
  const [state, setState] = useState<ScanJobsState>({ kind: "loading" })
  const [selectedTab, setSelectedTab] = useState<StatusFilter>("all")
  const latestRequestId = useRef(0)

  const load = useCallback(
    async (page: number) => {
      const requestId = latestRequestId.current + 1
      latestRequestId.current = requestId
      setState((current) => (current.kind === "ready" ? current : { kind: "loading" }))
      try {
        const response = await client.listScanJobs({ page, pageSize: PAGE_SIZE })
        if (requestId !== latestRequestId.current) return
        setState({ kind: "ready", page: response })
      } catch (error) {
        if (requestId !== latestRequestId.current) return
        setState({ kind: "error", message: describeError(error) })
      }
    },
    [client],
  )

  useEffect(() => {
    void load(1)
  }, [load])

  return (
    <section aria-label="扫描任务工作区" className="space-y-5">
      <PageHeader
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              aria-label="刷新扫描任务"
              onPress={() => load(currentPage(state))}
              radius="sm"
              size="sm"
              startContent={<RefreshCw aria-hidden="true" className="size-4" />}
              variant="bordered"
            >
              刷新
            </Button>
          </div>
        }
        eyebrow="扫描任务"
        subtitle="查看扫描运行记录、数据源元数据、导入计数和折叠后的失败摘要。"
        title="扫描任务"
      />
      <ScanJobsContent
        onPageChange={load}
        state={state}
        selectedTab={selectedTab}
        onSelectTab={setSelectedTab}
      />
    </section>
  )
}

function ScanJobsContent({
  onPageChange,
  state,
  selectedTab,
  onSelectTab,
}: {
  readonly onPageChange: (page: number) => void
  readonly state: ScanJobsState
  readonly selectedTab: StatusFilter
  readonly onSelectTab: (tab: StatusFilter) => void
}) {
  if (state.kind === "loading") {
    return <LoadingState description="正在获取扫描任务历史。" title="正在加载扫描任务" />
  }

  if (state.kind === "error") {
    return <ErrorState description={state.message} title="扫描任务暂不可用" />
  }

  if (state.page.items.length === 0) {
    return (
      <EmptyState
        description="在数据源页面运行手动扫描后，这里会出现扫描任务历史。"
        title="还没有扫描任务"
      />
    )
  }

  const filteredItems = filterByStatus(state.page.items, selectedTab)
  const filteredPage: PaginatedResponse<ScanJob> = { ...state.page, items: filteredItems }

  return (
    <div className="space-y-3">
      <Tabs
        aria-label="扫描任务状态筛选"
        color="primary"
        selectedKey={selectedTab}
        variant="underlined"
        onSelectionChange={(key) => onSelectTab(key as StatusFilter)}
      >
        <Tab key="all" title="全部" />
        <Tab key="running" title="进行中" />
        <Tab key="completed" title="已完成" />
        <Tab key="failed" title="失败" />
      </Tabs>
      <ScanJobsTable onPageChange={onPageChange} page={filteredPage} />
    </div>
  )
}

function filterByStatus(items: readonly ScanJob[], filter: StatusFilter): readonly ScanJob[] {
  if (filter === "all") return items
  if (filter === "running") {
    return items.filter((job) => job.status === "running" || job.status === "queued")
  }
  return items.filter((job) => job.status === filter)
}

function describeError(error: unknown): string {
  if (error instanceof ApiClientError) return error.message
  if (error instanceof Error) return error.message
  return "扫描任务请求失败。"
}

function currentPage(state: ScanJobsState): number {
  if (state.kind !== "ready") return 1
  return state.page.page
}
