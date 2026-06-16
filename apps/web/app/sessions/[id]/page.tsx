import { PageHeader } from "../../../components/page-header"
import { EmptyState, ErrorState, LoadingState } from "../../../components/state-block"
import { StatusBadge } from "../../../components/status-badge"
import { apiClient } from "../../../lib/api"

type SessionPageProps = {
  readonly params: Promise<{
    readonly id: string
  }>
}

export default async function SessionPage({ params }: SessionPageProps) {
  const { id } = await params

  return (
    <section aria-label="Session detail workspace" className="space-y-5">
      <PageHeader
        actions={
          <StatusBadge>
            GET {apiClient.baseUrl}/sessions/{id}
          </StatusBadge>
        }
        eyebrow="Session detail"
        subtitle="Inspect placeholder message and metadata regions before real session hydration is wired."
        title={`Session ${id}`}
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <EmptyState
          description="No messages are loaded in this skeleton. The main pane is reserved for user, assistant, tool and system message bubbles."
          title="No messages loaded"
        />
        <div className="space-y-4">
          <LoadingState
            description="Displayed while session metadata and messages are fetched from the API client."
            title="Loading session"
          />
          <ErrorState
            description="Displayed when the session endpoint fails or the response does not match the shared contract."
            title="Session unavailable"
          />
        </div>
      </div>
    </section>
  )
}
