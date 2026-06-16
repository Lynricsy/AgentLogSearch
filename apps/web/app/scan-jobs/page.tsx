import { PageHeader } from "../../components/page-header"
import { EmptyState, ErrorState, LoadingState } from "../../components/state-block"
import { StatusBadge } from "../../components/status-badge"
import { apiClient } from "../../lib/api"

export default function ScanJobsPage() {
  return (
    <section aria-label="Scan jobs workspace" className="space-y-5">
      <PageHeader
        actions={<StatusBadge>GET {apiClient.baseUrl}/scan-jobs</StatusBadge>}
        eyebrow="Scan jobs"
        subtitle="Track scan job placeholders before manual scanning and scheduler data are implemented."
        title="Scan Jobs"
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <EmptyState
          description="No scan jobs are loaded in the T4 skeleton. This prepares the job list for status, source, file counts and error summaries."
          title="No scan jobs yet"
        />
        <div className="space-y-4">
          <LoadingState
            description="Displayed while scan job rows are fetched from the API client."
            title="Loading scan jobs"
          />
          <ErrorState
            description="Displayed when the scan job endpoint is unavailable or returns invalid data."
            title="Scan jobs unavailable"
          />
        </div>
      </div>
    </section>
  )
}
