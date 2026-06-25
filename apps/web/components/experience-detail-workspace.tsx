"use client"

import type { ExperienceDetail } from "@agent-log-search/shared"
import { Skeleton } from "@heroui/react"
import { ExternalLink, FileText, Hash, Terminal } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"
import { useEffect, useRef, useState } from "react"
import { type ApiClient, ApiClientError, apiClient } from "../lib/api"
import { formatReasonCode } from "../lib/evidence-labels"
import {
  compactSummary,
  displayTokens,
  hiddenCount,
  relevantCommands,
  relevantExperienceErrors,
  relevantExperiencePaths,
} from "../lib/experience-display"
import { AttemptTimeline } from "./attempt-timeline"
import { EvidenceBadge } from "./evidence-badge"
import { EvidenceEventList } from "./evidence-event-list"
import { OutcomeBadge } from "./outcome-badge"
import { PageHeader } from "./page-header"
import { ScoreBreakdown } from "./score-breakdown"
import { ErrorState } from "./state-block"
import { StatusBadge } from "./status-badge"

type ExperienceDetailWorkspaceProps = {
  readonly client?: ApiClient
  readonly experienceId: string
}

type ExperienceDetailState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly experience: ExperienceDetail }
  | { readonly kind: "error"; readonly message: string }

export function ExperienceDetailWorkspace({
  client = apiClient,
  experienceId,
}: ExperienceDetailWorkspaceProps) {
  const requestIdRef = useRef(0)
  const [state, setState] = useState<ExperienceDetailState>({ kind: "loading" })

  useEffect(() => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setState({ kind: "loading" })

    client
      .getExperience(experienceId)
      .then((experience) => {
        if (requestIdRef.current === requestId) {
          setState({ kind: "ready", experience })
        }
      })
      .catch((error: unknown) => {
        if (requestIdRef.current === requestId) {
          setState({ kind: "error", message: describeError(error) })
        }
      })
  }, [client, experienceId])

  return (
    <section aria-label="经验详情工作区" className="space-y-5">
      <PageHeader
        actions={
          state.kind === "ready" ? (
            <Link
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--app-accent)]/15 bg-[var(--app-accent-soft)] px-3 py-2 text-xs font-medium text-[var(--app-accent)] shadow-sm"
              href={`/sessions/${encodeURIComponent(state.experience.sessionId)}`}
            >
              <ExternalLink aria-hidden="true" className="size-4" />
              打开原会话
            </Link>
          ) : null
        }
        eyebrow="经验详情"
        subtitle="查看历史上执行过的操作、验证结果、证据等级和脱敏 trace evidence。"
        title={state.kind === "ready" ? state.experience.title : `经验 ${experienceId}`}
      />
      <ExperienceDetailContent state={state} />
    </section>
  )
}

function ExperienceDetailContent({ state }: { readonly state: ExperienceDetailState }) {
  if (state.kind === "loading") {
    return <LoadingDetail />
  }

  if (state.kind === "error") {
    return <ErrorState description={state.message} title="经验暂不可用" />
  }

  const experience = state.experience
  const summary = compactSummary(experience)
  const paths = relevantExperiencePaths(experience)
  const errors = relevantExperienceErrors(experience)
  const commands = relevantCommands(experience)

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-4">
        <section className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <OutcomeBadge outcome={experience.outcome} />
            <EvidenceBadge level={experience.evidenceLevel} score={experience.evidenceScore} />
            <StatusBadge>{experience.kind}</StatusBadge>
          </div>
          <h2 className="mt-4 text-sm font-semibold text-[var(--app-ink)]">经验结论</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--app-ink)]">{summary}</p>
          <p className="mt-2 text-xs leading-5 text-[var(--app-muted)]">
            原始任务：{experience.taskText}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {experience.evidenceReasonCodes.map((code) => (
              <span
                className="rounded-md bg-[var(--app-panel-muted)] px-2 py-1 text-xs text-[var(--app-muted)]"
                key={code}
                title={code}
              >
                {formatReasonCode(code)}
              </span>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--app-ink)]">Attempt 时间线</h2>
          <AttemptTimeline attempts={experience.attempts} />
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--app-ink)]">Trace Evidence</h2>
          <EvidenceEventList events={experience.evidenceEvents} />
        </section>
      </div>

      <aside className="space-y-3">
        <MetaPanel title="工程对象">
          <TokenLine
            icon={<FileText className="size-4" />}
            label="文件"
            hiddenCount={hiddenCount(experience.pathTokens, paths)}
            tokens={paths}
          />
          <TokenLine
            icon={<Hash className="size-4" />}
            label="符号"
            hiddenCount={hiddenCount(
              experience.symbolTokens,
              displayTokens(experience.symbolTokens),
            )}
            tokens={displayTokens(experience.symbolTokens)}
          />
          <TokenLine
            label="错误"
            hiddenCount={hiddenCount(
              [...experience.errorCodes, ...experience.errorSignatures],
              errors,
            )}
            tokens={errors}
          />
          <TokenLine
            icon={<Terminal className="size-4" />}
            label="命令"
            hiddenCount={hiddenCount(experience.commandFamilies, commands)}
            tokens={commands}
          />
        </MetaPanel>

        <MetaPanel title="评分">
          <ScoreBreakdown score={experience.scoreBreakdown} />
        </MetaPanel>

        <MetaPanel title="来源会话">
          <MetaLine label="Agent" value={experience.session.agentName} />
          <MetaLine label="线程" value={experience.session.externalThreadId} />
          <MetaLine label="工作目录" value={experience.session.cwd ?? "未记录"} />
          <MetaLine label="构建状态" value={experience.session.experienceBuildStatus} />
        </MetaPanel>
      </aside>
    </div>
  )
}

function LoadingDetail() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4">
      <h2 className="text-sm font-medium">正在加载经验</h2>
      <span className="sr-only">正在加载 experience 详情。</span>
      <Skeleton className="h-36 w-full rounded-lg" />
      <Skeleton className="h-56 w-full rounded-lg" />
      <Skeleton className="h-56 w-full rounded-lg" />
    </div>
  )
}

function MetaPanel({ children, title }: { readonly children: ReactNode; readonly title: string }) {
  return (
    <section className="rounded-lg border border-[var(--app-border)] bg-[var(--app-panel)] p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--app-muted)]">
        {title}
      </h2>
      {children}
    </section>
  )
}

function TokenLine({
  hiddenCount: hiddenCountValue = 0,
  icon,
  label,
  tokens,
}: {
  readonly hiddenCount?: number
  readonly icon?: ReactNode
  readonly label: string
  readonly tokens: readonly string[]
}) {
  return (
    <div className="mb-3 min-w-0">
      <div className="mb-1 flex items-center gap-2 text-xs font-medium text-[var(--app-muted)]">
        {icon}
        {label}
      </div>
      {tokens.length === 0 ? (
        <span className="text-sm text-[var(--app-muted)]">未记录</span>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {tokens.slice(0, 10).map((token) => (
            <code
              className="max-w-full break-words rounded bg-[var(--app-accent-soft)] px-1.5 py-0.5 text-xs text-[var(--app-ink)]"
              key={token}
            >
              {token}
            </code>
          ))}
          {hiddenCountValue > 0 ? (
            <span className="rounded bg-[var(--app-panel-muted)] px-1.5 py-0.5 text-xs text-[var(--app-muted)]">
              +{hiddenCountValue}
            </span>
          ) : null}
        </div>
      )}
    </div>
  )
}

function MetaLine({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="mb-3 min-w-0">
      <div className="text-xs font-medium text-[var(--app-muted)]">{label}</div>
      <code className="mt-1 block break-words rounded bg-[var(--app-accent-soft)] px-2 py-1 text-xs text-[var(--app-ink)]">
        {value}
      </code>
    </div>
  )
}

function describeError(error: unknown): string {
  if (error instanceof ApiClientError) return error.message
  if (error instanceof Error) return error.message
  return "经验详情请求失败。"
}
