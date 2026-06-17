import type { SemanticSearchChunkHit } from "./search-records.js"
import { aggregateSemanticHits } from "./search-records.js"

describe("aggregateSemanticHits", () => {
  it("returns empty records when no ready chunk hits are provided", () => {
    // When
    const result = aggregateSemanticHits([], 10)

    // Then
    expect(result).toEqual({ records: [] })
  })

  it("sorts sessions by score, last message time, and stable ids when chunks match", () => {
    // Given
    const hits: readonly SemanticSearchChunkHit[] = [
      hit({ chunkId: "3", sessionId: "10", score: 0.8, lastMessageAt: "2026-01-02T03:04:07.000Z" }),
      hit({ chunkId: "1", sessionId: "20", score: 0.9, lastMessageAt: "2026-01-02T03:04:06.000Z" }),
      hit({
        chunkId: "2",
        sessionId: "10",
        score: 0.95,
        lastMessageAt: "2026-01-02T03:04:07.000Z",
      }),
      hit({ chunkId: "4", sessionId: "10", score: 0.7, lastMessageAt: "2026-01-02T03:04:07.000Z" }),
      hit({ chunkId: "5", sessionId: "10", score: 0.6, lastMessageAt: "2026-01-02T03:04:07.000Z" }),
      hit({ chunkId: "6", sessionId: "30", score: 0.9, lastMessageAt: "2026-01-02T03:04:09.000Z" }),
    ]

    // When
    const result = aggregateSemanticHits(hits, 10)

    // Then
    expect(result.records.map((record) => record.sessionId)).toEqual(["10", "30", "20"])
    expect(result.records[0]?.score).toBe(0.95)
    expect(result.records[0]?.matchedChunks.map((chunk) => chunk.chunkId)).toEqual(["2", "3", "4"])
  })
})

function hit(
  input: Pick<SemanticSearchChunkHit, "chunkId" | "lastMessageAt" | "score" | "sessionId">,
): SemanticSearchChunkHit {
  return {
    agentName: "generic",
    chunkId: input.chunkId,
    cwd: "/workspace",
    lastMessageAt: input.lastMessageAt,
    messageCount: 3,
    resumeCommand: "cd /workspace",
    score: input.score,
    sessionId: input.sessionId,
    snippet: `chunk ${input.chunkId}`,
    threadId: `thread-${input.sessionId}`,
    title: null,
  }
}
