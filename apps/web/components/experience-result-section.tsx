"use client"

import type { ExperienceSummary } from "@agent-log-search/shared"

import { ExperienceResultCard } from "./experience-result-card"

type ExperienceResultSectionProps = {
  readonly description: string
  readonly experiences: readonly ExperienceSummary[]
  readonly title: string
}

export function ExperienceResultSection({
  description,
  experiences,
  title,
}: ExperienceResultSectionProps) {
  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-1 border-b border-[var(--app-border)] pb-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[var(--app-ink)]">{title}</h2>
          <p className="mt-1 text-sm text-[var(--app-muted)]">{description}</p>
        </div>
        <span className="text-xs font-medium text-[var(--app-muted)]">{experiences.length} 条</span>
      </div>
      {experiences.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--app-border)] bg-[var(--app-panel)] px-3 py-3 text-sm text-[var(--app-muted)]">
          当前查询没有落入这一组的经验。
        </p>
      ) : (
        <div className="space-y-3">
          {experiences.map((experience) => (
            <ExperienceResultCard experience={experience} key={experience.id} />
          ))}
        </div>
      )}
    </section>
  )
}
