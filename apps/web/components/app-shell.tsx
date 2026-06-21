"use client"

import { Button } from "@heroui/react"
import type { LucideIcon } from "lucide-react"
import { Database, ScanLine, Search, Settings } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

import { ThemeSwitch } from "./theme-switch"

type NavItem = {
  readonly href: string
  readonly label: string
  readonly status: "ready" | "future"
  readonly Icon: LucideIcon
}

const navItems = [
  { href: "/search", label: "Search", status: "ready", Icon: Search },
  { href: "/sources", label: "Sources", status: "ready", Icon: Database },
  { href: "/scan-jobs", label: "Scan Jobs", status: "ready", Icon: ScanLine },
  { href: "/settings", label: "Settings", status: "future", Icon: Settings },
] as const satisfies readonly NavItem[]

export function AppShell({ children }: { readonly children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--app-ink)]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col lg:flex-row">
        <aside className="border-[var(--app-border)] border-b bg-[var(--app-panel)] px-4 py-3 lg:flex lg:w-56 lg:flex-col lg:border-r lg:border-b-0 lg:px-4 lg:py-6">
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
            className="mt-3 flex gap-2 overflow-x-auto lg:mt-6 lg:flex-col lg:gap-1 lg:overflow-visible"
          >
            {navItems.map((item) => (
              <ShellNavLink item={item} key={item.href} />
            ))}
          </nav>
          <div className="mt-4 lg:mt-auto lg:pt-4">
            <ThemeSwitch />
          </div>
        </aside>
        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">{children}</main>
      </div>
    </div>
  )
}

function ShellNavLink({ item }: { readonly item: NavItem }) {
  const pathname = usePathname()
  const isFuture = item.status === "future"
  const Icon = item.Icon
  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)

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
    <Button
      as={Link}
      className="min-w-max justify-start lg:w-full"
      color={isActive ? "primary" : "default"}
      href={item.href}
      radius="sm"
      size="sm"
      variant={isActive ? "flat" : "light"}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span>{item.label}</span>
    </Button>
  )
}
