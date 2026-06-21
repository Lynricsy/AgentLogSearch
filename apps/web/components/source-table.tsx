"use client"

import type { AgentSource } from "@agent-log-search/shared"
import {
  Button,
  ButtonGroup,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tooltip,
} from "@heroui/react"
import { Edit, Play, Trash2 } from "lucide-react"
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
    <Table
      aria-label="Sources"
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
        <TableColumn key="source" isRowHeader>
          Source
        </TableColumn>
        <TableColumn key="parser">Parser</TableColumn>
        <TableColumn key="path">Path</TableColumn>
        <TableColumn key="schedule">Schedule</TableColumn>
        <TableColumn key="enabled">Enabled</TableColumn>
        <TableColumn key="status">Status</TableColumn>
        <TableColumn key="actions">Actions</TableColumn>
      </TableHeader>
      <TableBody>
        {sources.map((source) => (
          <TableRow key={source.id}>
            <TableCell>
              <div className="space-y-0.5">
                <span className="font-medium text-[var(--app-ink)]">{source.name}</span>
                <span className="block text-xs text-[var(--app-muted)]">{source.sourcePreset}</span>
              </div>
            </TableCell>
            <TableCell>{source.parserType}</TableCell>
            <TableCell>
              <div className="space-y-1">
                <Tooltip content={source.rootPath}>
                  <code className="block max-w-80 truncate whitespace-nowrap rounded bg-[var(--app-accent-soft)] px-2 py-1 text-xs text-[var(--app-ink)]">
                    {source.rootPath}
                  </code>
                </Tooltip>
                <Tooltip content={source.fileGlob}>
                  <code className="block max-w-80 truncate whitespace-nowrap rounded bg-[var(--app-accent-soft)] px-2 py-1 text-xs text-[var(--app-ink)]">
                    {source.fileGlob}
                  </code>
                </Tooltip>
              </div>
            </TableCell>
            <TableCell>
              <div className="space-y-0.5">
                <span>{formatScanInterval(source.scanIntervalSeconds)}</span>
                <span className="block text-xs">{formatLastScan(source.lastScanAt)}</span>
              </div>
            </TableCell>
            <TableCell>
              <Switch
                aria-label={`Toggle ${source.name}`}
                isDisabled={togglingId === source.id}
                isSelected={source.enabled}
                onValueChange={(enabled) => onToggle(source, enabled)}
                size="sm"
              />
            </TableCell>
            <TableCell>
              <ScanStatus sourceId={source.id} states={scanStates} />
            </TableCell>
            <TableCell>
              <ButtonGroup radius="sm" size="sm" variant="flat">
                <Button
                  aria-label={`Scan ${source.name}`}
                  isDisabled={!source.enabled}
                  isLoading={scanningId === source.id}
                  onPress={() => onScan(source)}
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
                  startContent={
                    deletingId === source.id ? null : (
                      <Trash2 aria-hidden="true" className="size-4" />
                    )
                  }
                  variant="flat"
                >
                  Delete
                </Button>
              </ButtonGroup>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
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
