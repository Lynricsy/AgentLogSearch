"use client"

import type { SourcePresetMetadata } from "@agent-log-search/shared"
import { Button } from "@heroui/react"
import { Check, Plus, Save } from "lucide-react"
import { useId, useMemo, useState } from "react"
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

const fieldClassName =
  "mt-1 w-full min-w-0 rounded-md border border-[var(--app-border)] bg-white px-3 py-2 text-sm text-[var(--app-ink)] outline-none transition focus:border-[var(--app-accent)] focus:ring-2 focus:ring-[var(--app-accent-soft)]"

const readonlyFieldClassName = `${fieldClassName} bg-[var(--app-accent-soft)] text-[var(--app-muted)]`

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
  const resumeTemplateId = useId()

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
        <label className="flex shrink-0 items-center gap-2 text-xs text-[var(--app-muted)]">
          <input
            checked={state.enabled}
            className="size-4 rounded border-[var(--app-border)] accent-[var(--app-accent)]"
            onChange={(event) =>
              setState((current) => ({ ...current, enabled: event.currentTarget.checked }))
            }
            type="checkbox"
          />
          Enabled
        </label>
      </div>

      <div className="mt-4 grid gap-3">
        <TextField
          error={errors.name}
          label="Source name"
          onChange={(name) => setState((current) => ({ ...current, name }))}
          placeholder="Demo Generic JSONL source"
          value={state.name}
        />
        <label className="min-w-0 text-xs font-medium text-[var(--app-muted)]">
          Preset
          <select
            aria-label="Preset"
            className={fieldClassName}
            onChange={(event) => applyPreset(event.currentTarget.value)}
            value={state.presetId}
          >
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
        <TextField
          error={errors.rootPath}
          label="Root path"
          onChange={(rootPath) => setState((current) => ({ ...current, rootPath }))}
          value={state.rootPath}
        />
        <div className="grid gap-3">
          <TextField
            error={errors.fileGlob}
            label="File glob"
            onChange={(fileGlob) => setState((current) => ({ ...current, fileGlob }))}
            value={state.fileGlob}
          />
          <TextField isReadOnly label="Parser type" value={state.parserType} />
        </div>
        <TextField isReadOnly label="Reader type" value={state.readerType} />
        <TextField
          error={errors.scanIntervalSeconds}
          label="Scan interval seconds"
          onChange={(scanIntervalSeconds) =>
            setState((current) => ({ ...current, scanIntervalSeconds }))
          }
          type="number"
          value={state.scanIntervalSeconds}
        />
        <div className="min-w-0">
          <label className="text-xs font-medium text-[var(--app-muted)]" htmlFor={resumeTemplateId}>
            Resume template
          </label>
          <textarea
            className={`${fieldClassName} min-h-20 resize-y whitespace-pre-wrap`}
            id={resumeTemplateId}
            onChange={(event) =>
              setState((current) => ({ ...current, resumeTemplate: event.currentTarget.value }))
            }
            value={state.resumeTemplate}
          />
          <FieldError message={errors.resumeTemplate} />
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

function TextField({
  error,
  isReadOnly = false,
  label,
  onChange,
  placeholder,
  type = "text",
  value,
}: {
  readonly error?: string | undefined
  readonly isReadOnly?: boolean
  readonly label: string
  readonly onChange?: (value: string) => void
  readonly placeholder?: string
  readonly type?: "number" | "text"
  readonly value: string
}) {
  return (
    <div className="min-w-0">
      <label className="text-xs font-medium text-[var(--app-muted)]">
        {label}
        <input
          className={isReadOnly ? readonlyFieldClassName : fieldClassName}
          onChange={(event) => onChange?.(event.currentTarget.value)}
          placeholder={placeholder}
          readOnly={isReadOnly}
          title={value}
          type={type}
          value={value}
        />
      </label>
      <FieldError message={error} />
    </div>
  )
}

function FieldError({ message }: { readonly message?: string | undefined }) {
  return message ? <span className="mt-1 block text-xs text-danger-700">{message}</span> : null
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
