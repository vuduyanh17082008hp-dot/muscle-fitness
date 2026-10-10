import { COMPANION_HEADINGS, headingSlug } from "./filter"
import type { ScoredChunk } from "./score"
import type { IndexedKnowledgeChunk } from "./types"

export const MAX_COMPANIONS = 2

/**
 * Attaches "Do not claim" / decision-rule / failure-mode sections of the
 * documents behind the selected primaries. Found by stable heading slug in the
 * same document — no whole-document loading, no companions of companions.
 */
export function pickCompanions(
  primary: ScoredChunk[],
  byDocument: ReadonlyMap<string, IndexedKnowledgeChunk[]>,
): Array<{ item: IndexedKnowledgeChunk; parentScore: number }> {
  const taken = new Set(primary.map((p) => p.item.chunk.id))
  const seenDocs = new Set<string>()
  const out: Array<{ item: IndexedKnowledgeChunk; parentScore: number }> = []
  for (const p of primary) {
    const docId = p.item.chunk.documentId
    if (seenDocs.has(docId) || out.length >= MAX_COMPANIONS) continue
    seenDocs.add(docId)
    const siblings = byDocument.get(docId) ?? []
    for (const slug of COMPANION_HEADINGS) {
      const found = siblings.find((s) => headingSlug(s) === slug && !taken.has(s.chunk.id))
      if (found) {
        out.push({ item: found, parentScore: p.score })
        taken.add(found.chunk.id)
        break
      }
    }
  }
  return out
}
