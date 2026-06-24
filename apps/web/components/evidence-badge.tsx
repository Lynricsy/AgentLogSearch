"use client"

import { Gauge } from "lucide-react"

import { StatusBadge } from "./status-badge"

export function EvidenceBadge({
  level,
  score,
}: {
  readonly level: string
  readonly score: number
}) {
  return (
    <StatusBadge tone={score >= 0.75 ? "success" : score >= 0.45 ? "warning" : "neutral"}>
      <span className="inline-flex items-center gap-1">
        <Gauge aria-hidden="true" className="size-3.5" />
        证据 {level} · {formatPercent(score)}
      </span>
    </StatusBadge>
  )
}

export function formatPercent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100).toString()}%`
}
