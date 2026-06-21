"use client"

import { HeroUIProvider } from "@heroui/react"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import type { ReactNode } from "react"

export function Providers({ children }: { readonly children: ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <HeroUIProvider locale="zh-CN" reducedMotion="user">
        {children}
      </HeroUIProvider>
    </NextThemesProvider>
  )
}
