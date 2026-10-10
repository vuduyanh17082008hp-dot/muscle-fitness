import { summarizeQuery } from "./query"
import type { KnowledgeNeedReason, NutritionKnowledgeContext, NutritionKnowledgeQuery, NutritionRetrievalTrace } from "./types"

/** Ids, counts and structural query summary only. Never the raw prompt, Athlete State, auth or history. */
export function makeTrace(input: {
  reason: KnowledgeNeedReason
  query: NutritionKnowledgeQuery
  candidateCount: number
  filteredCount: number
  chunks: NutritionKnowledgeContext["chunks"]
  contextCharacters: number
  latencyMs: number
  fallbackUsed?: boolean
}): NutritionRetrievalTrace {
  const primary = input.chunks.filter((c) => c.sourceType === "primary")
  const companion = input.chunks.filter((c) => c.sourceType === "companion")
  return {
    retrievalTriggered: true,
    reason: input.reason,
    querySummary: summarizeQuery(input.query),
    categories: input.query.categories ?? [],
    candidateCount: input.candidateCount,
    filteredCount: input.filteredCount,
    selectedChunkIds: primary.map((c) => c.id),
    companionChunkIds: companion.map((c) => c.id),
    primaryChunkCount: primary.length,
    totalChunkCount: input.chunks.length,
    contextCharacters: input.contextCharacters,
    latencyMs: Math.round(input.latencyMs * 100) / 100,
    fallbackUsed: input.fallbackUsed ?? false,
    zeroResult: input.chunks.length === 0,
  }
}
