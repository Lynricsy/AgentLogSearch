"use client"

import type { AgentSource } from "@agent-log-search/shared"
import { Button } from "@heroui/react"
import { Plus, RefreshCw } from "lucide-react"
import type { Dispatch, SetStateAction } from "react"
import { useCallback, useEffect, useState } from "react"

import { type ApiClient, ApiClientError, apiClient } from "../lib/api"
import { PageHeader } from "./page-header"
import {
  formStateToCreateRequest,
  formStateToUpdateRequest,
  type SourceFormState,
  type SourceScanState,
} from "./source-types"
import { type SourceLoadState, SourceWorkspaceView } from "./source-workspace-view"

type SourceWorkspaceProps = {
  readonly client?: ApiClient
}

export function SourceWorkspace({ client = apiClient }: SourceWorkspaceProps) {
  const [loadState, setLoadState] = useState<SourceLoadState>({ kind: "loading" })
  const [editingSource, setEditingSource] = useState<AgentSource | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [scanningId, setScanningId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [scanStates, setScanStates] = useState<Readonly<Record<string, SourceScanState>>>({})

  const load = useCallback(async () => {
    setLoadState({ kind: "loading" })
    try {
      const [sources, presets] = await Promise.all([
        client.listSources(),
        client.listSourcePresets(),
      ])
      setLoadState({ kind: "ready", presets, sources })
    } catch (error) {
      setLoadState({ kind: "error", message: describeError(error) })
    }
  }, [client])

  useEffect(() => {
    void load()
  }, [load])

  async function submitSource(state: SourceFormState) {
    setSubmitting(true)
    setFormError(null)
    try {
      const saved = editingSource
        ? await client.updateSource(editingSource.id, formStateToUpdateRequest(state))
        : await client.createSource(formStateToCreateRequest(state))
      setLoadState((current) => mergeSavedSource(current, saved))
      setEditingSource(null)
      setIsCreateOpen(false)
    } catch (error) {
      setFormError(describeError(error))
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteSource(source: AgentSource) {
    setDeletingId(source.id)
    try {
      await client.deleteSource(source.id)
      setLoadState((current) => removeSource(current, source.id))
    } catch (error) {
      setScanStates((current) => ({
        ...current,
        [source.id]: { message: describeError(error), tone: "danger" },
      }))
    } finally {
      setDeletingId(null)
    }
  }

  async function toggleSource(source: AgentSource, enabled: boolean) {
    setTogglingId(source.id)
    try {
      const saved = await client.updateSource(source.id, { enabled })
      setLoadState((current) => mergeSavedSource(current, saved))
    } catch (error) {
      setScanStates((current) => ({
        ...current,
        [source.id]: { message: describeError(error), tone: "danger" },
      }))
    } finally {
      setTogglingId(null)
    }
  }

  async function runScan(source: AgentSource) {
    setScanningId(source.id)
    setScanStates((current) => ({
      ...current,
      [source.id]: { message: "扫描中", tone: "warning" },
    }))
    try {
      const response = await client.runSourceScan(source.id)
      const record = response.records[0]
      const status = record?.status ?? "completed"
      setScanStates((current) => ({
        ...current,
        [source.id]: {
          message: record?.errorMessage ?? (status === "completed" ? "扫描已完成" : "扫描失败"),
          tone: status === "completed" ? "success" : "danger",
        },
      }))
      await refreshSourcesOnly(client, setLoadState)
    } catch (error) {
      setScanStates((current) => ({
        ...current,
        [source.id]: { message: describeError(error), tone: "danger" },
      }))
    } finally {
      setScanningId(null)
    }
  }

  const openCreateDialog = useCallback(() => {
    setEditingSource(null)
    setFormError(null)
    setIsCreateOpen(true)
  }, [])

  const closeCreateDialog = useCallback(() => {
    setIsCreateOpen(false)
    setFormError(null)
  }, [])

  const openEditForm = useCallback((source: AgentSource) => {
    setIsCreateOpen(false)
    setFormError(null)
    setEditingSource(source)
  }, [])

  const closeEditForm = useCallback(() => {
    setEditingSource(null)
    setFormError(null)
  }, [])

  return (
    <section aria-label="数据源工作区" className="space-y-5">
      <PageHeader
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              aria-label="打开创建数据源对话框"
              color="primary"
              onPress={openCreateDialog}
              radius="sm"
              size="sm"
              startContent={<Plus aria-hidden="true" className="size-4" />}
            >
              创建数据源
            </Button>
            <Button
              aria-label="刷新数据源"
              onPress={load}
              radius="sm"
              size="sm"
              startContent={<RefreshCw aria-hidden="true" className="size-4" />}
              variant="bordered"
            >
              刷新
            </Button>
          </div>
        }
        eyebrow="数据源配置"
        subtitle="管理本机 Agent 历史数据源，应用预设，并按需运行扫描。"
        title="数据源"
      />
      <SourceWorkspaceView
        deletingId={deletingId}
        editingSource={editingSource}
        formError={formError}
        isCreateOpen={isCreateOpen}
        loadState={loadState}
        onCancelCreate={closeCreateDialog}
        onCancelEdit={closeEditForm}
        onCreate={openCreateDialog}
        onDelete={deleteSource}
        onEdit={openEditForm}
        onRetry={load}
        onScan={runScan}
        onSubmit={submitSource}
        onToggle={toggleSource}
        scanStates={scanStates}
        scanningId={scanningId}
        submitting={submitting}
        togglingId={togglingId}
      />
    </section>
  )
}

function describeError(error: unknown): string {
  if (error instanceof ApiClientError) return error.message
  if (error instanceof Error) return error.message
  return "请求失败。"
}

function mergeSavedSource(state: SourceLoadState, saved: AgentSource): SourceLoadState {
  if (state.kind !== "ready") return state
  const exists = state.sources.some((source) => source.id === saved.id)
  const sources = exists
    ? state.sources.map((source) => (source.id === saved.id ? saved : source))
    : [saved, ...state.sources]
  return { ...state, sources }
}

function removeSource(state: SourceLoadState, sourceId: string): SourceLoadState {
  if (state.kind !== "ready") return state
  return { ...state, sources: state.sources.filter((source) => source.id !== sourceId) }
}

async function refreshSourcesOnly(
  client: ApiClient,
  setLoadState: Dispatch<SetStateAction<SourceLoadState>>,
) {
  const sources = await client.listSources()
  setLoadState((current) => (current.kind === "ready" ? { ...current, sources } : current))
}
