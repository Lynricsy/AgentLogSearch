"use client"

import type { SourcePresetMetadata } from "@agent-log-search/shared"
import { Button, Input, Switch, Textarea } from "@heroui/react"
import { Check, Plus, Save } from "lucide-react"
import { useMemo, useState, useId } from "react"
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
}

export function SourceForm({
  apiError,
  initialState,
  isSubmitting,
  mode,
  onCancel,
  onSubmit,
  presets,
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

  const actionLabel = mode === "create" ? "Create source" : "Save source"
  const ActionIcon = mode === "create" ? Plus : Save

  return (
    <div className="min-w-0 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">
            {mode === "create" ? "Create source" : "Edit source"}
          </h2>
          <p className="mt-1 text-xs text-[var(--app-muted)]">
            Presets fill parser, reader, root path, glob, and resume command.
          </p>
        </div>
        <Switch
          classNames={{ label: "text-xs text-[var(--app-muted)]" }}
          isSelected={state.enabled}
          onValueChange={(enabled) => setState((current) => ({ ...current, enabled }))}
          size="sm"
        >
          Enabled
        </Switch>
      </div>

      <div className="mt-4 grid gap-3">
        <div className="min-w-0">
          <Input
            label="Source name"
            labelPlacement="outside"
            onValueChange={(name) => setState((current) => ({ ...current, name }))}
            placeholder="Demo Generic JSONL source"
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
            Preset
          </label>
          <select
            aria-label="Preset"
            className="mt-1 w-full min-w-0 rounded-md border border-[var(--app-border)] bg-white px-3 py-2 text-sm text-[var(--app-ink)] outline-none transition focus:border-[var(--app-accent)] focus:ring-2 focus:ring-[var(--app-accent-soft)] dark:bg-[var(--app-panel)]"
            id={presetSelectId}
            onChange={(event) => applyPreset(event.currentTarget.value)}
            value={state.presetId}
          >
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <Input
            label="Root path"
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
        <div className="grid gap-3">
          <div className="min-w-0">
            <Input
              label="File glob"
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
          <Input
            isReadOnly
            label="Parser type"
            labelPlacement="outside"
            radius="sm"
            size="sm"
            value={state.parserType}
            variant="bordered"
          />
        </div>
        <Input
          isReadOnly
          label="Reader type"
          labelPlacement="outside"
          radius="sm"
          size="sm"
          value={state.readerType}
          variant="bordered"
        />
        <div className="min-w-0">
          <Input
            label="Scan interval seconds"
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
            <span className="mt-1 block text-xs text-danger-700">
              {errors.scanIntervalSeconds}
            </span>
          ) : null}
        </div>
        <div className="min-w-0">
          <Textarea
            label="Resume template"
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

      <div className="mt-4 flex flex-wrap gap-2">
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
          <Button onPress={onCancel} radius="sm" startContent={<Check className="size-4" />}>
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function validateForm(state: SourceFormState): SourceFormErrors {
  return {
    ...(state.name.trim() ? {} : { name: "Source name is required." }),
    ...(isRootPath(state.rootPath)
      ? {}
      : { rootPath: "Root path must be absolute or home-relative." }),
    ...(state.fileGlob.trim() ? {} : { fileGlob: "File glob is required." }),
    ...(state.resumeTemplate.trim() ? {} : { resumeTemplate: "Resume template is required." }),
    ...(isScanIntervalSeconds(state.scanIntervalSeconds)
      ? {}
      : {
          scanIntervalSeconds: "Scan interval must be an integer from 60 to 86400 seconds.",
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
