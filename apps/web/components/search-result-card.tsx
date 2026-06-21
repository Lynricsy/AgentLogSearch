"use client"

import type { SemanticSearchResult } from "@agent-log-search/shared"
import { Card, Chip } from "@heroui/react"
import { motion } from "framer-motion"
import { ExternalLink, Hash, MessageSquareText, Terminal } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import { ResumeCommandBox } from "./resume-command-box"
import { StatusBadge } from "./status-badge"

type SearchResultCardProps = {
  readonly result: SemanticSearchResult
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

export function SearchResultCard({ result }: SearchResultCardProps) {
  const title = result.title ?? "Untitled session"
  const cwd = result.cwd ?? "未记录"
  const detailHref = `/sessions/${encodeURIComponent(result.sessionId)}`

  return (
    <Card
      className="border border-white/20 bg-white/40 backdrop-blur-xl dark:bg-black/40"
      radius="lg"
    >
      <motion.div
        animate="visible"
        className="space-y-4 p-4"
        initial={false}
        variants={containerVariants}
      >
        <motion.div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between" variants={itemVariants}>
          <div className="min-w-0">
            <h2 className="break-words text-base font-semibold text-[var(--app-ink)]">{title}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <Chip color="primary" radius="sm" size="sm" variant="flat">
                Score {formatScore(result.score)}
              </Chip>
              <StatusBadge>{result.agentName}</StatusBadge>
              <StatusBadge>{result.messageCount} messages</StatusBadge>
            </div>
          </div>
          <div className="min-w-0 space-y-2 text-xs text-[var(--app-muted)] md:max-w-md">
            <Link
              aria-label={`Open detail for ${title}`}
              className="inline-flex w-fit items-center gap-2 rounded-md bg-[var(--app-accent-soft)] px-3 py-2 text-xs font-medium text-[var(--app-accent)]"
              href={detailHref}
            >
              <ExternalLink aria-hidden="true" className="size-4" />
              Open detail
            </Link>
            <MetaLine icon={<Hash aria-hidden="true" className="size-4" />} label="Thread">
              {result.threadId}
            </MetaLine>
            <MetaLine icon={<Terminal aria-hidden="true" className="size-4" />} label="CWD">
              {cwd}
            </MetaLine>
          </div>
        </motion.div>

        <motion.div className="space-y-2" variants={itemVariants}>
          <p className="flex items-center gap-2 text-xs font-medium text-[var(--app-muted)]">
            <MessageSquareText aria-hidden="true" className="size-4" />
            Matched chunks
          </p>
          <div className="space-y-2">
            {result.matchedChunks.map((chunk) => (
              <div
                className="rounded-md border border-[var(--app-border)] bg-white px-3 py-2"
                key={chunk.chunkId}
              >
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-[var(--app-muted)]">
                  <span>{chunk.chunkId}</span>
                  <span>Chunk {formatScore(chunk.score)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--app-ink)]">
                  {chunk.snippet}
                </p>
              </div>
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

function MetaLine({
  children,
  icon,
  label,
}: {
  readonly children: string
  readonly icon: ReactNode
  readonly label: string
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {icon}
      <span className="shrink-0 font-medium">{label}</span>
      <code className="min-w-0 truncate rounded bg-[var(--app-accent-soft)] px-2 py-1 text-[var(--app-ink)]">
        {children}
      </code>
    </div>
  )
}

function formatScore(score: number): string {
  return `${(score * 100).toFixed(1)}%`
}
