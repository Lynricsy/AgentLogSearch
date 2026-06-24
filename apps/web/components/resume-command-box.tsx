"use client"

import { Button, Card } from "@heroui/react"
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
    <Card className="border border-[var(--app-border)] bg-[var(--app-accent-soft)] p-3" radius="sm">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-[var(--app-muted)]">恢复命令</p>
          {command === null ? null : (
            <Button
              aria-label={`复制 ${threadId} 的恢复命令`}
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
              {copyState.kind === "copied" ? "已复制" : "复制"}
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
              aria-label={`${threadId} 的手动恢复命令`}
              className="min-h-20 w-full resize-y rounded-md border border-danger-200 bg-white px-3 py-2 text-xs text-[var(--app-ink)] outline-none"
              id={fallbackId}
              readOnly
              value={command}
            />
          </div>
        ) : null}
      </div>
    </Card>
  )
}

const fallbackState: Extract<CopyState, { readonly kind: "fallback" }> = {
  kind: "fallback",
  message: "剪贴板不可用，请手动选择并复制命令。",
}
