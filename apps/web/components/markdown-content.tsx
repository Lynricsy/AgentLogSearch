"use client"

import type { ComponentPropsWithoutRef } from "react"
import { memo, useEffect, useId, useState } from "react"
import ReactMarkdown from "react-markdown"
import rehypeKatex from "rehype-katex"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"

type MarkdownContentProps = {
  readonly className?: string
  readonly text: string
}

type CodeProps = ComponentPropsWithoutRef<"code"> & {
  readonly node?: unknown
}

export function MarkdownContent({ className = "", text }: MarkdownContentProps) {
  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown
        components={{
          a: MarkdownLink,
          code: MarkdownCode,
        }}
        rehypePlugins={[rehypeKatex]}
        remarkPlugins={[remarkGfm, remarkMath]}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}

function MarkdownLink(props: ComponentPropsWithoutRef<"a">) {
  return <a {...props} rel="noreferrer" target="_blank" />
}

function MarkdownCode({ children, className, node: _node, ...props }: CodeProps) {
  const language = /language-([a-z0-9_-]+)/iu.exec(className ?? "")?.[1]
  if (language === "mermaid") {
    return <MermaidBlock chart={String(children).trim()} />
  }

  return (
    <code className={className} {...props}>
      {children}
    </code>
  )
}

const MermaidBlock = memo(function MermaidBlock({ chart }: { readonly chart: string }) {
  const rawId = useId()
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function renderChart() {
      try {
        const mermaid = (await import("mermaid")).default
        mermaid.initialize({
          fontFamily: "inherit",
          securityLevel: "strict",
          startOnLoad: false,
          theme: "neutral",
        })
        const id = `mermaid-${rawId.replace(/[^a-zA-Z0-9_-]/gu, "")}`
        const result = await mermaid.render(id, chart)
        if (!cancelled) {
          setSvg(result.svg)
          setError(null)
        }
      } catch (renderError) {
        if (!cancelled) {
          setSvg(null)
          setError(renderError instanceof Error ? renderError.message : "Mermaid 渲染失败")
        }
      }
    }

    void renderChart()

    return () => {
      cancelled = true
    }
  }, [chart, rawId])

  if (error !== null) {
    return (
      <pre className="mermaid-fallback">
        <code>{chart}</code>
      </pre>
    )
  }

  if (svg === null) {
    return <output aria-label="正在渲染 Mermaid 图表" className="mermaid-loading" />
  }

  return (
    <div
      aria-label="Mermaid 图表"
      className="mermaid-diagram"
      role="img"
      // Mermaid returns sanitized SVG when securityLevel is strict.
      // biome-ignore lint/security/noDangerouslySetInnerHtml: Mermaid's official renderer returns sanitized SVG with strict securityLevel.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
})
