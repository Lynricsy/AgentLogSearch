"use client"

import type { PaginatedResponse, ScanJob } from "@agent-log-search/shared"
import { Button, Skeleton, Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@heroui/react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useState } from "react"

import { StatusBadge } from "./status-badge"

const ERROR_SUMMARY_LIMIT = 96

type ScanJobsTableProps = {
  readonly onPageChange: (page: number) => void
  readonly page: PaginatedResponse<ScanJob>
}

export function ScanJobsTable({ onPageChange, page }: ScanJobsTableProps) {
  return (
    <div className="space-y-3">
      <Table
        aria-label="Scan jobs"
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
            Status
          </TableColumn>
          <TableColumn key="source">Source</TableColumn>
          <TableColumn key="time">Time</TableColumn>
          <TableColumn key="summary">Summary</TableColumn>
          <TableColumn key="error">Error</TableColumn>
        </TableHeader>
        <TableBody
          isLoading={false}
          loadingContent={<Skeleton className="h-12 w-full rounded-lg" />}
          emptyContent="No matching scan jobs for this filter."
        >
          {page.items.map((job) => (
            <TableRow key={job.id}>
              <TableCell>
                <StatusBadge tone={statusTone(job.status)}>{job.status}</StatusBadge>
              </TableCell>
              <TableCell>
                <div className="space-y-1">
                  <p className="font-medium text-[var(--app-ink)]">
                    {job.source?.name ?? "Unknown source"}
                  </p>
                  <div className="flex flex-wrap gap-1 text-xs">
                    <span>{job.source?.sourcePreset ?? "unknown"}</span>
                    <span>{job.source?.parserType ?? "unknown parser"}</span>
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
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between gap-2 tabular-nums">
                    <span className="text-[var(--app-muted)]">Seen</span>
                    <span>{job.filesDiscovered}</span>
                  </div>
                  <div className="flex justify-between gap-2 tabular-nums">
                    <span className="text-[var(--app-muted)]">Parsed</span>
                    <span>{job.filesParsed}</span>
                  </div>
                  <div className="flex justify-between gap-2 tabular-nums">
                    <span className="text-[var(--app-muted)]">Errors</span>
                    <span>{job.filesFailed}</span>
                  </div>
                  <div className="flex justify-between gap-2 tabular-nums">
                    <span className="text-[var(--app-muted)]">Imported</span>
                    <span>
                      {job.sessionsImported} / {job.messagesImported}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2 tabular-nums">
                    <span className="text-[var(--app-muted)]">Chunks</span>
                    <span>{job.chunksCreated}</span>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <ErrorSummary errorMessage={job.errorMessage} jobId={job.id} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <PaginationControls onPageChange={onPageChange} page={page} />
    </div>
  )
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
        aria-label={`View error details for scan job ${jobId}`}
        onPress={() => setIsOpen((current) => !current)}
        radius="sm"
        size="sm"
        variant="flat"
      >
        {isOpen ? "Hide details" : "View details"}
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
          Page {page.page} of {Math.max(page.totalPages, 1)}
        </span>
        <span>{page.totalItems} jobs</span>
      </div>
      <div className="flex gap-2">
        <Button
          aria-label="Previous scan jobs page"
          isDisabled={isFirst}
          onPress={() => onPageChange(page.page - 1)}
          radius="sm"
          size="sm"
          startContent={<ChevronLeft aria-hidden="true" className="size-4" />}
          variant="bordered"
        >
          Previous
        </Button>
        <Button
          aria-label="Next scan jobs page"
          isDisabled={isLast}
          onPress={() => onPageChange(page.page + 1)}
          radius="sm"
          size="sm"
          endContent={<ChevronRight aria-hidden="true" className="size-4" />}
          variant="bordered"
        >
          Next
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
