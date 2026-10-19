import { rawMessageOf } from "./query"
import type { ScoredChunk } from "./score"
import type { NutritionKnowledgeChunk, NutritionKnowledgeQuery } from "./types"

/**
 * N1.6.3-R3-G: bounded semantic rerank (EXPERIMENT, opt-in via ScoreConfig.semantic; absent = byte-for-byte the flat scorer).
 * Embeddings are a reordering signal over the lexical/concept candidates, never a retriever: nothing outside the top-`k`
 * candidate pool is ever promoted into it, and the pool is the one the lexical scorer already produced. Vectors are looked up
 * synchronously from a precomputed store (`embed`); a missing vector for the query or any pool member skips the rerank
 * entirely (fail open to the lexical order), so a stale store degrades to R3, never to a wrong answer.
 *
 * Every mode only moves scores around inside the candidate pool, in the pool's own score range, so the selector's category
 * penalty, the document cap and the relative floor keep their meaning:
 *   section     G1  per document, the document's own set of scores is re-assigned to its sections in similarity order
 *   tie         G2  chunks whose scores sit within `epsilon` of a cluster's top are ordered by similarity (scores re-assigned)
 *   blend       G3  alpha * minmax(score) + beta * minmax(similarity) over the pool, rescaled back into [min, max] of the pool
 *   doc+section G4  G1, then documents whose best scores are within `docEpsilon` are ordered by their best similarity
 */
export type SemanticConfig = {
  mode: "section" | "tie" | "blend" | "doc+section"
  /** Candidate budget: only the top `k` chunks (that also clear the relative floor, when given) are reranked. */
  k: number
  /** tie / doc+section: score band (absolute, same units as the chunk score) that counts as "close". */
  epsilon?: number
  docEpsilon?: number
  /** blend weights over the min-max normalised score and similarity. */
  alpha?: number
  beta?: number
  /** What the query vector is built from: the raw message, or the raw message + the compact structured intent. */
  query: "raw" | "intent"
  /** What a chunk vector is built from. */
  corpus: "body" | "titled"
  /** Precomputed vector for an exact input text, or undefined when none is stored. */
  embed: (text: string) => ArrayLike<number> | undefined
  /** Called with the number of missing vectors whenever a rerank is skipped (eval accounting). */
  onSkip?: (missing: string[]) => void
}

/** Embedding input for a chunk: its own heading + body; "titled" adds the document title as a one-line label (no metadata header). */
export function chunkEmbedText(chunk: NutritionKnowledgeChunk, corpus: SemanticConfig["corpus"]): string {
  const body = `${chunk.heading}\n${chunk.content}`.slice(0, 4000)
  return corpus === "titled" ? `${chunk.metadata.title} - ${body}` : body
}

/** Embedding input for a query. Only observable structure is added (the built query's facets); no model reasoning. */
export function queryEmbedText(query: NutritionKnowledgeQuery, kind: SemanticConfig["query"]): string {
  const raw = rawMessageOf(query) ?? query.query
  if (kind === "raw") return raw
  const part = (k: string, v?: string[] | string) => (v?.length ? [`${k}: ${[v].flat().join(", ")}`] : [])
  return [raw, ...part("topics", query.conceptTerms), ...part("goal", query.goal), ...part("sensory", query.sensoryTargets), ...part("cuisine", query.cuisines), ...part("food", query.foodTypes)].join("\n")
}

const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i]
  return sum
}
const byScore = (a: ScoredChunk, b: ScoredChunk) => b.score - a.score || (a.item.chunk.id < b.item.chunk.id ? -1 : 1)
const withScore = (s: ScoredChunk, score: number): ScoredChunk => ({ ...s, score, breakdown: { ...s.breakdown, total: score } })
const docOf = (s: ScoredChunk) => s.item.chunk.documentId

/** Hand `scores` (descending) to `members` in descending-similarity order. */
function assign(members: ScoredChunk[], scores: number[], sim: Map<ScoredChunk, number>, out: Map<ScoredChunk, number>) {
  const order = [...members].sort((a, b) => sim.get(b)! - sim.get(a)! || byScore(a, b))
  order.forEach((m, i) => out.set(m, scores[i]))
}

export function semanticRerank(scored: ScoredChunk[], query: NutritionKnowledgeQuery, cfg: SemanticConfig, relativeFloor = 0): ScoredChunk[] {
  if (scored.length < 2) return scored
  const sorted = [...scored].sort(byScore)
  const floor = (sorted[0]?.score ?? 0) * relativeFloor
  const pool = sorted.filter((s) => s.score >= floor).slice(0, cfg.k)
  const rest = sorted.filter((s) => !pool.includes(s))
  if (pool.length < 2) return sorted

  const qText = queryEmbedText(query, cfg.query)
  const qVec = cfg.embed(qText)
  const vecs = pool.map((s) => cfg.embed(chunkEmbedText(s.item.chunk, cfg.corpus)))
  const missing = [...(qVec ? [] : [qText]), ...pool.flatMap((s, i) => (vecs[i] ? [] : [s.item.chunk.id]))]
  if (!qVec || missing.length) {
    cfg.onSkip?.(missing)
    return sorted
  }
  const sim = new Map(pool.map((s, i) => [s, dot(qVec, vecs[i]!)]))
  const next = new Map<ScoredChunk, number>(pool.map((s) => [s, s.score]))

  const sectionRerank = () => {
    const groups = new Map<string, ScoredChunk[]>()
    for (const s of pool) groups.set(docOf(s), [...(groups.get(docOf(s)) ?? []), s])
    for (const members of groups.values()) assign(members, members.map((m) => m.score).sort((a, b) => b - a), sim, next)
  }

  if (cfg.mode === "section") sectionRerank()
  else if (cfg.mode === "tie") {
    for (let i = 0; i < pool.length; ) {
      let j = i + 1
      while (j < pool.length && pool[i].score - pool[j].score <= (cfg.epsilon ?? 0)) j++
      assign(pool.slice(i, j), pool.slice(i, j).map((m) => m.score), sim, next)
      i = j
    }
  } else if (cfg.mode === "blend") {
    const mm = (xs: number[]) => {
      const lo = Math.min(...xs), hi = Math.max(...xs)
      return (x: number) => (hi > lo ? (x - lo) / (hi - lo) : 0)
    }
    const scores = pool.map((s) => s.score)
    const lo = Math.min(...scores), hi = Math.max(...scores)
    const nScore = mm(scores), nSim = mm([...sim.values()])
    for (const s of pool) next.set(s, lo + (hi - lo) * ((cfg.alpha ?? 0.7) * nScore(s.score) + (cfg.beta ?? 0.3) * nSim(sim.get(s)!)))
  } else {
    sectionRerank()
    const docs = new Map<string, ScoredChunk[]>()
    for (const s of pool) docs.set(docOf(s), [...(docs.get(docOf(s)) ?? []), s])
    const stat = [...docs].map(([id, members]) => ({ id, members, best: Math.max(...members.map((m) => next.get(m)!)), sim: Math.max(...members.map((m) => sim.get(m)!)) })).sort((a, b) => b.best - a.best || (a.id < b.id ? -1 : 1))
    for (let i = 0; i < stat.length; ) {
      let j = i + 1
      while (j < stat.length && stat[i].best - stat[j].best <= (cfg.docEpsilon ?? 0)) j++
      const cluster = stat.slice(i, j)
      const bests = cluster.map((d) => d.best)
      const order = [...cluster].sort((a, b) => b.sim - a.sim || b.best - a.best)
      order.forEach((d, n) => { for (const m of d.members) next.set(m, next.get(m)! + (bests[n] - d.best)) })
      i = j
    }
  }
  return [...pool.map((s) => withScore(s, next.get(s)!)), ...rest].sort(byScore)
}
