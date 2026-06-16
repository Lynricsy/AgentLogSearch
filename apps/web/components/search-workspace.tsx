"use client"

import { Button, Card, CardBody, CardHeader, Chip, Divider, Input } from "@heroui/react"
import { Filter, Search } from "lucide-react"

const sampleRows = [
  {
    id: "abc123",
    title: "Login API 500 debugging notes",
    source: "Codex CLI",
    cwd: "~/Projects/auth-service",
    updated: "2026-06-12",
  },
  {
    id: "scan-draft",
    title: "Scan import strategy discussion",
    source: "Claude Code",
    cwd: "~/Projects/CliSearch",
    updated: "2026-06-08",
  },
] as const

export function SearchWorkspace() {
  return (
    <section aria-label="Search workspace" className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium text-[var(--app-muted)]">Search workspace</p>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--app-ink)]">
            Search agent history
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--app-muted)]">
            Query local Agent CLI sessions before API search is wired. This shell keeps the first
            surface operational and ready for T4 data states.
          </p>
        </div>
        <Chip className="w-fit" color="success" size="sm" variant="flat">
          Shell ready
        </Chip>
      </div>

      <Card className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] shadow-none">
        <CardHeader className="flex flex-col items-start gap-3 px-4 py-4 sm:flex-row sm:items-end">
          <Input
            aria-label="Search query"
            className="w-full"
            description="Example: previously fixed login API 500"
            label="Semantic query"
            labelPlacement="outside"
            placeholder="Search local agent conversations"
            radius="sm"
            startContent={<Search aria-hidden="true" className="size-4 text-[var(--app-muted)]" />}
            variant="bordered"
          />
          <div className="flex w-full gap-2 sm:w-auto">
            <Button
              className="shrink-0"
              color="primary"
              radius="sm"
              startContent={<Search aria-hidden="true" className="size-4" />}
            >
              Search
            </Button>
            <Button
              className="shrink-0"
              radius="sm"
              startContent={<Filter aria-hidden="true" className="size-4" />}
              variant="bordered"
            >
              Filters
            </Button>
          </div>
        </CardHeader>
        <Divider />
        <CardBody className="px-0 py-0">
          <div className="grid grid-cols-[minmax(0,1fr)_7rem_7rem] gap-3 border-[var(--app-border)] border-b px-4 py-2 text-xs font-medium text-[var(--app-muted)]">
            <span>Session</span>
            <span>Source</span>
            <span>Updated</span>
          </div>
          <div className="divide-y divide-[var(--app-border)]">
            {sampleRows.map((row) => (
              <article
                className="grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_7rem_7rem] sm:gap-3"
                key={row.id}
              >
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-medium">{row.title}</h2>
                  <p className="mt-1 truncate text-xs text-[var(--app-muted)]">{row.cwd}</p>
                </div>
                <span className="text-xs text-[var(--app-muted)]">{row.source}</span>
                <span className="text-xs text-[var(--app-muted)]">{row.updated}</span>
              </article>
            ))}
          </div>
        </CardBody>
      </Card>
    </section>
  )
}
