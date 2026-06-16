"use client"

import { HeroUIProvider } from "@heroui/react"
import type { ReactNode } from "react"

export function Providers({ children }: { readonly children: ReactNode }) {
  return (
    <HeroUIProvider locale="zh-CN" reducedMotion="user">
      {children}
    </HeroUIProvider>
  )
}
