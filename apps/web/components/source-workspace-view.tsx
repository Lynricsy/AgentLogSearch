"use client"

import type { AgentSource, SourcePresetMetadata } from "@agent-log-search/shared"
import { Button, Modal, ModalBody, ModalContent, ModalHeader } from "@heroui/react"
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
  readonly isCreateOpen: boolean
  readonly loadState: SourceLoadState
  readonly onCancelCreate: () => void
  readonly onCancelEdit: () => void
  readonly onCreate: () => void
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
    return <LoadingState description="正在获取数据源行和预设。" title="正在加载数据源" />
  }
  if (props.loadState.kind === "error") {
    return (
      <ErrorState
        description={props.loadState.message}
        onRetry={props.onRetry}
        title="数据源暂不可用"
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
              aria-label="从空状态创建数据源"
              color="primary"
              onPress={props.onCreate}
              radius="sm"
              size="sm"
              startContent={<Plus aria-hidden="true" className="size-4" />}
            >
              创建数据源
            </Button>
          }
          description="创建数据源后，可以手动扫描并导入会话。"
          title="尚未配置数据源"
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
  return (
    <>
      <SourceRows {...props} />
      <CreateSourceDialog {...props} />
    </>
  )
}

function CreateSourceDialog(props: CreateWorkspaceProps) {
  const { presets } = props.loadState
  if (!props.isCreateOpen) return null

  return (
    <Modal
      isDismissable={!props.submitting}
      isOpen={props.isCreateOpen}
      onOpenChange={(open) => {
        if (!open) props.onCancelCreate()
      }}
      scrollBehavior="inside"
      size="2xl"
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <span>创建数据源</span>
          <span className="text-xs font-normal text-[var(--app-muted)]">
            选择预设后补齐路径和扫描参数，保存后即可运行扫描。
          </span>
        </ModalHeader>
        <ModalBody className="pb-6">
          <SourceForm
            apiError={props.formError}
            isSubmitting={props.submitting}
            key="create-dialog"
            layout="compact"
            mode="create"
            onCancel={props.onCancelCreate}
            onSubmit={props.onSubmit}
            presets={presets.length > 0 ? presets : [firstPreset(presets)]}
            showHeader={false}
            surface="plain"
          />
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}
