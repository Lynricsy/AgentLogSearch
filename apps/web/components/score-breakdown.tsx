"use client"

import type {
  ExperienceScoreBreakdown,
  FailedAttemptScoreBreakdown,
} from "@agent-log-search/shared"

import { formatPercent } from "./evidence-badge"

type ScoreBreakdownProps = {
  readonly score: ExperienceScoreBreakdown | FailedAttemptScoreBreakdown
}

const SCORE_LABELS: Readonly<Record<string, string>> = {
  actionTokenMatch: "动作",
  commandMatch: "命令",
  compatibilityFactor: "兼容",
  dense: "语义",
  errorMatch: "错误",
  evidenceFactor: "证据",
  finalScore: "总分",
  lexical: "文本",
  outcomeFactor: "可复用",
  pathMatch: "文件",
  phraseMatch: "短语",
  specificityFactor: "聚焦",
  symbolMatch: "符号",
  taskSimilarity: "任务",
}

export function ScoreBreakdown({ score }: ScoreBreakdownProps) {
  const entries = Object.entries(score).filter(
    (entry): entry is [string, number] => typeof entry[1] === "number",
  )

  return (
    <div className="space-y-2">
      {entries.map(([key, value]) => (
        <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_3rem] items-center gap-2" key={key}>
          <span className="text-xs font-medium text-[var(--app-muted)]">
            {SCORE_LABELS[key] ?? key}
          </span>
          <span className="h-2 overflow-hidden rounded-full bg-[var(--app-panel-muted)]">
            <span
              className="block h-full rounded-full bg-[var(--app-accent)]"
              style={{ width: formatPercent(value) }}
            />
          </span>
          <span className="text-right text-xs font-medium text-[var(--app-muted)]">
            {formatPercent(value)}
          </span>
        </div>
      ))}
    </div>
  )
}
