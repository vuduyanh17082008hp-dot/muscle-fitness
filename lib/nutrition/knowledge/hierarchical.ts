import { COMPANION_HEADINGS, filterEligible, headingSlug } from "./filter"
import { canonTerm } from "./normalize"
import { queryTermsOf, scoreChunk, type CorpusStats, type ScoreConfig, type ScoredChunk, type ScoreSignals } from "./score"
import type { IndexedKnowledgeChunk, NutritionKnowledgeQuery } from "./types"

/**
 * N1.6.3-R3-F: hierarchical retrieval (document -> section). One chunk score used to do two jobs (pick the document AND pick the
 * section), so every sibling inherited its document's relevance. Here the two scores are separate, observable objects:
 *   DocumentCandidate.documentScore  — metadata + title + the document's BEST single section evidence (a max, never a per-sibling copy)
 *   SectionCandidate.sectionScore    — the section's own heading + body evidence only (no document metadata)
 * Final order = docShare * relativeDocScore + (1 - docShare) * sectionScore, so inside one document the order is decided by sectionScore alone.
 * Opt-in via ScoreConfig.hier; absent = the flat R3 scorer, byte-for-byte unchanged.
 */
export type DocSignal = "category" | "foodType" | "cuisine" | "sensory" | "goal" | "title" | "locale" | "authority" | "evidence" | "concept" | "coverage" | "evidence2"
export type SectionSignal = "heading" | "lexical" | "concept" | "sensory"

export type HierConfig = {
  docWeights: Record<DocSignal, number>
  /** "local": sectionScore from section-local signals only. "legacy": the flat R3 chunk score (F1 isolates document ranking). */
  sectionMode: "local" | "legacy"
  sectionWeights: Record<SectionSignal, number>
  /** Weight of the relative document score in the final order (0 = sections only, 1 = documents only). */
  docShare: number
  /** Candidate-document stage: keep at most `n` documents scoring at least `ratio` x the best. n = Infinity, ratio = 0 -> all. */
  candidates: { n: number; ratio: number }
  /** Sections need at least this much section-local score to be selectable (0 = anything the flat gates let through). */
  minSection: number
  /** Document-aware slot allocation (F4). Absent = the flat diversity selector. */
  allocation?: {
    /** Documents scoring >= reserveRatio x best each reserve their best section first (multi-document coverage). */
    reserveRatio: number
    reserveMax: number
    /** A document's 2nd+ section must score >= sibRatio x that document's best section (section-local, adaptive). */
    sibRatio: number
    /** A non-leading document earns slots beyond its reservation only when its documentScore >= secondaryDocRatio x the best (it is not clearly beaten). */
    secondaryDocRatio: number
    maxPerDoc: number
  }
}

export type DocumentCandidate = { documentId: string; documentScore: number; signals: Record<DocSignal, number> }
export type SectionCandidate = { documentId: string; sectionId: string; sectionScore: number; finalScore: number; scored: ScoredChunk }

const fraction = (wanted: string[] | undefined, have: Set<string>) => {
  const w = (wanted ?? []).map(canonTerm)
  return w.length ? w.filter((t) => have.has(t)).length / w.length : 0
}

export type HierRanking = { docs: DocumentCandidate[]; sections: SectionCandidate[]; candidateDocs: Set<string> }

/** Documents and sections, scored separately. `sections` are only those of candidate documents, best final score first. */
export function rankHierarchical(items: IndexedKnowledgeChunk[], stats: CorpusStats, query: NutritionKnowledgeQuery, config: ScoreConfig): HierRanking {
  const h = config.hier!
  const queryTerms = queryTermsOf(query)
  const flat = { ...config, minScore: 0, relativeFloor: undefined }
  const eligible = filterEligible(items).filter((it) => !config.companionOnly || !(COMPANION_HEADINGS as readonly string[]).includes(headingSlug(it)))
  const scored = eligible.flatMap((it) => scoreChunk(it, query, stats, queryTerms, flat) ?? [])
  const byDoc = new Map<string, ScoredChunk[]>()
  for (const s of scored) byDoc.set(s.item.chunk.documentId, [...(byDoc.get(s.item.chunk.documentId) ?? []), s])

  const known = queryTerms.filter((t) => stats.df.has(t))
  const idf = (t: string) => Math.log(1 + stats.size / (1 + (stats.df.get(t) ?? 0)))
  const idfTotal = known.reduce((sum, t) => sum + idf(t), 0)
  const docs: DocumentCandidate[] = [...byDoc].map(([documentId, secs]) => {
    const first = secs[0]
    // coverage: share of the (idf-weighted) query vocabulary the document discusses ANYWHERE (union of its sections + title), so a big document is not rewarded for repeating a word.
    const union = new Set(secs.flatMap((x) => [...x.item.localTerms, ...x.item.titleTerms]))
    const locals = secs.map((x) => x.signals.localMatch).sort((a, b) => b - a)
    const m = first.item.chunk.metadata
    const sensoryMeta = fraction(query.sensoryTargets, new Set((m.sensoryTargets ?? []).map(canonTerm)))
    const signals: Record<DocSignal, number> = {
      category: first.signals.category,
      foodType: first.signals.foodType,
      cuisine: first.signals.cuisine,
      sensory: sensoryMeta,
      goal: first.signals.goal,
      title: first.signals.titleMatch,
      locale: first.signals.locale,
      authority: first.signals.authority,
      evidence: secs.reduce((mx, s) => Math.max(mx, s.signals.localMatch), 0),
      concept: secs.reduce((mx, s) => Math.max(mx, s.signals.concept), 0),
      coverage: idfTotal ? known.filter((t) => union.has(t)).reduce((sum, t) => sum + idf(t), 0) / idfTotal : 0,
      evidence2: ((locals[0] ?? 0) + (locals[1] ?? 0)) / 2,
    }
    const raw = (Object.keys(signals) as DocSignal[]).reduce((sum, k) => sum + h.docWeights[k] * signals[k], 0)
    const goalMismatch = !!query.goalStated && signals.goal === 0.15
    return { documentId, documentScore: raw * (goalMismatch ? (config.goalMismatchFactor ?? 1) : 1), signals }
  })
  docs.sort((a, b) => b.documentScore - a.documentScore || (a.documentId < b.documentId ? -1 : 1))
  const best = docs[0]?.documentScore ?? 0
  const keep = docs.filter((d, i) => i < h.candidates.n && d.documentScore >= h.candidates.ratio * best)
  const candidateDocs = new Set(keep.map((d) => d.documentId))
  const docNorm = new Map(docs.map((d) => [d.documentId, best ? d.documentScore / best : 0]))

  const bestLegacy = scored.reduce((mx, s) => Math.max(mx, s.score), 0) || 1
  const sections: SectionCandidate[] = scored
    .filter((s) => candidateDocs.has(s.item.chunk.documentId))
    .map((s) => {
      const sg: ScoreSignals = s.signals
      const sensoryLocal = fraction(query.sensoryTargets, new Set(s.item.localTerms))
      const local = h.sectionWeights.heading * sg.headingMatch + h.sectionWeights.lexical * sg.localMatch + h.sectionWeights.concept * sg.concept + h.sectionWeights.sensory * sensoryLocal
      const sectionScore = h.sectionMode === "local" ? local : s.score / bestLegacy
      const finalScore = h.docShare * (docNorm.get(s.item.chunk.documentId) ?? 0) + (1 - h.docShare) * sectionScore
      return { documentId: s.item.chunk.documentId, sectionId: s.item.chunk.id, sectionScore, finalScore, scored: { ...s, score: finalScore, breakdown: { ...s.breakdown, total: finalScore } } }
    })
    .filter((c) => h.sectionMode === "legacy" || c.sectionScore >= h.minSection)
    .sort((a, b) => b.finalScore - a.finalScore || (a.sectionId < b.sectionId ? -1 : 1))
  return { docs, sections, candidateDocs }
}

/** Document-aware slot allocation. Output order is final-score order so section rank stays comparable to the flat path. */
export function allocateSlots(sections: SectionCandidate[], docs: DocumentCandidate[], k: number, a: NonNullable<HierConfig["allocation"]>): ScoredChunk[] {
  if (!sections.length) return []
  const bestDoc = docs[0].documentScore || 1
  const leadDoc = sections[0].documentId
  const docBest = new Map<string, number>()
  for (const s of sections) docBest.set(s.documentId, Math.max(docBest.get(s.documentId) ?? 0, s.sectionScore))
  const docScore = new Map(docs.map((d) => [d.documentId, d.documentScore]))
  const picked: SectionCandidate[] = []
  const take = (s: SectionCandidate) => picked.push(s)
  // 1. Coverage: each (co-)dominant document reserves its best section.
  let reserved = 0
  for (const d of docs) {
    if (reserved >= a.reserveMax || picked.length >= k) break
    if (d.documentScore < a.reserveRatio * bestDoc) break
    const top = sections.find((s) => s.documentId === d.documentId)
    if (top) {
      take(top)
      reserved++
    }
  }
  // 2. Fill by final score, section-local rules decide whether a sibling / other-document section earns a slot.
  for (const s of sections) {
    if (picked.length >= k) break
    if (picked.includes(s)) continue
    const inDoc = picked.filter((p) => p.documentId === s.documentId).length
    if (inDoc >= a.maxPerDoc) continue
    if (inDoc > 0 && s.sectionScore < a.sibRatio * (docBest.get(s.documentId) ?? 0)) continue
    if (s.documentId !== leadDoc && (docScore.get(s.documentId) ?? 0) < a.secondaryDocRatio * bestDoc) continue
    take(s)
  }
  return picked.sort((x, y) => y.finalScore - x.finalScore || (x.sectionId < y.sectionId ? -1 : 1)).map((s) => s.scored)
}

/** Dev / eval only: the document ranking alone (for Document Recall@k / MRR). */
export function rankDocumentsForEval(items: IndexedKnowledgeChunk[], stats: CorpusStats, query: NutritionKnowledgeQuery, config: ScoreConfig): DocumentCandidate[] {
  return rankHierarchical(items, stats, query, { ...config, hier: { ...config.hier!, candidates: { n: Infinity, ratio: 0 } } }).docs
}
