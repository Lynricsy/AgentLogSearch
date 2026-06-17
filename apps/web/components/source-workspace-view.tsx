"use client"

import type { AgentSource, SourcePresetMetadata } from "@agent-log-search/shared"
import { Button } from "@heroui/react"
import { Plus } from "lucide-react"

import { SourceForm } from "./source-form"
import { SourceTable } from "./source-table"
import {
  createFormStateFromSource,
  firstPreset,
  type SourceFormState,
  type SourceScanState,
} from "./source-types"
import { EmptyState, ErrorState, LoadingState } from "./state-block"

export type SourceLoadState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | {
      readonly kind: "ready"
      readonly presets: readonly SourcePresetMetadata[]
      readonly sources: readonly AgentSource[]
    }

type SourceWorkspaceViewProps = {
  readonly deletingId: string | null
  readonly editingSource: AgentSource | null
  readonly formError: string | null
  readonly loadState: SourceLoadState
  readonly onCancelEdit: () => void
  readonly onDelete: (source: AgentSource) => void
  readonly onEdit: (source: AgentSource) => void
  readonly onRetry: () => void
  readonly onScan: (source: AgentSource) => void
  readonly onSubmit: (state: SourceFormState) => Promise<void>
  readonly onToggle: (source: AgentSource, enabled: boolean) => void
  readonly scanStates: Readonly<Record<string, SourceScanState>>
  readonly scanningId: string | null
  readonly submitting: boolean
  readonly togglingId: string | null
}

export function SourceWorkspaceView(props: SourceWorkspaceViewProps) {
  if (props.loadState.kind === "loading") {
    return <LoadingState description="Fetching source rows and presets." title="Loading sources" />
  }
  if (props.loadState.kind === "error") {
    return (
      <ErrorState
        description={props.loadState.message}
        onRetry={props.onRetry}
        title="Sources unavailable"
      />
    )
  }
  return <ReadyWorkspace {...props} loadState={props.loadState} />
}

type EditWorkspaceProps = SourceWorkspaceViewProps & {
  readonly editingSource: AgentSource
  readonly loadState: Extract<SourceLoadState, { readonly kind: "ready" }>
}

type CreateWorkspaceProps = SourceWorkspaceViewProps & {
  readonly editingSource: null
  readonly loadState: Extract<SourceLoadState, { readonly kind: "ready" }>
}

function ReadyWorkspace(
  props: SourceWorkspaceViewProps & {
    readonly loadState: Extract<SourceLoadState, { readonly kind: "ready" }>
  },
) {
  if (props.editingSource) {
    return <EditWorkspace {...props} editingSource={props.editingSource} />
  }
  return <CreateWorkspace {...props} editingSource={null} />
}

function SourceRows(props: SourceWorkspaceViewProps) {
  if (props.loadState.kind !== "ready") return null
  const { sources } = props.loadState
  return (
    <div className="min-w-0 space-y-4">
      {sources.length === 0 ? (
        <EmptyState
          action={
            <Button
              isDisabled
              radius="sm"
              size="sm"
              startContent={<Plus aria-hidden="true" className="size-4" />}
              variant="flat"
            >
              Create source from form
            </Button>
          }
          description="Create a source from a preset, then run a manual scan to import sessions."
          title="No sources configured"
        />
      ) : (
        <SourceTable
          deletingId={props.deletingId}
          onDelete={props.onDelete}
          onEdit={props.onEdit}
          onScan={props.onScan}
          onToggle={props.onToggle}
          scanStates={props.scanStates}
          scanningId={props.scanningId}
          sources={sources}
          togglingId={props.togglingId}
        />
      )}
    </div>
  )
}

function EditWorkspace(props: EditWorkspaceProps) {
  const { presets } = props.loadState
  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <SourceRows {...props} />
      <SourceForm
        apiError={props.formError}
        initialState={createFormStateFromSource(props.editingSource, presets)}
        isSubmitting={props.submitting}
        key={props.editingSource.id}
        mode="edit"
        onCancel={props.onCancelEdit}
        onSubmit={props.onSubmit}
        presets={presets.length > 0 ? presets : [firstPreset(presets)]}
      />
    </div>
  )
}

function CreateWorkspace(props: CreateWorkspaceProps) {
  const { presets } = props.loadState
  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <SourceRows {...props} />
      <SourceForm
        apiError={props.formError}
        isSubmitting={props.submitting}
        key="create"
        mode="create"
        onSubmit={props.onSubmit}
        presets={presets.length > 0 ? presets : [firstPreset(presets)]}
      />
    </div>
  )
}
