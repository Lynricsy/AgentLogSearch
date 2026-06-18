"use client"

import { Button } from "@heroui/react"
import { Check, Copy } from "lucide-react"
import { useId, useState } from "react"

type CopyState =
  | { readonly kind: "idle" }
  | { readonly kind: "copied" }
  | { readonly kind: "fallback"; readonly message: string }

type ResumeCommandBoxProps = {
  readonly command: string | null
  readonly threadId: string
}

export function ResumeCommandBox({ command, threadId }: ResumeCommandBoxProps) {
  const [copyState, setCopyState] = useState<CopyState>({ kind: "idle" })
  const fallbackId = useId()

  async function copyCommand() {
    if (command === null) {
      return
    }

    const clipboard = navigator.clipboard
    if (!clipboard) {
      setCopyState(fallbackState)
      return
    }

    try {
      await clipboard.writeText(command)
      setCopyState({ kind: "copied" })
    } catch (error) {
      if (error instanceof DOMException || error instanceof Error) {
        setCopyState(fallbackState)
        return
      }
      setCopyState(fallbackState)
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-[var(--app-border)] bg-[var(--app-accent-soft)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-[var(--app-muted)]">Resume command</p>
        {command === null ? null : (
          <Button
            aria-label={`Copy resume command for ${threadId}`}
            onPress={copyCommand}
            radius="sm"
            size="sm"
            startContent={
              copyState.kind === "copied" ? (
                <Check aria-hidden="true" className="size-4" />
              ) : (
                <Copy aria-hidden="true" className="size-4" />
              )
            }
            variant="flat"
          >
            {copyState.kind === "copied" ? "Copied" : "Copy"}
          </Button>
        )}
      </div>
      <code className="block overflow-x-auto whitespace-pre rounded bg-white px-3 py-2 text-xs text-[var(--app-ink)]">
        {command ?? "未记录"}
      </code>
      {copyState.kind === "fallback" && command !== null ? (
        <div className="space-y-2">
          <p className="text-xs text-danger-700">{copyState.message}</p>
          <textarea
            aria-label={`Manual resume command for ${threadId}`}
            className="min-h-20 w-full resize-y rounded-md border border-danger-200 bg-white px-3 py-2 text-xs text-[var(--app-ink)] outline-none"
            id={fallbackId}
            readOnly
            value={command}
          />
        </div>
      ) : null}
    </div>
  )
}

const fallbackState: Extract<CopyState, { readonly kind: "fallback" }> = {
  kind: "fallback",
  message: "Clipboard unavailable. Select and copy the command manually.",
}
