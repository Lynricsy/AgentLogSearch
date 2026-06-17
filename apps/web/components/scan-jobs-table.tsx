"use client"

import type { PaginatedResponse, ScanJob } from "@agent-log-search/shared"
import { Button } from "@heroui/react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import type { ReactNode } from "react"
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
      <div className="overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)]">
        <div className="overflow-x-auto">
          <table
            aria-label="Scan jobs"
            className="min-w-full divide-y divide-[var(--app-border)] text-left text-sm"
          >
            <thead className="bg-[var(--app-accent-soft)] text-xs text-[var(--app-muted)]">
              <tr>
                <HeaderCell>Status</HeaderCell>
                <HeaderCell className="min-w-48">Source</HeaderCell>
                <HeaderCell>Started</HeaderCell>
                <HeaderCell>Finished</HeaderCell>
                <HeaderCell>Seen</HeaderCell>
                <HeaderCell>Parsed</HeaderCell>
                <HeaderCell>Failed</HeaderCell>
                <HeaderCell>Imported</HeaderCell>
                <HeaderCell>Chunks</HeaderCell>
                <HeaderCell className="min-w-72">Error</HeaderCell>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--app-border)]">
              {page.items.map((job) => (
                <ScanJobsRow job={job} key={job.id} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <PaginationControls onPageChange={onPageChange} page={page} />
    </div>
  )
}

function ScanJobsRow({ job }: { readonly job: ScanJob }) {
  return (
    <tr className="align-top">
      <BodyCell>
        <StatusBadge tone={statusTone(job.status)}>{job.status}</StatusBadge>
      </BodyCell>
      <BodyCell>
        <div className="space-y-1">
          <p className="font-medium text-[var(--app-ink)]">
            {job.source?.name ?? "Unknown source"}
          </p>
          <div className="flex flex-wrap gap-1 text-xs">
            <span>{job.source?.sourcePreset ?? "unknown"}</span>
            <span>{job.source?.parserType ?? "unknown parser"}</span>
          </div>
        </div>
      </BodyCell>
      <BodyCell>{formatDateTime(job.startedAt)}</BodyCell>
      <BodyCell>{formatDateTime(job.finishedAt)}</BodyCell>
      <NumberCell>{job.filesDiscovered}</NumberCell>
      <NumberCell>{job.filesParsed}</NumberCell>
      <NumberCell>{job.filesFailed}</NumberCell>
      <BodyCell>
        {job.sessionsImported} / {job.messagesImported}
      </BodyCell>
      <NumberCell>{job.chunksCreated}</NumberCell>
      <BodyCell>
        <ErrorSummary errorMessage={job.errorMessage} jobId={job.id} />
      </BodyCell>
    </tr>
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

function HeaderCell({
  children,
  className = "",
}: {
  readonly children: string
  readonly className?: string
}) {
  return <th className={`px-3 py-2 font-medium whitespace-nowrap ${className}`}>{children}</th>
}

function BodyCell({
  children,
  className = "",
}: {
  readonly children: ReactNode
  readonly className?: string
}) {
  return <td className={`px-3 py-3 text-[var(--app-muted)] ${className}`}>{children}</td>
}

function NumberCell({ children }: { readonly children: number }) {
  return <BodyCell className="tabular-nums">{children}</BodyCell>
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
