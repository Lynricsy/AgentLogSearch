"use client"

import type { ExperienceAttempt } from "@agent-log-search/shared"
import { CheckCircle2, FilePenLine, FlaskConical, Info, XCircle } from "lucide-react"
import type { ReactNode } from "react"
import { formatReasonCode } from "../lib/evidence-labels"
import { describeAttempt, displayTokens, validationSummary } from "../lib/experience-display"
import { OutcomeBadge } from "./outcome-badge"

type AttemptTimelineProps = {
  readonly attempts: readonly ExperienceAttempt[]
}

export function AttemptTimeline({ attempts }: AttemptTimelineProps) {
  if (attempts.length === 0) {
    return (
      <p className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-2 text-sm text-[var(--app-muted)]">
        这是诊断型经验，没有记录到文件修改尝试。
      </p>
    )
  }

  return (
    <ol className="space-y-3">
      {attempts.map((attempt) => (
        <li
          className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-3"
          key={attempt.id}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold">{describeAttempt(attempt)}</h3>
              <p className="mt-1 text-xs text-[var(--app-muted)]">
                尝试 {attempt.attemptIndex + 1} · 事件 #{attempt.startSeq} - #{attempt.endSeq}
              </p>
            </div>
            <OutcomeBadge outcome={attempt.outcome} />
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <AttemptSection
              emptyText="没有记录到明确的修改对象。"
              icon={<FilePenLine aria-hidden="true" className="size-4" />}
              title="修改"
              values={displayTokens([...attempt.affectedPaths, ...attempt.affectedSymbols], {
                limit: 8,
                preferPaths: attempt.affectedPaths.length > 0,
              })}
            />
            <AttemptSection
              emptyText="没有找到修改后的测试、构建、类型检查或 lint 结果。"
              icon={<FlaskConical aria-hidden="true" className="size-4" />}
              title="验证"
              values={validationSummary(attempt)}
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {attempt.reasonCodes.map((code) => (
              <span
                className="rounded-md bg-[var(--app-panel-muted)] px-2 py-1 text-xs text-[var(--app-muted)]"
                key={code}
                title={code}
              >
                {formatReasonCode(code)}
              </span>
            ))}
          </div>
        </li>
      ))}
    </ol>
  )
}

function AttemptSection({
  emptyText,
  icon,
  title,
  values,
}: {
  readonly emptyText: string
  readonly icon: ReactNode
  readonly title: string
  readonly values: readonly string[]
}) {
  const uniqueValues = [...new Set(values.filter((value) => value.trim().length > 0))]

  return (
    <section className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel-muted)]/30 p-3">
      <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--app-muted)]">
        {icon}
        {title}
      </h4>
      {uniqueValues.length === 0 ? (
        <p className="mt-2 flex items-start gap-2 text-sm text-[var(--app-muted)]">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {emptyText}
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {uniqueValues.slice(0, 8).map((value) => (
            <li className="flex min-w-0 items-start gap-2 text-sm" key={value}>
              {title === "验证" ? (
                <CheckCircle2
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-[var(--app-accent)]"
                />
              ) : (
                <XCircle
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-[var(--app-muted)]"
                />
              )}
              <code className="min-w-0 break-words text-xs text-[var(--app-ink)]">{value}</code>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
