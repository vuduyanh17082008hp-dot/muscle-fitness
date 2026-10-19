import { slugify } from "./parse"
import type { IndexedKnowledgeChunk } from "./types"

/** Headings that only ever attach as companions (never rank alone) or are not strategy at all. */
export const COMPANION_HEADINGS = ["do-not-claim", "coach-decision-rules", "common-failure-modes"] as const
const NEVER_RETRIEVED_HEADINGS = new Set(["do-not-claim", "suggested-tool-calls"])

export const headingSlug = (item: IndexedKnowledgeChunk) => slugify(item.chunk.heading)

/**
 * Hard eligibility. Policy and brand material never enter ordinary retrieval
 * and malformed chunks are dropped. Allergies, exclusions and dislikes are NOT
 * applied here: document metadata ("dairy" on a cereal doc) cannot prove a
 * chunk recommends that food, and its strategy is often adaptable. They are
 * enforced where recommendations are made — the engine's ingredient guards
 * and the prompt's allergy/exclusion rules.
 */
export function filterEligible(items: IndexedKnowledgeChunk[]): IndexedKnowledgeChunk[] {
  return items.filter(({ chunk }) => {
    const m = chunk.metadata
    if (!chunk.id || !chunk.content.trim() || !m) return false
    if (m.authority === "policy" || m.category === "brand") return false
    return !NEVER_RETRIEVED_HEADINGS.has(slugify(chunk.heading))
  })
}
