"use client"

import type { AgentSessionDetail } from "@agent-log-search/shared"
import { Card, ScrollShadow, Skeleton } from "@heroui/react"
import { Clock, Hash, MessageSquare, MessageSquareText, Terminal, UserRound } from "lucide-react"
import type { ReactNode } from "react"
import { useEffect, useRef, useState } from "react"

import { type ApiClient, ApiClientError, apiClient } from "../lib/api"
import { formatAgentName, formatDisplayName } from "./display-labels"
import { MessageBubble } from "./message-bubble"
import { PageHeader } from "./page-header"
import { ResumeCommandBox } from "./resume-command-box"
import { EmptyState, ErrorState } from "./state-block"

type SessionDetailWorkspaceProps = {
  readonly client?: ApiClient
  readonly sessionId: string
}

type SessionState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly session: AgentSessionDetail }
  | { readonly kind: "error"; readonly message: string }

export function SessionDetailWorkspace({
  client = apiClient,
  sessionId,
}: SessionDetailWorkspaceProps) {
  const requestIdRef = useRef(0)
  const [state, setState] = useState<SessionState>({ kind: "loading" })

  useEffect(() => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setState({ kind: "loading" })

    client
      .getSession(sessionId)
      .then((session) => {
        if (requestIdRef.current === requestId) {
          setState({ kind: "ready", session })
        }
      })
      .catch((error: unknown) => {
        if (requestIdRef.current === requestId) {
          setState({ kind: "error", message: describeError(error) })
        }
      })
  }, [client, sessionId])

  return (
    <section aria-label="会话详情工作区" className="space-y-5">
      <PageHeader
        eyebrow="会话详情"
        subtitle="查看本机完整会话消息，并复制恢复命令但不执行。"
        title={
          state.kind === "ready"
            ? formatDisplayName(state.session.title, `会话 ${sessionId}`)
            : `会话 ${sessionId}`
        }
      />
      <SessionContent state={state} />
    </section>
  )
}

function SessionContent({ state }: { readonly state: SessionState }) {
  if (state.kind === "loading") {
    return <LoadingDetail />
  }

  if (state.kind === "error") {
    return <ErrorState description={state.message} title="会话暂不可用" />
  }

  const session = state.session

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <ScrollShadow
        className="h-[calc(100vh-8rem)] space-y-3 pr-2"
        hideScrollBar
        orientation="vertical"
        size={60}
      >
        {session.messages.length === 0 ? (
          <EmptyState description="这个会话有元数据，但没有已索引的消息。" title="没有消息" />
        ) : (
          session.messages.map((message) => <MessageBubble key={message.id} message={message} />)
        )}
      </ScrollShadow>
      <SessionMetadata session={session} />
    </div>
  )
}

function LoadingDetail() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4">
      <h2 className="text-sm font-medium">正在加载会话</h2>
      <span className="sr-only">正在加载会话元数据和消息。</span>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-28 w-full rounded-lg" />
        </div>
      </div>
    </div>
  )
}

function SessionMetadata({ session }: { readonly session: AgentSessionDetail }) {
  const updatedAt = session.updatedAt ?? session.lastMessageAt

  return (
    <aside className="space-y-3">
      <Card className="border border-[var(--app-border)] bg-[var(--app-panel)] p-4" radius="lg">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--app-muted)]">
          基本信息
        </h3>
        <div className="space-y-3">
          <MetaLine icon={<UserRound aria-hidden="true" className="size-4" />} label="Agent">
            {formatAgentName(session.agentName)}
          </MetaLine>
          <MetaLine icon={<Hash aria-hidden="true" className="size-4" />} label="线程 ID">
            {session.externalThreadId}
          </MetaLine>
          <MetaLine icon={<Terminal aria-hidden="true" className="size-4" />} label="工作目录">
            {session.cwd ?? "未记录"}
          </MetaLine>
        </div>
      </Card>
      <Card className="border border-[var(--app-border)] bg-[var(--app-panel)] p-4" radius="lg">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--app-muted)]">
          时间线
        </h3>
        <div className="space-y-3">
          <MetaLine icon={<Clock aria-hidden="true" className="size-4" />} label="开始时间">
            {session.startedAt ? formatDateTime(session.startedAt) : "未记录"}
          </MetaLine>
          <MetaLine icon={<MessageSquare aria-hidden="true" className="size-4" />} label="最后消息">
            {session.lastMessageAt ? formatDateTime(session.lastMessageAt) : "未记录"}
          </MetaLine>
          <MetaLine icon={<Clock aria-hidden="true" className="size-4" />} label="更新时间">
            {updatedAt ? formatDateTime(updatedAt) : "未记录"}
          </MetaLine>
        </div>
      </Card>
      <Card className="border border-[var(--app-border)] bg-[var(--app-panel)] p-4" radius="lg">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--app-muted)]">
          统计
        </h3>
        <div className="space-y-3">
          <MetaLine
            icon={<MessageSquareText aria-hidden="true" className="size-4" />}
            label="消息数"
          >
            {String(session.messageCount)}
          </MetaLine>
        </div>
      </Card>
      <ResumeCommandBox command={session.resumeCommand} threadId={session.externalThreadId} />
    </aside>
  )
}

function MetaLine({
  children,
  icon,
  label,
}: {
  readonly children: string
  readonly icon?: ReactNode
  readonly label: string
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 text-xs font-medium text-[var(--app-muted)]">
        {icon}
        <span>{label}</span>
      </div>
      <code className="mt-1 block min-w-0 break-words rounded bg-[var(--app-accent-soft)] px-2 py-1 text-xs text-[var(--app-ink)]">
        {children}
      </code>
    </div>
  )
}

function describeError(error: unknown): string {
  if (error instanceof ApiClientError) return error.message
  if (error instanceof Error) return error.message
  return "会话请求失败。"
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value))
}
