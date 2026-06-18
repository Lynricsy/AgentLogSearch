"use client"

import type { AgentMessage, AgentRole } from "@agent-log-search/shared"

type MessageBubbleProps = {
  readonly message: AgentMessage
}

type BubbleStyle = {
  readonly bubble: string
  readonly padding: string
  readonly wrapper: string
}

const roleStyles = {
  assistant: {
    bubble:
      "w-full max-w-3xl border-[var(--app-border)] bg-[var(--app-panel)] text-[var(--app-ink)] lg:w-[calc(100%+0.75rem)] lg:shrink-0",
    padding: "px-3 lg:px-2",
    wrapper: "justify-start",
  },
  system: {
    bubble: "border-slate-200 bg-slate-100 text-slate-700",
    padding: "px-4",
    wrapper: "justify-center",
  },
  tool: {
    bubble: "border-slate-200 bg-slate-100 text-slate-700",
    padding: "px-4",
    wrapper: "justify-center",
  },
  unknown: {
    bubble: "border-slate-200 bg-slate-100 text-slate-700",
    padding: "px-4",
    wrapper: "justify-center",
  },
  user: {
    bubble: "border-[var(--app-accent)] bg-[var(--app-accent)] text-white",
    padding: "px-4",
    wrapper: "justify-end",
  },
} satisfies Record<AgentRole, BubbleStyle>

export function MessageBubble({ message }: MessageBubbleProps) {
  const style = roleStyles[message.role]

  return (
    <div className={`flex ${style.wrapper}`} data-testid={`message-bubble-${message.role}`}>
      <article className={`rounded-lg border py-3 shadow-sm ${style.padding} ${style.bubble}`}>
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium opacity-80">
          <span>{message.role}</span>
          <span>#{message.seqNo}</span>
          {message.createdAt ? (
            <time dateTime={message.createdAt}>{formatDateTime(message.createdAt)}</time>
          ) : null}
        </div>
        <p className="overflow-x-auto whitespace-pre-wrap break-normal text-pretty text-sm leading-6">
          {message.content}
        </p>
      </article>
    </div>
  )
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value))
}
