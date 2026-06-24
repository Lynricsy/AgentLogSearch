import type { Metadata } from "next"
import type { ReactNode } from "react"

import "katex/dist/katex.min.css"
import "./globals.css"
import { AppShell } from "../components/app-shell"
import { Providers } from "./providers"

export const metadata: Metadata = {
  title: "AgentLogSearch",
  description: "面向 Agent CLI 会话历史的本地优先语义搜索",
}

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  )
}
