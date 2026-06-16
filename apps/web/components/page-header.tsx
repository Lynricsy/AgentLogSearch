import type { ReactNode } from "react"

export function PageHeader({
  actions,
  eyebrow,
  subtitle,
  title,
}: {
  readonly actions?: ReactNode
  readonly eyebrow: string
  readonly subtitle: string
  readonly title: string
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-medium text-[var(--app-muted)]">{eyebrow}</p>
        <h1 className="mt-1 text-2xl font-semibold text-[var(--app-ink)]">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--app-muted)]">{subtitle}</p>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  )
}
