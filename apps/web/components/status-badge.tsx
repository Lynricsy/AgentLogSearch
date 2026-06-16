"use client"

import { Chip } from "@heroui/react"
import type { ReactNode } from "react"

type StatusTone = "neutral" | "success" | "warning" | "danger"

const toneToColor = {
  neutral: "default",
  success: "success",
  warning: "warning",
  danger: "danger",
} as const satisfies Record<StatusTone, "default" | "success" | "warning" | "danger">

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  readonly children: ReactNode
  readonly tone?: StatusTone
}) {
  return (
    <Chip className="w-fit" color={toneToColor[tone]} radius="sm" size="sm" variant="flat">
      {children}
    </Chip>
  )
}
