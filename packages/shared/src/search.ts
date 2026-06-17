import { z } from "zod"

export const SEMANTIC_SEARCH_DEFAULTS = {
  maxQueryLength: 2000,
  topK: 50,
  maxTopK: 100,
  sessionLimit: 10,
  maxSessionLimit: 50,
} as const

export const semanticSearchRequestSchema = z
  .object({
    query: z.string().trim().min(1).max(SEMANTIC_SEARCH_DEFAULTS.maxQueryLength),
    topK: z
      .number()
      .int()
      .min(1)
      .max(SEMANTIC_SEARCH_DEFAULTS.maxTopK)
      .default(SEMANTIC_SEARCH_DEFAULTS.topK),
    sessionLimit: z
      .number()
      .int()
      .min(1)
      .max(SEMANTIC_SEARCH_DEFAULTS.maxSessionLimit)
      .default(SEMANTIC_SEARCH_DEFAULTS.sessionLimit),
    agentName: z.string().trim().min(1).optional(),
    cwdKeyword: z.string().trim().min(1).optional(),
  })
  .strict()

export const semanticSearchMatchedChunkSchema = z.object({
  chunkId: z.string().min(1),
  score: z.number().min(0).max(1),
  snippet: z.string(),
})

export const semanticSearchResultSchema = z.object({
  sessionId: z.string().min(1),
  score: z.number().min(0).max(1),
  agentName: z.string(),
  cwd: z.string().nullable(),
  threadId: z.string(),
  title: z.string().nullable(),
  resumeCommand: z.string(),
  messageCount: z.number().int().min(0),
  lastMessageAt: z.string().datetime().nullable(),
  matchedChunks: z.array(semanticSearchMatchedChunkSchema),
})

export const semanticSearchResponseSchema = z.object({
  records: z.array(semanticSearchResultSchema),
})

export type SemanticSearchRequest = z.infer<typeof semanticSearchRequestSchema>
export type SemanticSearchMatchedChunk = z.infer<typeof semanticSearchMatchedChunkSchema>
export type SemanticSearchResult = z.infer<typeof semanticSearchResultSchema>
export type SemanticSearchResponse = z.infer<typeof semanticSearchResponseSchema>
