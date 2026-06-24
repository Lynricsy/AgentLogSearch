"use client"

import type { ExperienceCompatibility, ExperienceSummary } from "@agent-log-search/shared"
import { ExternalLink, FileSearch, GitCompare, History, Terminal } from "lucide-react"
import Link from "next/link"

import { EvidenceBadge, formatPercent } from "./evidence-badge"
import { OutcomeBadge } from "./outcome-badge"
import { ScoreBreakdown } from "./score-breakdown"
import { StatusBadge } from "./status-badge"

type ExperienceResultCardProps = {
  readonly experience: ExperienceSummary
}

export function ExperienceResultCard({ experience }: ExperienceResultCardProps) {
  const lastValidationCommand = lastCommand(experience)

  return (
    <article className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <OutcomeBadge outcome={experience.outcome} />
            <EvidenceBadge level={experience.evidenceLevel} score={experience.evidenceScore} />
            <StatusBadge>{experience.attempts.length} 次尝试</StatusBadge>
          </div>
          <h3 className="mt-3 break-words text-base font-semibold text-[var(--app-ink)]">
            {experience.title}
          </h3>
          <p className="mt-1 line-clamp-3 text-sm leading-6 text-[var(--app-muted)]">
            {experience.taskText}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--app-accent)]/15 bg-[var(--app-accent-soft)] px-3 py-2 text-xs font-medium text-[var(--app-accent)] shadow-sm"
            href={`/experiences/${encodeURIComponent(experience.id)}`}
          >
            <FileSearch aria-hidden="true" className="size-4" />
            打开证据
          </Link>
          <Link
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-muted)] px-3 py-2 text-xs font-medium text-[var(--app-muted)] shadow-sm"
            href={`/sessions/${encodeURIComponent(experience.sessionId)}`}
          >
            <ExternalLink aria-hidden="true" className="size-4" />
            原会话
          </Link>
        </div>
      </div>

      {experience.compatibility ? (
        <CompatibilityPanel compatibility={experience.compatibility} />
      ) : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-3">
          <TokenBlock label="匹配错误" tokens={experience.matchedErrors} />
          <TokenBlock label="匹配文件" tokens={experience.matchedPaths} />
          <TokenBlock label="相关命令" tokens={experience.commandFamilies} />
          <div className="flex min-w-0 items-center gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-muted)]/35 px-3 py-2 text-sm">
            <Terminal aria-hidden="true" className="size-4 shrink-0 text-[var(--app-muted)]" />
            <span className="shrink-0 font-medium text-[var(--app-muted)]">最后验证命令</span>
            <code className="min-w-0 break-words text-xs text-[var(--app-ink)]">
              {lastValidationCommand ?? "未记录"}
            </code>
          </div>
        </div>
        <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-muted)]/35 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--app-muted)]">
            <History aria-hidden="true" className="size-4" />
            评分
          </div>
          <ScoreBreakdown score={experience.scoreBreakdown} />
        </div>
      </div>
    </article>
  )
}

function CompatibilityPanel({
  compatibility,
}: {
  readonly compatibility: ExperienceCompatibility
}) {
  const renamedCount = compatibility.files.filter((file) => file.status === "renamed").length
  const missingCount = compatibility.files.filter((file) => file.status === "missing").length
  return (
    <div className="mt-4 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-muted)]/35 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <GitCompare aria-hidden="true" className="size-4 text-[var(--app-muted)]" />
        <span className="text-sm font-medium text-[var(--app-ink)]">仓库兼容性</span>
        <StatusBadge>{compatibilityLevelLabel(compatibility.level)}</StatusBadge>
        <span className="text-xs text-[var(--app-muted)]">
          评分 {formatPercent(compatibility.score)} · 覆盖 {formatPercent(compatibility.coverage)}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--app-muted)]">{compatibility.disclaimer}</p>
      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_14rem]">
        <TokenBlock label="兼容性原因" tokens={compatibility.reasonCodes} />
        <div className="text-xs leading-5 text-[var(--app-muted)]">
          <div>文件 {compatibility.files.length} 个</div>
          <div>重命名 {renamedCount} 个</div>
          <div>缺失 {missingCount} 个</div>
        </div>
      </div>
    </div>
  )
}

function TokenBlock({
  label,
  tokens,
}: {
  readonly label: string
  readonly tokens: readonly string[]
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-xs font-medium text-[var(--app-muted)]">{label}</div>
      {tokens.length === 0 ? (
        <span className="text-sm text-[var(--app-muted)]">未命中</span>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {tokens.slice(0, 8).map((token) => (
            <code
              className="max-w-full break-words rounded bg-[var(--app-accent-soft)] px-1.5 py-0.5 text-xs text-[var(--app-ink)]"
              key={token}
            >
              {token}
            </code>
          ))}
        </div>
      )}
    </div>
  )
}

function lastCommand(experience: ExperienceSummary): string | null {
  return (
    [...experience.attempts]
      .reverse()
      .flatMap((attempt) => attempt.commandFamilies)
      .find((command) => command.trim().length > 0) ?? null
  )
}

function compatibilityLevelLabel(level: ExperienceCompatibility["level"]): string {
  switch (level) {
    case "COMPATIBLE":
      return "兼容"
    case "LIKELY_COMPATIBLE":
      return "大概率兼容"
    case "UNCERTAIN":
      return "证据不足"
    case "LIKELY_STALE":
      return "可能过期"
    case "STALE":
      return "已过期"
  }
}
