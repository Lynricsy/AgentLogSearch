import type { Metadata } from "next"
import type { ReactNode } from "react"

import "./globals.css"
import { AppShell } from "../components/app-shell"
import { Providers } from "./providers"

export const metadata: Metadata = {
  title: "AgentLogSearch",
  description: "Local-first semantic search for Agent CLI conversation history",
}

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  )
}
