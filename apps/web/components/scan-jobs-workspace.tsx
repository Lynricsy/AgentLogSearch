"use client"

import type { PaginatedResponse, ScanJob } from "@agent-log-search/shared"
import { Button, Tab, Tabs } from "@heroui/react"
import { RefreshCw } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { type ApiClient, ApiClientError, apiClient } from "../lib/api"
import { PageHeader } from "./page-header"
import { ScanJobsTable } from "./scan-jobs-table"
import { EmptyState, ErrorState, LoadingState } from "./state-block"
import { StatusBadge } from "./status-badge"

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
    <section aria-label="Scan jobs workspace" className="space-y-5">
      <PageHeader
        actions={
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone={state.kind === "ready" ? "success" : "neutral"}>
              GET {client.baseUrl}/scan-jobs
            </StatusBadge>
            <Button
              aria-label="Refresh scan jobs"
              onPress={() => load(currentPage(state))}
              radius="sm"
              size="sm"
              startContent={<RefreshCw aria-hidden="true" className="size-4" />}
              variant="bordered"
            >
              Refresh
            </Button>
          </div>
        }
        eyebrow="Scan jobs"
        subtitle="Review scanner runs, source metadata, import counts, and truncated failure summaries."
        title="Scan Jobs"
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
    return <LoadingState description="Fetching scan job history." title="Loading scan jobs" />
  }

  if (state.kind === "error") {
    return <ErrorState description={state.message} title="Scan jobs unavailable" />
  }

  if (state.page.items.length === 0) {
    return (
      <EmptyState
        description="Run a manual scan from Sources to create scan job history."
        title="No scan jobs yet"
      />
    )
  }

  const filteredItems = filterByStatus(state.page.items, selectedTab)
  const filteredPage: PaginatedResponse<ScanJob> = { ...state.page, items: filteredItems }

  return (
    <div className="space-y-3">
      <Tabs
        aria-label="Scan jobs status filter"
        color="primary"
        selectedKey={selectedTab}
        variant="underlined"
        onSelectionChange={(key) => onSelectTab(key as StatusFilter)}
      >
        <Tab key="all" title="All" />
        <Tab key="running" title="Running" />
        <Tab key="completed" title="Completed" />
        <Tab key="failed" title="Failed" />
      </Tabs>
      <ScanJobsTable onPageChange={onPageChange} page={filteredPage} />
    </div>
  )
}

function filterByStatus(
  items: readonly ScanJob[],
  filter: StatusFilter,
): readonly ScanJob[] {
  if (filter === "all") return items
  if (filter === "running") {
    return items.filter((job) => job.status === "running" || job.status === "queued")
  }
  return items.filter((job) => job.status === filter)
}

function describeError(error: unknown): string {
  if (error instanceof ApiClientError) return error.message
  if (error instanceof Error) return error.message
  return "Scan jobs request failed."
}

function currentPage(state: ScanJobsState): number {
  if (state.kind !== "ready") return 1
  return state.page.page
}
