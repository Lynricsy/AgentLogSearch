"use client"

import type { AttemptOutcome, ExperienceOutcome } from "@agent-log-search/shared"

import { formatAttemptOutcome, formatExperienceOutcome } from "../lib/evidence-labels"
import { StatusBadge } from "./status-badge"

type OutcomeTone = "neutral" | "success" | "warning" | "danger"

export function OutcomeBadge({
  outcome,
}: {
  readonly outcome: AttemptOutcome | ExperienceOutcome
}) {
  return <StatusBadge tone={outcomeTone(outcome)}>{formatOutcome(outcome)}</StatusBadge>
}

function formatOutcome(outcome: AttemptOutcome | ExperienceOutcome): string {
  if (outcome === "UNKNOWN") return formatExperienceOutcome(outcome)
  return isAttemptOutcome(outcome)
    ? formatAttemptOutcome(outcome)
    : formatExperienceOutcome(outcome)
}

function outcomeTone(outcome: AttemptOutcome | ExperienceOutcome): OutcomeTone {
  switch (outcome) {
    case "SUCCEEDED":
      return "success"
    case "FAILED":
      return "danger"
    case "PARTIAL":
      return "warning"
    case "UNKNOWN":
    case "UNVERIFIED":
      return "neutral"
  }
}

function isAttemptOutcome(outcome: AttemptOutcome | ExperienceOutcome): outcome is AttemptOutcome {
  return outcome !== "UNKNOWN"
}
