import { Plus } from "lucide-react"

import { PageHeader } from "../../components/page-header"
import { EmptyState, ErrorState, LoadingState } from "../../components/state-block"
import { StatusBadge } from "../../components/status-badge"
import { apiClient } from "../../lib/api"

export default function SourcesPage() {
  return (
    <section aria-label="Sources workspace" className="space-y-5">
      <PageHeader
        actions={<StatusBadge>GET {apiClient.baseUrl}/sources</StatusBadge>}
        eyebrow="Source configuration"
        subtitle="Review local history source placeholders before source CRUD and manual scan actions are wired."
        title="Sources"
      />
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <EmptyState
            action={
              <button
                className="inline-flex cursor-not-allowed items-center gap-2 rounded-sm bg-[var(--app-accent)] px-3 py-2 text-sm font-medium text-white opacity-60"
                disabled
                type="button"
              >
                <Plus aria-hidden="true" className="size-4" />
                Add source
              </button>
            }
            description="No sources are loaded in the T4 skeleton. This placeholder keeps the table surface ready for `/api/sources`."
            title="No sources configured"
          />
        </div>
        <div className="space-y-4">
          <LoadingState
            description="Displayed while source rows are fetched from the API client."
            title="Loading sources"
          />
          <ErrorState
            description="Displayed when source retrieval fails or returns an invalid payload."
            title="Sources unavailable"
          />
        </div>
      </div>
    </section>
  )
}
