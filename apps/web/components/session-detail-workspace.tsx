"use client"

import type { AgentSessionDetail } from "@agent-log-search/shared"
import { Hash, MessageSquareText, Terminal, UserRound } from "lucide-react"
import type { ReactNode } from "react"
import { useEffect, useRef, useState } from "react"

import { type ApiClient, ApiClientError, apiClient } from "../lib/api"
import { MessageBubble } from "./message-bubble"
import { PageHeader } from "./page-header"
import { ResumeCommandBox } from "./resume-command-box"
import { EmptyState, ErrorState, LoadingState } from "./state-block"
import { StatusBadge } from "./status-badge"

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
    <section aria-label="Session detail workspace" className="space-y-5">
      <PageHeader
        actions={
          <StatusBadge tone={state.kind === "ready" ? "success" : "neutral"}>
            GET {client.baseUrl}/sessions/{sessionId}
          </StatusBadge>
        }
        eyebrow="Session detail"
        subtitle="Inspect complete local session messages and copy the resume command without executing it."
        title={
          state.kind === "ready"
            ? (state.session.title ?? `Session ${sessionId}`)
            : `Session ${sessionId}`
        }
      />
      <SessionContent state={state} />
    </section>
  )
}

function SessionContent({ state }: { readonly state: SessionState }) {
  if (state.kind === "loading") {
    return (
      <LoadingState description="Loading session metadata and messages." title="Loading session" />
    )
  }

  if (state.kind === "error") {
    return <ErrorState description={state.message} title="Session unavailable" />
  }

  const session = state.session

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-3">
        {session.messages.length === 0 ? (
          <EmptyState
            description="This session has metadata but no indexed messages."
            title="No messages"
          />
        ) : (
          session.messages.map((message) => <MessageBubble key={message.id} message={message} />)
        )}
      </div>
      <SessionMetadata session={session} />
    </div>
  )
}

function SessionMetadata({ session }: { readonly session: AgentSessionDetail }) {
  const updatedAt = session.updatedAt ?? session.lastMessageAt

  return (
    <aside className="space-y-4 rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
      <h2 className="text-sm font-semibold text-[var(--app-ink)]">Metadata</h2>
      <div className="space-y-3">
        <MetaLine icon={<UserRound aria-hidden="true" className="size-4" />} label="Agent">
          {session.agentName}
        </MetaLine>
        <MetaLine icon={<Hash aria-hidden="true" className="size-4" />} label="Thread ID">
          {session.externalThreadId}
        </MetaLine>
        <MetaLine icon={<Terminal aria-hidden="true" className="size-4" />} label="CWD">
          {session.cwd ?? "未记录"}
        </MetaLine>
        <MetaLine
          icon={<MessageSquareText aria-hidden="true" className="size-4" />}
          label="Messages"
        >
          {String(session.messageCount)}
        </MetaLine>
        <MetaLine label="Updated">{updatedAt ? formatDateTime(updatedAt) : "未记录"}</MetaLine>
      </div>
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
  return "Session request failed."
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value))
}
