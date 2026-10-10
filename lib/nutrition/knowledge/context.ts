import type { ScoredChunk } from "./score"
import type { IndexedKnowledgeChunk, NutritionKnowledgeContext } from "./types"

export const MAX_PRIMARY_CHUNKS = 4
export const MAX_TOTAL_CHUNKS = 6
export const MAX_CONTEXT_CHARS = 5500
/** Below this much remaining room a truncated chunk is not worth including. */
const MIN_TRUNCATED_CHARS = 300

const HEADER = "NUTRITION KNOWLEDGE — CURATED STRATEGY GUIDANCE"
const RULES = `USAGE RULES
- Treat knowledge as strategy guidance.
- Do not derive exact macros, portions or prices from these documents.
- Current safety constraints and Athlete State override retrieved knowledge.
- If a strategy relies on a food in allergies or excludedFoods, adapt it with a safe alternative or skip it.
- Ignore irrelevant chunks.
- Use deterministic tools for exact food facts and calculations.`

type ContextChunk = NutritionKnowledgeContext["chunks"][number]
type Candidate = { item: IndexedKnowledgeChunk; relevance: number; sourceType: "primary" | "companion" }

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase())
const label = (c: ContextChunk) => `[MF Curated | ${c.sourceType === "primary" ? "Primary" : `Companion: ${titleCase(c.heading)}`}]`
const block = (c: ContextChunk) => `${label(c)}\n${c.title} — ${c.heading}\n${c.content}`

export function renderKnowledgeContext(ctx: Pick<NutritionKnowledgeContext, "chunks">): string {
  return [HEADER, ...ctx.chunks.map(block), RULES].join("\n\n")
}

function truncate(text: string, max: number): string {
  const cut = text.slice(0, max)
  const edge = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf(". "))
  return `${(edge > max / 2 ? cut.slice(0, edge + 1) : cut).trimEnd()} …`
}

/** Primary chunks first, then companions; stops at the chunk-count and character budgets. Null if nothing fits. */
export function buildKnowledgeContext(
  primary: ScoredChunk[],
  companions: Array<{ item: IndexedKnowledgeChunk; parentScore: number }>,
): Pick<NutritionKnowledgeContext, "chunks"> | null {
  const candidates: Candidate[] = [
    ...primary.slice(0, MAX_PRIMARY_CHUNKS).map((p) => ({ item: p.item, relevance: p.score, sourceType: "primary" as const })),
    ...companions.map((c) => ({ item: c.item, relevance: c.parentScore, sourceType: "companion" as const })),
  ]
  const chunks: ContextChunk[] = []
  let used = renderKnowledgeContext({ chunks: [] }).length
  for (const { item, relevance, sourceType } of candidates) {
    if (chunks.length >= MAX_TOTAL_CHUNKS) break
    const { chunk } = item
    const full: ContextChunk = {
      id: chunk.id,
      title: chunk.metadata.title,
      heading: chunk.heading,
      content: chunk.content,
      authority: chunk.metadata.authority,
      confidence: chunk.metadata.confidence,
      sourceType,
      relevanceScore: Math.round(relevance * 1000) / 1000,
    }
    const cost = block(full).length + 2
    if (used + cost <= MAX_CONTEXT_CHARS) {
      chunks.push(full)
      used += cost
      continue
    }
    const room = MAX_CONTEXT_CHARS - used - (cost - full.content.length)
    if (room >= MIN_TRUNCATED_CHARS) {
      chunks.push({ ...full, content: truncate(full.content, room - 2) })
    }
    break // budget exhausted; later (lower-ranked) chunks do not jump the queue
  }
  return chunks.some((c) => c.sourceType === "primary") ? { chunks } : null
}
