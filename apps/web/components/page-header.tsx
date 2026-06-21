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
    <div className="flex flex-col gap-4 border-b border-[var(--app-border)] pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-2">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="h-1 w-6 rounded-full bg-[var(--app-accent)]" />
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--app-muted)]">
            {eyebrow}
          </p>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--app-ink)]">{title}</h1>
        <p className="max-w-2xl text-sm leading-6 text-[var(--app-muted)]">{subtitle}</p>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  )
}
