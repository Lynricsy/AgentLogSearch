"use client"

import { Button, Card, CardBody, CardHeader, Divider, Input } from "@heroui/react"
import { Filter, Search } from "lucide-react"
import { useState } from "react"

import { validateRequiredText } from "../lib/form-validation"
import { PageHeader } from "./page-header"
import { EmptyState, ErrorState, LoadingState } from "./state-block"
import { StatusBadge } from "./status-badge"

export function SearchWorkspace() {
  const [query, setQuery] = useState("")
  const [validationMessage, setValidationMessage] = useState<string | null>(null)

  function validateQuery() {
    const result = validateRequiredText(query, "Semantic query")
    setValidationMessage(result.ok ? null : result.message)
  }

  return (
    <section aria-label="Search workspace" className="space-y-5">
      <PageHeader
        actions={<StatusBadge tone="success">Client contract ready</StatusBadge>}
        eyebrow="Search workspace"
        subtitle="Prepare a semantic query against local Agent CLI sessions. Real result wiring lands in the search feature task."
        title="Search agent history"
      />

      <Card className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] shadow-none">
        <CardHeader className="flex flex-col items-start gap-3 px-4 py-4 sm:flex-row sm:items-end">
          <Input
            aria-label="Search query"
            className="w-full"
            description="Example: previously fixed login API 500"
            errorMessage={validationMessage}
            isInvalid={validationMessage !== null}
            label="Semantic query"
            labelPlacement="outside"
            onValueChange={setQuery}
            placeholder="Search local agent conversations"
            radius="sm"
            startContent={<Search aria-hidden="true" className="size-4 text-[var(--app-muted)]" />}
            value={query}
            variant="bordered"
          />
          <div className="flex w-full gap-2 sm:w-auto">
            <Button
              aria-label="Validate query"
              className="shrink-0"
              color="primary"
              onPress={validateQuery}
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
        <CardBody className="space-y-4 px-4 py-4">
          <EmptyState
            description="No search results are loaded in this skeleton. The page is ready for the `/api/search/semantic` contract without running a real search yet."
            title="No query submitted"
          />
          <LoadingState
            description="Use this while the Web client waits for the semantic search endpoint."
            title="Loading search results"
          />
          <ErrorState
            description="Use this when the API client receives an error response or invalid payload."
            title="Search request failed"
          />
        </CardBody>
      </Card>
    </section>
  )
}
