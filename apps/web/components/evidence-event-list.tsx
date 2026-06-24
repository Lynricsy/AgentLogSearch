"use client"

import type { EvidenceEventSummary } from "@agent-log-search/shared"
import { Code2, FileText, Terminal } from "lucide-react"
import type { ReactNode } from "react"

import { formatOperationKind } from "../lib/evidence-labels"
import { StatusBadge } from "./status-badge"

type EvidenceEventListProps = {
  readonly events: readonly EvidenceEventSummary[]
}

export function EvidenceEventList({ events }: EvidenceEventListProps) {
  if (events.length === 0) {
    return (
      <p className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-2 text-sm text-[var(--app-muted)]">
        没有可展示的 trace evidence。
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {events.map((event) => (
        <article
          className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-3"
          key={event.id}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge>{formatOperationKind(event.operationKind)}</StatusBadge>
                <StatusBadge>{event.pairingQuality}</StatusBadge>
                <span className="text-xs font-medium text-[var(--app-muted)]">
                  事件 #{event.seqNo}.{event.subSeqNo}
                </span>
              </div>
              <p className="mt-2 break-words text-sm text-[var(--app-ink)]">
                {event.redactedExcerpt ?? "该证据没有可展示的脱敏摘要。"}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-1 text-[var(--app-muted)]">
              {event.toolName ? (
                <EvidencePill icon={<Terminal className="size-3.5" />} value={event.toolName} />
              ) : null}
              {event.callId ? (
                <EvidencePill icon={<Code2 className="size-3.5" />} value={event.callId} />
              ) : null}
            </div>
          </div>

          <TokenRow
            icon={<FileText className="size-3.5" />}
            label="文件"
            tokens={event.pathTokens}
          />
          <TokenRow
            label="错误"
            tokens={[...new Set([...event.errorCodes, ...event.errorSignatures])]}
          />
          <TokenRow label="命令" tokens={event.commandFamilies} />
        </article>
      ))}
    </div>
  )
}

function EvidencePill({ icon, value }: { readonly icon: ReactNode; readonly value: string }) {
  return (
    <span className="inline-flex max-w-44 items-center gap-1 truncate rounded-md border border-[var(--app-border)] px-2 py-1 text-xs">
      {icon}
      <span className="truncate">{value}</span>
    </span>
  )
}

function TokenRow({
  icon,
  label,
  tokens,
}: {
  readonly icon?: ReactNode
  readonly label: string
  readonly tokens: readonly string[]
}) {
  if (tokens.length === 0) return null
  return (
    <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--app-muted)]">
        {icon}
        {label}
      </span>
      {tokens.slice(0, 8).map((token) => (
        <code
          className="max-w-full break-words rounded bg-[var(--app-accent-soft)] px-1.5 py-0.5 text-xs text-[var(--app-ink)]"
          key={token}
        >
          {token}
        </code>
      ))}
    </div>
  )
}
