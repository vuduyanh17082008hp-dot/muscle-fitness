import type { DocumentCandidate, HierConfig } from "./hierarchical"
import type { ScoredChunk } from "./score"
import type { SemanticConfig } from "./semantic-rerank"
import type { NutritionKnowledgeQuery } from "./types"

/**
 * N1.6.3-R3-H: document signal (R3-F) x semantic section rerank (R3-G), kept as two separate objects (EXPERIMENT; opt-in via
 * ScoreConfig.hybrid, absent = R3 byte-for-byte). `sem` is the R3-G pool already reranked (section evidence); `docs` are the R3-F
 * document candidates (document evidence). Scores stay in the pool's own range so the selector's penalties / floor keep their meaning.
 *   prior  H1 (docPrior 0.5 = F5's share) / H3 (small prior): final = bestSem * (w * relativeDocScore + (1 - w) * sem / bestSem)
 *   tie    H2: sections whose semantic scores sit within `tieEps` of a cluster's top get that cluster's scores re-assigned in document order
 * Protection (H4) is a post-selection guard, see `protectDocuments`.
 */
export type HybridConfig = {
  /** Only `docWeights` / `candidates` are read: the F5 document signal. */
  doc: HierConfig
  semantic: SemanticConfig
  mode: "prior" | "tie"
  docPrior?: number
  tieEps?: number
  protect?: ProtectConfig
}

/** A non-leading document keeps a slot only when BOTH its document score and its best section's (semantic-blended) score are close to the leader's. */
export type ProtectConfig = {
  minDocRatio: number
  minSectionRatio: number
  max: number
  /** Structure signal (no score thresholds): the message states a goal and the leader is not a goal document -> the compatible goal document is a second need. */
  goalDocument?: boolean
  /** When no second document is protected the leader is clearly dominant: select with these (weaker) repeat penalties so its own sections can fill the slots. */
  dominantRepeat?: { category: number; document: number }
}

const docOf = (s: ScoredChunk) => s.item.chunk.documentId
const byScore = (a: ScoredChunk, b: ScoredChunk) => b.score - a.score || (a.item.chunk.id < b.item.chunk.id ? -1 : 1)
const withScore = (s: ScoredChunk, score: number): ScoredChunk => ({ ...s, score, breakdown: { ...s.breakdown, total: score } })

export const relativeDocScores = (docs: DocumentCandidate[]) => {
  const best = docs[0]?.documentScore ?? 0
  return new Map(docs.map((d) => [d.documentId, best ? d.documentScore / best : 0]))
}

export function hybridScores(sem: ScoredChunk[], docs: DocumentCandidate[], cfg: HybridConfig): ScoredChunk[] {
  const sorted = [...sem].sort(byScore)
  const best = sorted[0]?.score ?? 0
  if (!best) return sorted
  const rel = relativeDocScores(docs)
  if (cfg.mode === "prior") {
    const w = cfg.docPrior ?? 0.5
    return sorted.map((s) => withScore(s, best * (w * (rel.get(docOf(s)) ?? 0) + (1 - w) * (s.score / best)))).sort(byScore)
  }
  const next = new Map<ScoredChunk, number>(sorted.map((s) => [s, s.score]))
  for (let i = 0; i < sorted.length; ) {
    let j = i + 1
    while (j < sorted.length && sorted[i].score - sorted[j].score <= (cfg.tieEps ?? 0)) j++
    const members = sorted.slice(i, j)
    const scores = members.map((m) => m.score)
    ;[...members].sort((a, b) => (rel.get(docOf(b)) ?? 0) - (rel.get(docOf(a)) ?? 0) || byScore(a, b)).forEach((m, n) => next.set(m, scores[n]))
    i = j
  }
  return sorted.map((s) => withScore(s, next.get(s)!)).sort(byScore)
}

/** Documents (other than the leader) that evidence says are really needed: close document score AND a strong best section. */
export function protectedDocuments(scored: ScoredChunk[], docs: DocumentCandidate[], p: ProtectConfig, query?: NutritionKnowledgeQuery): string[] {
  const top = [...scored].sort(byScore)
  if (!top.length) return []
  const goalDoc =
    p.goalDocument && query?.goalStated && top[0].item.chunk.metadata.category !== "goal"
      ? top.find((s) => s.item.chunk.metadata.category === "goal" && s.signals.goal === 1)?.item.chunk.documentId
      : undefined
  const rel = relativeDocScores(docs)
  const lead = docOf(top[0])
  const bestBy = new Map<string, number>()
  for (const s of top) bestBy.set(docOf(s), Math.max(bestBy.get(docOf(s)) ?? 0, s.score))
  const byEvidence = [...bestBy]
    .filter(([d, b]) => d !== lead && p.max > 0 && (rel.get(d) ?? 0) >= p.minDocRatio && b >= p.minSectionRatio * top[0].score)
    .sort((a, b) => b[1] - a[1])
    .slice(0, p.max)
    .map(([d]) => d)
  return [...new Set([...byEvidence, ...(goalDoc && goalDoc !== lead ? [goalDoc] : [])])]
}

/**
 * Multi-document protection: `picked` is the normal selection. Each protected document without a primary chunk takes the slot of the
 * weakest pick that is not the only representative of the leader or of another protected document. Nothing is forced when no
 * document qualifies (a single-document query keeps all its sections).
 */
export function protectDocuments(picked: ScoredChunk[], scored: ScoredChunk[], docs: DocumentCandidate[], p: ProtectConfig, query?: NutritionKnowledgeQuery): ScoredChunk[] {
  const want = protectedDocuments(scored, docs, p, query)
  const out = [...picked]
  const sorted = [...scored].sort(byScore)
  const keep = new Set<string>([sorted[0] ? docOf(sorted[0]) : "", ...want])
  for (const d of want) {
    if (out.some((s) => docOf(s) === d)) continue
    const add = sorted.find((s) => docOf(s) === d)
    if (!add) continue
    const counts = new Map<string, number>()
    for (const s of out) counts.set(docOf(s), (counts.get(docOf(s)) ?? 0) + 1)
    const victim = [...out].reverse().find((s) => !keep.has(docOf(s)) || (counts.get(docOf(s)) ?? 0) > 1)
    if (!victim) continue
    out.splice(out.indexOf(victim), 1, add)
  }
  return out.sort(byScore)
}
