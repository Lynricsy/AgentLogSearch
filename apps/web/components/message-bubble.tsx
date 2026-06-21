"use client"

import type { AgentMessage, AgentRole } from "@agent-log-search/shared"
import { HelpCircle, Info, Wrench } from "lucide-react"
import type { ReactNode } from "react"

type MessageBubbleProps = {
  readonly message: AgentMessage
}

type BubbleStyle = {
  readonly bubble: string
  readonly icon?: ReactNode
  readonly mono: boolean
  readonly padding: string
  readonly radius: string
  readonly wrapper: string
}

const roleStyles: Record<AgentRole, BubbleStyle> = {
  user: {
    bubble: "border-[var(--app-accent)] bg-[var(--app-accent)] text-white",
    icon: undefined,
    mono: false,
    padding: "px-4",
    radius: "rounded-2xl rounded-br-sm",
    wrapper: "justify-end",
  },
  assistant: {
    bubble:
      "border-[var(--app-border)] bg-[var(--app-panel)] text-[var(--app-ink)] max-w-[85%]",
    icon: undefined,
    mono: false,
    padding: "px-4",
    radius: "rounded-2xl rounded-bl-sm",
    wrapper: "justify-start",
  },
  tool: {
    bubble: "border-slate-200 bg-slate-100 text-slate-700",
    icon: <Wrench aria-hidden="true" className="size-3.5 shrink-0" />,
    mono: true,
    padding: "px-4",
    radius: "rounded-lg",
    wrapper: "justify-center",
  },
  system: {
    bubble: "border-amber-300 bg-amber-50/70 text-amber-900",
    icon: <Info aria-hidden="true" className="size-3.5 shrink-0" />,
    mono: false,
    padding: "px-4",
    radius: "rounded-lg",
    wrapper: "justify-center",
  },
  unknown: {
    bubble: "border-dashed border-slate-300 bg-slate-50/50 text-slate-600",
    icon: <HelpCircle aria-hidden="true" className="size-3.5 shrink-0" />,
    mono: false,
    padding: "px-4",
    radius: "rounded-lg",
    wrapper: "justify-center",
  },
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const style = roleStyles[message.role]

  return (
    <div className={`flex ${style.wrapper}`} data-testid={`message-bubble-${message.role}`}>
      <article
        className={`border py-3 shadow-sm ${style.padding} ${style.radius} ${style.bubble}`}
      >
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium opacity-80">
          {style.icon}
          <span>{message.role}</span>
          <span>#{message.seqNo}</span>
          {message.createdAt ? (
            <time dateTime={message.createdAt}>{formatDateTime(message.createdAt)}</time>
          ) : null}
        </div>
        <p
          className={`overflow-x-auto whitespace-pre-wrap break-normal text-pretty text-sm leading-6${
            style.mono ? " font-mono" : ""
          }`}
        >
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
