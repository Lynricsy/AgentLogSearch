"use client"

import type { AgentMessage, AgentMessagePart, AgentRole } from "@agent-log-search/shared"
import {
  Bot,
  Brain,
  FileText,
  HelpCircle,
  Info,
  MessageSquareText,
  UserRound,
  Wrench,
} from "lucide-react"
import type { ReactNode } from "react"

import { CollapsibleMessagePart } from "./collapsible-message-part"
import { formatMessageRole } from "./display-labels"
import { MarkdownContent } from "./markdown-content"

type MessageBubbleProps = {
  readonly message: AgentMessage
}

type BubbleStyle = {
  readonly header: string
  readonly icon: ReactNode
  readonly partShell: string
  readonly wrapper: string
}

type PartStyle = {
  readonly body: string
  readonly icon: ReactNode
  readonly label: string
  readonly mono: boolean
}

const roleStyles: Record<AgentRole, BubbleStyle> = {
  user: {
    header:
      "border-emerald-200 bg-emerald-50/80 text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100",
    icon: <UserRound aria-hidden="true" className="size-4 shrink-0" />,
    partShell: "max-w-[88%]",
    wrapper: "justify-end",
  },
  assistant: {
    header:
      "border-sky-200 bg-sky-50/80 text-sky-950 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100",
    icon: <Bot aria-hidden="true" className="size-4 shrink-0" />,
    partShell: "max-w-[88%]",
    wrapper: "justify-start",
  },
  tool: {
    header:
      "border-slate-200 bg-slate-100/90 text-slate-800 dark:border-slate-500/30 dark:bg-slate-500/15 dark:text-slate-100",
    icon: <Wrench aria-hidden="true" className="size-4 shrink-0" />,
    partShell: "max-w-[92%]",
    wrapper: "justify-center",
  },
  system: {
    header:
      "border-amber-200 bg-amber-50/85 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100",
    icon: <Info aria-hidden="true" className="size-4 shrink-0" />,
    partShell: "max-w-[92%]",
    wrapper: "justify-center",
  },
  unknown: {
    header:
      "border-dashed border-[var(--app-border)] bg-white/70 text-[var(--app-muted)] dark:bg-white/5",
    icon: <HelpCircle aria-hidden="true" className="size-4 shrink-0" />,
    partShell: "max-w-[92%]",
    wrapper: "justify-center",
  },
}

const partStyles: Record<AgentMessagePart["kind"], PartStyle> = {
  assistant_response: {
    body: "border-sky-200 bg-sky-50/90 text-sky-950 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-100",
    icon: <MessageSquareText aria-hidden="true" className="size-4 shrink-0" />,
    label: "Agent 回复",
    mono: false,
  },
  metadata: {
    body: "border-indigo-200 bg-indigo-50/80 text-indigo-950 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-100",
    icon: <Info aria-hidden="true" className="size-4 shrink-0" />,
    label: "元数据",
    mono: true,
  },
  text: {
    body: "border-[var(--app-border)] bg-white/85 text-[var(--app-ink)] dark:bg-white/5",
    icon: <FileText aria-hidden="true" className="size-4 shrink-0" />,
    label: "内容",
    mono: false,
  },
  thinking: {
    body: "border-amber-200 bg-amber-50/85 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100",
    icon: <Brain aria-hidden="true" className="size-4 shrink-0" />,
    label: "思考",
    mono: false,
  },
  tool_call: {
    body: "border-violet-200 bg-violet-50/85 text-violet-950 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-100",
    icon: <Wrench aria-hidden="true" className="size-4 shrink-0" />,
    label: "工具调用",
    mono: true,
  },
  unknown: {
    body: "border-dashed border-[var(--app-border)] bg-white/60 text-[var(--app-muted)] dark:bg-white/5",
    icon: <HelpCircle aria-hidden="true" className="size-4 shrink-0" />,
    label: "未知",
    mono: false,
  },
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const style = roleStyles[message.role]
  const parts = message.parts ?? [
    {
      kind:
        message.role === "assistant"
          ? "assistant_response"
          : message.role === "tool"
            ? "tool_call"
            : message.role === "unknown"
              ? "unknown"
              : "text",
      label: formatMessageRole(message.role),
      text: message.content,
    },
  ]

  return (
    <div className={`flex ${style.wrapper}`} data-testid={`message-bubble-${message.role}`}>
      <article className={`w-full space-y-2 ${style.partShell}`}>
        <div className={`rounded-lg border px-3 py-2 shadow-sm ${style.header}`}>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            {style.icon}
            <span>{formatMessageRole(message.role)}</span>
            <span>#{message.seqNo}</span>
            {message.model ? <span>{message.model}</span> : null}
            {message.createdAt ? (
              <time dateTime={message.createdAt}>{formatDateTime(message.createdAt)}</time>
            ) : null}
          </div>
        </div>
        <div className="space-y-2">
          {parts.map((part, index) => (
            <MessagePartCard
              defaultCollapsed={shouldCollapseAssistantPart(message.role, part)}
              index={index}
              key={`${message.id}-${part.kind}-${index}`}
              part={part}
            />
          ))}
        </div>
      </article>
    </div>
  )
}

function MessagePartCard({
  defaultCollapsed,
  index,
  part,
}: {
  readonly defaultCollapsed: boolean
  readonly index: number
  readonly part: AgentMessagePart
}) {
  const style = partStyles[part.kind]
  const label = part.label === style.label ? style.label : `${style.label} · ${part.label}`
  const contentClassName = `overflow-x-auto whitespace-pre-wrap break-words text-sm leading-6 ${
    style.mono ? "font-mono" : ""
  }`
  const header = (
    <>
      {style.icon}
      <span>{label}</span>
      {index > 0 ? <span className="opacity-70">#{index + 1}</span> : null}
    </>
  )
  const content = style.mono ? (
    <pre className={contentClassName}>{part.text}</pre>
  ) : shouldRenderMarkdown(part) ? (
    <MarkdownContent className={contentClassName} text={part.text} />
  ) : (
    <p className={contentClassName}>{part.text}</p>
  )

  if (defaultCollapsed) {
    return (
      <CollapsibleMessagePart
        className={style.body}
        header={header}
        label={label}
        testId={`message-part-${part.kind}`}
      >
        {content}
      </CollapsibleMessagePart>
    )
  }

  return (
    <article
      className={`rounded-lg border px-3 py-3 shadow-sm ${style.body}`}
      data-testid={`message-part-${part.kind}`}
    >
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold">{header}</div>
      {content}
    </article>
  )
}

function shouldCollapseAssistantPart(role: AgentRole, part: AgentMessagePart): boolean {
  return role === "assistant" && part.kind !== "assistant_response"
}

function shouldRenderMarkdown(part: AgentMessagePart): boolean {
  return part.kind === "assistant_response" || part.kind === "thinking" || part.kind === "text"
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value))
}
