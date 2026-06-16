"use client"

import { Button, Spinner } from "@heroui/react"
import { AlertTriangle, Inbox } from "lucide-react"
import type { ReactNode } from "react"

type BaseStateBlockProps = {
  readonly title: string
  readonly description: string
}

export function LoadingState({ description, title }: BaseStateBlockProps) {
  return (
    <div className="flex min-h-36 items-center gap-3 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] px-4 py-5">
      <Spinner color="primary" size="sm" />
      <div className="min-w-0">
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="mt-1 text-sm text-[var(--app-muted)]">{description}</p>
      </div>
    </div>
  )
}

export function EmptyState({
  action,
  description,
  title,
}: BaseStateBlockProps & { readonly action?: ReactNode }) {
  return (
    <div className="flex min-h-44 flex-col items-start justify-center rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] px-4 py-5">
      <Inbox aria-hidden="true" className="size-5 text-[var(--app-muted)]" />
      <h2 className="mt-3 text-sm font-medium">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--app-muted)]">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function ErrorState({
  description,
  onRetry,
  title,
}: BaseStateBlockProps & { readonly onRetry?: () => void }) {
  return (
    <div className="flex min-h-44 flex-col items-start justify-center rounded-lg border border-danger-200 bg-danger-50 px-4 py-5 text-danger-800">
      <AlertTriangle aria-hidden="true" className="size-5" />
      <h2 className="mt-3 text-sm font-medium">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm leading-6">{description}</p>
      {onRetry ? (
        <Button
          className="mt-4"
          color="danger"
          radius="sm"
          size="sm"
          variant="flat"
          onPress={onRetry}
        >
          Retry
        </Button>
      ) : null}
    </div>
  )
}
