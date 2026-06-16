import type { LucideIcon } from "lucide-react"
import { Database, History, Search, Settings } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

type NavItem = {
  readonly href: string
  readonly label: string
  readonly status: "ready" | "future"
  readonly Icon: LucideIcon
}

const navItems = [
  { href: "/search", label: "Search", status: "ready", Icon: Search },
  { href: "/sources", label: "Sources", status: "ready", Icon: Database },
  { href: "/scan-jobs", label: "Scan Jobs", status: "ready", Icon: History },
  { href: "/settings", label: "Settings", status: "future", Icon: Settings },
] as const satisfies readonly NavItem[]

export function AppShell({ children }: { readonly children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--app-ink)]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col lg:flex-row">
        <aside className="border-[var(--app-border)] border-b bg-[var(--app-panel)] px-4 py-3 lg:w-64 lg:border-r lg:border-b-0 lg:px-5 lg:py-6">
          <div className="flex items-center justify-between gap-3 lg:block">
            <div>
              <p className="text-sm font-semibold">AgentLogSearch</p>
              <p className="mt-1 text-xs text-[var(--app-muted)]">Local semantic history</p>
            </div>
            <span className="rounded-md border border-[var(--app-border)] px-2 py-1 text-xs text-[var(--app-muted)] lg:mt-4 lg:inline-block">
              localhost
            </span>
          </div>
          <nav
            aria-label="Primary navigation"
            className="mt-4 flex gap-2 overflow-x-auto lg:flex-col"
          >
            {navItems.map((item) => (
              <ShellNavLink item={item} key={item.href} />
            ))}
          </nav>
        </aside>
        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">{children}</main>
      </div>
    </div>
  )
}

function ShellNavLink({ item }: { readonly item: NavItem }) {
  const isFuture = item.status === "future"
  const Icon = item.Icon

  if (isFuture) {
    return (
      <span className="flex min-w-max items-center gap-2 rounded-md border border-transparent px-3 py-2 text-sm text-[var(--app-muted)] opacity-70">
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        <span>{item.label}</span>
        <span className="rounded border border-[var(--app-border)] px-1.5 py-0.5 text-[10px]">
          soon
        </span>
      </span>
    )
  }

  return (
    <Link
      className="flex min-w-max items-center gap-2 rounded-md border border-[var(--app-border)] bg-[var(--app-accent-soft)] px-3 py-2 text-sm font-medium text-[var(--app-accent)]"
      href={item.href}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span>{item.label}</span>
    </Link>
  )
}
