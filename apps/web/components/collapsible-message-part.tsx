"use client"

import { ChevronLeft } from "lucide-react"
import type { ReactNode } from "react"
import { useState } from "react"

type CollapsibleMessagePartProps = {
  readonly children: ReactNode
  readonly className: string
  readonly header: ReactNode
  readonly label: string
  readonly testId: string
}

export function CollapsibleMessagePart({
  children,
  className,
  header,
  label,
  testId,
}: CollapsibleMessagePartProps) {
  const [isOpen, setIsOpen] = useState(false)
  const actionLabel = isOpen ? "收起" : "展开"

  return (
    <section
      className={`collapsible-part rounded-lg border px-3 py-3 shadow-sm ${className}`}
      data-open={isOpen ? "true" : "false"}
      data-testid={testId}
    >
      <button
        aria-expanded={isOpen}
        aria-label={`${label}，点击${actionLabel}`}
        className="flex w-full cursor-pointer items-center gap-2 text-left text-xs font-semibold"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span className="grid size-6 shrink-0 place-items-center rounded-md border border-current/15 bg-white/35 text-current shadow-sm transition-colors duration-200 dark:bg-white/10">
          <ChevronLeft
            aria-hidden="true"
            className={`size-4 transition-transform duration-200 ease-out ${isOpen ? "rotate-90" : ""}`}
          />
        </span>
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{header}</span>
      </button>
      <div aria-hidden={!isOpen} className="collapsible-part-content">
        <div className="min-h-0 overflow-hidden">
          <div className="mt-2 border-t border-current/10 pt-2">{children}</div>
        </div>
      </div>
    </section>
  )
}
