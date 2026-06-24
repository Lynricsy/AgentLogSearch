"use client"

import type {
  AgentRole,
  SemanticSearchMatchedChunk,
  SemanticSearchResult,
} from "@agent-log-search/shared"
import { Card, Chip } from "@heroui/react"
import { motion } from "framer-motion"
import {
  Bot,
  Brain,
  ExternalLink,
  FileText,
  FolderOpen,
  Hash,
  Info,
  MessageSquareText,
  UserRound,
  Wrench,
} from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import { CollapsibleMessagePart } from "./collapsible-message-part"
import { formatAgentName, formatDisplayName } from "./display-labels"
import { MarkdownContent } from "./markdown-content"
import { ResumeCommandBox } from "./resume-command-box"
import { StatusBadge } from "./status-badge"

type SearchResultCardProps = {
  readonly result: SemanticSearchResult
}

type MessagePart = NonNullable<SemanticSearchMatchedChunk["messages"]>[number]["parts"][number]

type MessageStyle = {
  readonly body: string
  readonly icon: ReactNode
  readonly label: string
  readonly mono: boolean
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
}

const roleLabels: Record<AgentRole, string> = {
  assistant: "Agent",
  system: "系统",
  tool: "工具",
  unknown: "未知",
  user: "用户",
}

const partStyles: Record<MessagePart["kind"], MessageStyle> = {
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
    icon: <Info aria-hidden="true" className="size-4 shrink-0" />,
    label: "未知",
    mono: false,
  },
}

export function SearchResultCard({ result }: SearchResultCardProps) {
  const title = formatDisplayName(result.title, "未命名会话")
  const detailHref = `/sessions/${encodeURIComponent(result.sessionId)}`

  return (
    <Card
      className="border border-white/25 bg-white/55 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-black/35"
      radius="lg"
    >
      <motion.div
        animate="visible"
        className="space-y-4 p-4"
        initial={false}
        variants={containerVariants}
      >
        <motion.div
          className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"
          variants={itemVariants}
        >
          <div className="min-w-0">
            <h2 className="break-words text-base font-semibold text-[var(--app-ink)]">{title}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <Chip color="primary" radius="sm" size="sm" variant="flat">
                匹配度 {formatScore(result.score)}
              </Chip>
              <StatusBadge>{formatAgentName(result.agentName)}</StatusBadge>
              <StatusBadge>{result.messageCount} 条消息</StatusBadge>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-start gap-2">
            <Link
              aria-label={`打开 ${title} 的详情`}
              className="inline-flex w-fit items-center gap-2 rounded-lg border border-[var(--app-accent)]/15 bg-[var(--app-accent-soft)] px-3 py-2 text-xs font-medium text-[var(--app-accent)] shadow-sm"
              href={detailHref}
            >
              <ExternalLink aria-hidden="true" className="size-4" />
              打开详情
            </Link>
          </div>
        </motion.div>

        <motion.div className="space-y-2" variants={itemVariants}>
          <p className="flex items-center gap-2 text-xs font-medium text-[var(--app-muted)]">
            <MessageSquareText aria-hidden="true" className="size-4" />
            匹配片段
          </p>
          <div className="space-y-2">
            {result.matchedChunks.map((chunk) => (
              <MatchedChunkCard
                agentName={result.agentName}
                chunk={chunk}
                cwd={result.cwd}
                key={chunk.chunkId}
                threadId={result.threadId}
              />
            ))}
          </div>
        </motion.div>

        <motion.div variants={itemVariants}>
          <ResumeCommandBox command={result.resumeCommand} threadId={result.threadId} />
        </motion.div>
      </motion.div>
    </Card>
  )
}

function MatchedChunkCard({
  agentName,
  chunk,
  cwd,
  threadId,
}: {
  readonly agentName: string
  readonly chunk: SemanticSearchMatchedChunk
  readonly cwd: string | null
  readonly threadId: string
}) {
  const metadata = chunk.metadata
  const displayAgentName = formatAgentName(metadata?.agentName ?? agentName)
  const displayCwd = metadata?.cwd ?? cwd ?? "未记录"
  const displayThreadId = metadata?.threadId ?? threadId
  const messages = chunk.messages ?? []
  const sequenceLabel = sequenceRange(chunk)

  return (
    <article className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] shadow-sm">
      <div className="flex flex-col gap-2 border-b border-[var(--app-border)] bg-[var(--app-panel-muted)]/45 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="rounded-md bg-white/80 px-2 py-1 font-mono text-xs font-semibold text-[var(--app-ink)] shadow-sm dark:bg-white/10">
            {chunk.chunkId}
          </span>
          <span className="text-xs font-medium text-[var(--app-muted)]">
            片段匹配度 {formatScore(chunk.score)}
          </span>
          {sequenceLabel ? (
            <span className="text-xs font-medium text-[var(--app-muted)]">{sequenceLabel}</span>
          ) : null}
        </div>
        {metadata?.part ? (
          <span className="w-fit rounded-full border border-[var(--app-border)] bg-white/70 px-2.5 py-1 text-xs font-medium text-[var(--app-muted)] dark:bg-white/10">
            Part {metadata.part}
          </span>
        ) : null}
      </div>

      <div className="space-y-3 p-3">
        <div className="grid gap-2 lg:grid-cols-[minmax(9rem,0.8fr)_minmax(12rem,1.25fr)_minmax(14rem,1.5fr)]">
          <SnippetMetaPill
            icon={<Bot aria-hidden="true" className="size-4" />}
            label="Agent"
            value={displayAgentName}
          />
          <SnippetMetaPill
            icon={<FolderOpen aria-hidden="true" className="size-4" />}
            label="CWD"
            value={displayCwd}
          />
          <SnippetMetaPill
            icon={<Hash aria-hidden="true" className="size-4" />}
            label="Thread"
            value={displayThreadId}
          />
        </div>

        <div className="space-y-2">
          {messages.length > 0 ? (
            messages.map((message) => (
              <SnippetMessageCard key={`${chunk.chunkId}-${message.id}`} message={message} />
            ))
          ) : (
            <SnippetFallbackCard snippet={chunk.snippet} />
          )}
        </div>
      </div>
    </article>
  )
}

function SnippetMetaPill({
  icon,
  label,
  value,
}: {
  readonly icon: ReactNode
  readonly label: string
  readonly value: string
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-[var(--app-border)] bg-white/75 px-3 py-2 text-xs shadow-sm dark:bg-white/5">
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-[var(--app-accent-soft)] text-[var(--app-accent)]">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="font-semibold uppercase tracking-wide text-[var(--app-muted)]">{label}</div>
        <div className="truncate font-medium text-[var(--app-ink)]" title={value}>
          {value}
        </div>
      </div>
    </div>
  )
}

function SnippetMessageCard({
  message,
}: {
  readonly message: NonNullable<SemanticSearchMatchedChunk["messages"]>[number]
}) {
  const roleIcon =
    message.role === "user" ? <UserRound className="size-4" /> : <Bot className="size-4" />

  return (
    <section className="rounded-lg border border-[var(--app-border)] bg-white/55 p-2.5 shadow-sm dark:bg-white/5">
      <div className="mb-2 flex flex-wrap items-center gap-2 px-1 text-xs font-semibold text-[var(--app-muted)]">
        {roleIcon}
        <span>{roleLabels[message.role]}</span>
        <span>#{message.seqNo}</span>
        {message.model ? <span>{message.model}</span> : null}
      </div>
      <div className="space-y-2">
        {message.parts.map((part, index) => (
          <SnippetPartCard
            defaultCollapsed={shouldCollapseAssistantPart(message.role, part)}
            index={index}
            key={`${message.id}-${part.kind}-${index}`}
            part={part}
          />
        ))}
      </div>
    </section>
  )
}

function SnippetPartCard({
  defaultCollapsed,
  index,
  part,
}: {
  readonly defaultCollapsed: boolean
  readonly index: number
  readonly part: MessagePart
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
        testId={`snippet-part-${part.kind}`}
      >
        {content}
      </CollapsibleMessagePart>
    )
  }

  return (
    <article
      className={`rounded-lg border px-3 py-3 shadow-sm ${style.body}`}
      data-testid={`snippet-part-${part.kind}`}
    >
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold">{header}</div>
      {content}
    </article>
  )
}

function shouldCollapseAssistantPart(role: AgentRole, part: MessagePart): boolean {
  return role === "assistant" && part.kind !== "assistant_response"
}

function shouldRenderMarkdown(part: MessagePart): boolean {
  return part.kind === "assistant_response" || part.kind === "thinking" || part.kind === "text"
}

function SnippetFallbackCard({ snippet }: { readonly snippet: string }) {
  return (
    <article className="rounded-lg border border-[var(--app-border)] bg-white/80 px-3 py-3 text-[var(--app-ink)] shadow-sm dark:bg-white/5">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[var(--app-muted)]">
        <FileText aria-hidden="true" className="size-4 shrink-0" />
        <span>原始片段</span>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm leading-6">{snippet}</p>
    </article>
  )
}

function sequenceRange(chunk: SemanticSearchMatchedChunk): string | null {
  if (chunk.messageStartSequence === undefined || chunk.messageEndSequence === undefined) {
    return null
  }
  if (chunk.messageStartSequence === null || chunk.messageEndSequence === null) {
    return null
  }
  if (chunk.messageStartSequence === chunk.messageEndSequence) {
    return `消息 #${chunk.messageStartSequence}`
  }
  return `消息 #${chunk.messageStartSequence}-${chunk.messageEndSequence}`
}

function formatScore(score: number): string {
  return `${(score * 100).toFixed(1)}%`
}
