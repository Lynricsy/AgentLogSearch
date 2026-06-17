"use client"

import type { AgentSource } from "@agent-log-search/shared"
import { Button } from "@heroui/react"
import { Edit, Play, Trash2 } from "lucide-react"
import type { ReactNode } from "react"
import type { SourceScanState } from "./source-types"
import { StatusBadge } from "./status-badge"

type SourceTableProps = {
  readonly deletingId: string | null
  readonly onDelete: (source: AgentSource) => void
  readonly onEdit: (source: AgentSource) => void
  readonly onScan: (source: AgentSource) => void
  readonly onToggle: (source: AgentSource, enabled: boolean) => void
  readonly scanStates: Readonly<Record<string, SourceScanState>>
  readonly scanningId: string | null
  readonly sources: readonly AgentSource[]
  readonly togglingId: string | null
}

export function SourceTable({
  deletingId,
  onDelete,
  onEdit,
  onScan,
  onToggle,
  scanStates,
  scanningId,
  sources,
  togglingId,
}: SourceTableProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)]">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-[var(--app-border)] text-left text-sm">
          <thead className="bg-[var(--app-accent-soft)] text-xs text-[var(--app-muted)]">
            <tr>
              <HeaderCell className="min-w-48">Name</HeaderCell>
              <HeaderCell className="min-w-32">Preset</HeaderCell>
              <HeaderCell className="min-w-36">Parser</HeaderCell>
              <HeaderCell className="min-w-72">Root path</HeaderCell>
              <HeaderCell className="min-w-56">File glob</HeaderCell>
              <HeaderCell className="min-w-28">Scan interval</HeaderCell>
              <HeaderCell className="min-w-24">Enabled</HeaderCell>
              <HeaderCell className="min-w-36">Last scan</HeaderCell>
              <HeaderCell className="min-w-40">Scan status</HeaderCell>
              <HeaderCell className="w-72 min-w-72">Actions</HeaderCell>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--app-border)]">
            {sources.map((source) => (
              <tr key={source.id} className="align-top">
                <BodyCell>
                  <span className="font-medium text-[var(--app-ink)]">{source.name}</span>
                </BodyCell>
                <BodyCell>{source.sourcePreset}</BodyCell>
                <BodyCell>{source.parserType}</BodyCell>
                <BodyCell>
                  <TruncatedCode value={source.rootPath} />
                </BodyCell>
                <BodyCell>
                  <TruncatedCode value={source.fileGlob} />
                </BodyCell>
                <BodyCell>{formatScanInterval(source.scanIntervalSeconds)}</BodyCell>
                <BodyCell>
                  <label className="inline-flex items-center">
                    <input
                      aria-label={`Toggle ${source.name}`}
                      checked={source.enabled}
                      className="size-4 rounded border-[var(--app-border)] accent-[var(--app-accent)] disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={togglingId === source.id}
                      onChange={(event) => onToggle(source, event.currentTarget.checked)}
                      type="checkbox"
                    />
                  </label>
                </BodyCell>
                <BodyCell>{formatLastScan(source.lastScanAt)}</BodyCell>
                <BodyCell>
                  <ScanStatus sourceId={source.id} states={scanStates} />
                </BodyCell>
                <BodyCell className="w-72 min-w-72">
                  <div className="flex w-64 flex-wrap gap-2">
                    <Button
                      aria-label={`Scan ${source.name}`}
                      isDisabled={!source.enabled}
                      isLoading={scanningId === source.id}
                      onPress={() => onScan(source)}
                      radius="sm"
                      size="sm"
                      startContent={
                        scanningId === source.id ? null : (
                          <Play aria-hidden="true" className="size-4" />
                        )
                      }
                      variant="bordered"
                    >
                      Scan
                    </Button>
                    <Button
                      aria-label={`Edit ${source.name}`}
                      onPress={() => onEdit(source)}
                      radius="sm"
                      size="sm"
                      startContent={<Edit aria-hidden="true" className="size-4" />}
                      variant="flat"
                    >
                      Edit
                    </Button>
                    <Button
                      aria-label={`Delete ${source.name}`}
                      color="danger"
                      isLoading={deletingId === source.id}
                      onPress={() => onDelete(source)}
                      radius="sm"
                      size="sm"
                      startContent={
                        deletingId === source.id ? null : (
                          <Trash2 aria-hidden="true" className="size-4" />
                        )
                      }
                      variant="flat"
                    >
                      Delete
                    </Button>
                  </div>
                </BodyCell>
              </tr>
            ))}
          </tbody>
        </table>
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

function TruncatedCode({ value }: { readonly value: string }) {
  return (
    <code
      className="block max-w-80 truncate whitespace-nowrap rounded bg-[var(--app-accent-soft)] px-2 py-1 text-xs text-[var(--app-ink)]"
      title={value}
    >
      {value}
    </code>
  )
}

function ScanStatus({
  sourceId,
  states,
}: {
  readonly sourceId: string
  readonly states: Readonly<Record<string, SourceScanState>>
}) {
  const state = states[sourceId]
  if (!state) return <StatusBadge>Idle</StatusBadge>
  return <StatusBadge tone={state.tone}>{state.message}</StatusBadge>
}

function formatLastScan(value: string | null): string {
  if (!value) return "never"
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value))
}

function formatScanInterval(seconds: number): string {
  if (seconds % 3_600 === 0) return `${seconds / 3_600} h`
  if (seconds % 60 === 0) return `${seconds / 60} min`
  return `${seconds} s`
}
