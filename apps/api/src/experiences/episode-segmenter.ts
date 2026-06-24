import { SecretRedactor } from "../evidence/redaction/secret-redactor.js"
import type { EpisodeDraft, ExperienceTraceEvent } from "./experience.types.js"

const CONTINUATION_PATTERNS = [
  /^继续[。！!]?$/,
  /^接着[。！!]?$/,
  /^再试一次[。！!]?$/,
  /^重试[。！!]?$/,
  /^好的?[。！!]?$/,
  /^可以[。！!]?$/,
  /^ok[.!]?$/i,
  /^continue[.!]?$/i,
  /^try again[.!]?$/i,
] as const

export function segmentEpisodes(events: readonly ExperienceTraceEvent[]): readonly EpisodeDraft[] {
  const sorted = [...events].sort((a, b) => a.seqNo - b.seqNo || a.subSeqNo - b.subSeqNo)
  const episodes: EpisodeBuilder[] = []
  let current: EpisodeBuilder | null = null
  const redactor = new SecretRedactor()

  for (const event of sorted) {
    if (event.eventKind === "USER_MESSAGE") {
      const text = normalizeTaskText(event.redactedExcerpt ?? "", redactor)
      if (current !== null && isContinuation(text)) {
        current.events.push(event)
        current.endSeq = event.seqNo
        continue
      }
      if (current !== null) {
        episodes.push(current)
      }
      current = {
        episodeIndex: episodes.length,
        taskEvent: event,
        taskText: text.length > 0 ? text : "Untitled task",
        events: [event],
        startSeq: event.seqNo,
        endSeq: event.seqNo,
      }
      continue
    }
    if (current === null) {
      current = {
        episodeIndex: episodes.length,
        taskEvent: event,
        taskText: "Synthetic episode",
        events: [event],
        startSeq: event.seqNo,
        endSeq: event.seqNo,
      }
      continue
    }
    current.events.push(event)
    current.endSeq = event.seqNo
  }

  if (current !== null) {
    episodes.push(current)
  }

  return episodes.map((episode, episodeIndex) => ({
    episodeIndex,
    taskText: episode.taskText,
    taskEvent: episode.taskEvent,
    events: episode.events,
    startSeq: episode.startSeq,
    endSeq: episode.endSeq,
  }))
}

function normalizeTaskText(value: string, redactor: SecretRedactor): string {
  const trimmed = value.trim()
  const redacted = redactor.redact(trimmed).text
  return redacted.length <= 2_000 ? redacted : redacted.slice(0, 2_000)
}

function isContinuation(text: string): boolean {
  return CONTINUATION_PATTERNS.some((pattern) => pattern.test(text.trim()))
}

type EpisodeBuilder = {
  episodeIndex: number
  taskEvent: ExperienceTraceEvent
  taskText: string
  events: ExperienceTraceEvent[]
  startSeq: number
  endSeq: number
}
