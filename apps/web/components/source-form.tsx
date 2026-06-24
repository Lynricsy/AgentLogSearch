"use client"

import type { SourcePresetMetadata } from "@agent-log-search/shared"
import { Button, Input, Switch, Textarea } from "@heroui/react"
import { Plus, Save, X } from "lucide-react"
import { useId, useMemo, useState } from "react"
import { formatSourcePresetMetadataLabel } from "./display-labels"
import {
  createFormStateFromPreset,
  firstPreset,
  type SourceFormErrors,
  type SourceFormMode,
  type SourceFormState,
} from "./source-types"

type SourceFormProps = {
  readonly apiError: string | null
  readonly initialState?: SourceFormState
  readonly isSubmitting: boolean
  readonly mode: SourceFormMode
  readonly onCancel?: () => void
  readonly onSubmit: (state: SourceFormState) => Promise<void>
  readonly presets: readonly SourcePresetMetadata[]
  readonly layout?: "stacked" | "compact"
  readonly showHeader?: boolean
  readonly surface?: "panel" | "plain"
}

export function SourceForm({
  apiError,
  initialState,
  isSubmitting,
  mode,
  onCancel,
  onSubmit,
  presets,
  layout = "stacked",
  showHeader = true,
  surface = "panel",
}: SourceFormProps) {
  const defaultState = useMemo(
    () => initialState ?? createFormStateFromPreset(firstPreset(presets)),
    [initialState, presets],
  )
  const [state, setState] = useState(defaultState)
  const [errors, setErrors] = useState<SourceFormErrors>({})
  const presetSelectId = useId()

  async function submit() {
    const nextErrors = validateForm(state)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    await onSubmit(state)
  }

  function applyPreset(presetId: string) {
    const preset = presets.find((item) => item.id === presetId)
    if (!preset) return
    setState((current) => ({
      ...createFormStateFromPreset(preset),
      enabled: current.enabled,
      name: current.name,
    }))
    setErrors({})
  }

  const actionLabel = mode === "create" ? "创建数据源" : "保存数据源"
  const ActionIcon = mode === "create" ? Plus : Save
  const containerClass =
    surface === "panel"
      ? "min-w-0 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-4"
      : "min-w-0"
  const isCompact = layout === "compact"
  const fieldsClass = isCompact ? "mt-3 grid gap-x-3 gap-y-2 md:grid-cols-2" : "mt-4 grid gap-3"
  const fullFieldClass = isCompact ? "min-w-0 md:col-span-2" : "min-w-0"
  const pairedFieldsClass = isCompact ? "contents" : "grid gap-3"
  const footerClass = isCompact ? "mt-3 flex flex-wrap gap-2" : "mt-4 flex flex-wrap gap-2"

  return (
    <div className={containerClass}>
      <div className={showHeader ? "flex items-start justify-between gap-3" : "flex justify-end"}>
        {showHeader ? (
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">
              {mode === "create" ? "创建数据源" : "编辑数据源"}
            </h2>
            <p className="mt-1 text-xs text-[var(--app-muted)]">
              预设会填充解析器、读取器、根路径、文件匹配规则和恢复命令模板。
            </p>
          </div>
        ) : null}
        <Switch
          classNames={{ label: "text-xs text-[var(--app-muted)]" }}
          isSelected={state.enabled}
          onValueChange={(enabled) => setState((current) => ({ ...current, enabled }))}
          size="sm"
        >
          启用
        </Switch>
      </div>

      <div className={fieldsClass}>
        <div className="min-w-0">
          <Input
            label="数据源名称"
            labelPlacement="outside"
            onValueChange={(name) => setState((current) => ({ ...current, name }))}
            placeholder="本地 JSONL 会话"
            radius="sm"
            size="sm"
            value={state.name}
            variant="bordered"
          />
          {errors.name ? (
            <span className="mt-1 block text-xs text-danger-700">{errors.name}</span>
          ) : null}
        </div>
        <div className="min-w-0">
          <label className="text-xs font-medium text-[var(--app-muted)]" htmlFor={presetSelectId}>
            预设
          </label>
          <select
            aria-label="预设"
            className="mt-1 w-full min-w-0 rounded-md border border-[var(--app-border)] bg-white px-3 py-2 text-sm text-[var(--app-ink)] outline-none transition focus:border-[var(--app-accent)] focus:ring-2 focus:ring-[var(--app-accent-soft)] dark:bg-[var(--app-panel)]"
            id={presetSelectId}
            onChange={(event) => applyPreset(event.currentTarget.value)}
            value={state.presetId}
          >
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {formatSourcePresetMetadataLabel(preset)}
              </option>
            ))}
          </select>
        </div>
        <div className={fullFieldClass}>
          <Input
            label="根路径"
            labelPlacement="outside"
            onValueChange={(rootPath) => setState((current) => ({ ...current, rootPath }))}
            radius="sm"
            size="sm"
            value={state.rootPath}
            variant="bordered"
          />
          {errors.rootPath ? (
            <span className="mt-1 block text-xs text-danger-700">{errors.rootPath}</span>
          ) : null}
        </div>
        <div className={pairedFieldsClass}>
          <div className="min-w-0">
            <Input
              label="文件匹配规则"
              labelPlacement="outside"
              onValueChange={(fileGlob) => setState((current) => ({ ...current, fileGlob }))}
              radius="sm"
              size="sm"
              value={state.fileGlob}
              variant="bordered"
            />
            {errors.fileGlob ? (
              <span className="mt-1 block text-xs text-danger-700">{errors.fileGlob}</span>
            ) : null}
          </div>
          <div className="min-w-0">
            <Input
              isReadOnly
              label="解析器类型"
              labelPlacement="outside"
              radius="sm"
              size="sm"
              value={state.parserType}
              variant="bordered"
            />
          </div>
        </div>
        <div className="min-w-0">
          <Input
            isReadOnly
            label="读取器类型"
            labelPlacement="outside"
            radius="sm"
            size="sm"
            value={state.readerType}
            variant="bordered"
          />
        </div>
        <div className="min-w-0">
          <Input
            label="扫描间隔秒数"
            labelPlacement="outside"
            onValueChange={(scanIntervalSeconds) =>
              setState((current) => ({ ...current, scanIntervalSeconds }))
            }
            radius="sm"
            size="sm"
            type="number"
            value={state.scanIntervalSeconds}
            variant="bordered"
          />
          {errors.scanIntervalSeconds ? (
            <span className="mt-1 block text-xs text-danger-700">{errors.scanIntervalSeconds}</span>
          ) : null}
        </div>
        <div className={fullFieldClass}>
          <Textarea
            label="恢复命令模板"
            labelPlacement="outside"
            onValueChange={(resumeTemplate) =>
              setState((current) => ({ ...current, resumeTemplate }))
            }
            radius="sm"
            size="sm"
            value={state.resumeTemplate}
            variant="bordered"
          />
          {errors.resumeTemplate ? (
            <span className="mt-1 block text-xs text-danger-700">{errors.resumeTemplate}</span>
          ) : null}
        </div>
      </div>

      {apiError ? (
        <p className="mt-3 rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-800">
          {apiError}
        </p>
      ) : null}

      <div className={footerClass}>
        <Button
          color="primary"
          isLoading={isSubmitting}
          onPress={submit}
          radius="sm"
          startContent={isSubmitting ? null : <ActionIcon aria-hidden="true" className="size-4" />}
        >
          {actionLabel}
        </Button>
        {onCancel ? (
          <Button onPress={onCancel} radius="sm" startContent={<X className="size-4" />}>
            取消
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function validateForm(state: SourceFormState): SourceFormErrors {
  return {
    ...(state.name.trim() ? {} : { name: "数据源名称不能为空。" }),
    ...(isRootPath(state.rootPath)
      ? {}
      : { rootPath: "根路径必须是绝对路径或以 ~ 开头的主目录路径。" }),
    ...(state.fileGlob.trim() ? {} : { fileGlob: "文件匹配规则不能为空。" }),
    ...(state.resumeTemplate.trim() ? {} : { resumeTemplate: "恢复命令模板不能为空。" }),
    ...(isScanIntervalSeconds(state.scanIntervalSeconds)
      ? {}
      : {
          scanIntervalSeconds: "扫描间隔必须是 60 到 86400 秒之间的整数。",
        }),
  }
}

function isRootPath(value: string): boolean {
  const trimmed = value.trim()
  return trimmed === "~" || trimmed.startsWith("/") || trimmed.startsWith("~/")
}

function isScanIntervalSeconds(value: string): boolean {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return false
  const seconds = Number(trimmed)
  return Number.isSafeInteger(seconds) && seconds >= 60 && seconds <= 86_400
}
