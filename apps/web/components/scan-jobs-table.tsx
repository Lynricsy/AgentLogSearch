"use client"

import type { PaginatedResponse, ScanJob } from "@agent-log-search/shared"
import {
  Button,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@heroui/react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useState } from "react"

import {
  formatDisplayName,
  formatParserType,
  formatScanJobStatus,
  formatSourcePreset,
} from "./display-labels"
import { StatusBadge } from "./status-badge"

const ERROR_SUMMARY_LIMIT = 96

type SummaryRow = {
  readonly className: string
  readonly label: string
  readonly value: string | number
}

type ScanJobsTableProps = {
  readonly onPageChange: (page: number) => void
  readonly page: PaginatedResponse<ScanJob>
}

export function ScanJobsTable({ onPageChange, page }: ScanJobsTableProps) {
  return (
    <div className="space-y-3">
      <Table
        aria-label="扫描任务"
        classNames={{
          base: "rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)]",
          th: "bg-[var(--app-accent-soft)] text-xs text-[var(--app-muted)]",
          td: "text-sm text-[var(--app-muted)]",
          tr: "align-top",
        }}
        isHeaderSticky
        isStriped
      >
        <TableHeader>
          <TableColumn key="status" isRowHeader>
            状态
          </TableColumn>
          <TableColumn key="source">数据源</TableColumn>
          <TableColumn key="time">时间</TableColumn>
          <TableColumn key="summary">摘要</TableColumn>
          <TableColumn key="error">错误</TableColumn>
        </TableHeader>
        <TableBody
          isLoading={false}
          loadingContent={<Skeleton className="h-12 w-full rounded-lg" />}
          emptyContent="当前筛选条件下没有匹配的扫描任务。"
        >
          {page.items.map((job) => {
            const sourceName = formatDisplayName(job.source?.name, "未知数据源")
            return (
              <TableRow key={job.id}>
                <TableCell>
                  <StatusBadge tone={statusTone(job.status)}>
                    {formatScanJobStatus(job.status)}
                  </StatusBadge>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <p className="font-medium text-[var(--app-ink)]">{sourceName}</p>
                    <div className="flex flex-wrap gap-1 text-xs">
                      <span>
                        {job.source ? formatSourcePreset(job.source.sourcePreset) : "未知预设"}
                      </span>
                      <span>
                        {job.source ? formatParserType(job.source.parserType) : "未知解析器"}
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-0.5">
                    <p>{formatDateTime(job.startedAt)}</p>
                    <p>{formatDateTime(job.finishedAt)}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <ScanSummary job={job} />
                </TableCell>
                <TableCell>
                  <ErrorSummary errorMessage={job.errorMessage} jobId={job.id} />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      <PaginationControls onPageChange={onPageChange} page={page} />
    </div>
  )
}

function ScanSummary({ job }: { readonly job: ScanJob }) {
  const rows = scanSummaryRows(job)

  return (
    <div className="grid min-w-36 gap-1 text-xs">
      {rows.map((row) => (
        <div
          className={`flex justify-between gap-3 rounded-md border px-2 py-1 tabular-nums ${row.className}`}
          data-testid="scan-summary-row"
          key={row.label}
        >
          <span className="font-medium">{row.label}</span>
          <span className="font-semibold">{row.value}</span>
        </div>
      ))}
    </div>
  )
}

function scanSummaryRows(job: ScanJob): readonly SummaryRow[] {
  return [
    {
      className: "border-sky-200 bg-sky-50 text-sky-900",
      label: "发现",
      value: job.filesDiscovered,
    },
    {
      className: "border-emerald-200 bg-emerald-50 text-emerald-900",
      label: "解析",
      value: job.filesParsed,
    },
    {
      className: "border-rose-200 bg-rose-50 text-rose-900",
      label: "错误",
      value: job.filesFailed,
    },
    {
      className: "border-amber-200 bg-amber-50 text-amber-900",
      label: "导入",
      value: `${job.sessionsImported} / ${job.messagesImported}`,
    },
    {
      className: "border-violet-200 bg-violet-50 text-violet-900",
      label: "片段",
      value: job.chunksCreated,
    },
  ]
}

function ErrorSummary({
  errorMessage,
  jobId,
}: {
  readonly errorMessage: string | null
  readonly jobId: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  if (!errorMessage) return <span className="text-[var(--app-muted)]">-</span>
  const summary = summarizeError(errorMessage)

  return (
    <div className="max-w-96 space-y-2">
      <p className="break-words text-[var(--app-muted)]">{summary}</p>
      <Button
        aria-label={`查看扫描任务 ${jobId} 的错误详情`}
        onPress={() => setIsOpen((current) => !current)}
        radius="sm"
        size="sm"
        variant="flat"
      >
        {isOpen ? "收起详情" : "查看详情"}
      </Button>
      {isOpen ? (
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-danger-50 p-3 text-xs text-danger-900">
          {errorMessage}
        </pre>
      ) : null}
    </div>
  )
}

function PaginationControls({
  onPageChange,
  page,
}: {
  readonly onPageChange: (page: number) => void
  readonly page: PaginatedResponse<ScanJob>
}) {
  const isFirst = page.page <= 1
  const isLast = page.totalPages === 0 || page.page >= page.totalPages

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] px-4 py-3 text-sm text-[var(--app-muted)] sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-2">
        <span>
          第 {page.page} 页，共 {Math.max(page.totalPages, 1)} 页
        </span>
        <span>{page.totalItems} 个任务</span>
      </div>
      <div className="flex gap-2">
        <Button
          aria-label="上一页扫描任务"
          isDisabled={isFirst}
          onPress={() => onPageChange(page.page - 1)}
          radius="sm"
          size="sm"
          startContent={<ChevronLeft aria-hidden="true" className="size-4" />}
          variant="bordered"
        >
          上一页
        </Button>
        <Button
          aria-label="下一页扫描任务"
          isDisabled={isLast}
          onPress={() => onPageChange(page.page + 1)}
          radius="sm"
          size="sm"
          endContent={<ChevronRight aria-hidden="true" className="size-4" />}
          variant="bordered"
        >
          下一页
        </Button>
      </div>
    </div>
  )
}

function statusTone(status: ScanJob["status"]): "neutral" | "success" | "warning" | "danger" {
  switch (status) {
    case "completed":
      return "success"
    case "failed":
      return "danger"
    case "queued":
    case "running":
      return "warning"
  }
}

function formatDateTime(value: string | null): string {
  if (!value) return "-"
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value))
}

function summarizeError(value: string): string {
  if (value.length <= ERROR_SUMMARY_LIMIT) return value
  return `${value.slice(0, ERROR_SUMMARY_LIMIT).trimEnd()}...`
}
