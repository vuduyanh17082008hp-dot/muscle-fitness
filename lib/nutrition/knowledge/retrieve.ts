import { buildKnowledgeContext, MAX_PRIMARY_CHUNKS, renderKnowledgeContext } from "./context"
import { pickCompanions } from "./companion"
import { COMPANION_HEADINGS, filterEligible, headingSlug } from "./filter"
import { allocateSlots, rankHierarchical } from "./hierarchical"
import { hybridScores, protectedDocuments, protectDocuments } from "./hybrid"
import { loadKnowledgeChunks } from "./load"
import { indexChunk } from "./normalize"
import { buildKnowledgeQuery } from "./query"
import { prepareRetrievalConfig, type SemanticDeps, type SemanticDiagnostics } from "./runtime-semantic"
import { semanticRerank } from "./semantic-rerank"
import { ACTIVE_CONFIG, corpusStats, queryTermsOf, scoreChunk, type CorpusStats, type ScoreConfig, type ScoredChunk } from "./score"
import { makeTrace } from "./trace"
import type { IndexedKnowledgeChunk, KnowledgeNeedDecision, NutritionKnowledgeChunk, NutritionKnowledgeContext, NutritionKnowledgeQuery, NutritionRetrievalTrace } from "./types"

export const MAX_PRIMARY_PER_DOCUMENT = 3
/** Mild nudge toward covering different categories (craving / makeover / texture / goal) over repeating one. */
export const DEFAULT_REPEAT_PENALTY = { category: 0.08, document: 0.1 } as const

export type KnowledgeIndex = { items: IndexedKnowledgeChunk[]; stats: CorpusStats; byDocument: Map<string, IndexedKnowledgeChunk[]> }

export function buildKnowledgeIndex(chunks: NutritionKnowledgeChunk[]): KnowledgeIndex {
  const items = chunks.map(indexChunk)
  const byDocument = new Map<string, IndexedKnowledgeChunk[]>()
  for (const it of items) byDocument.set(it.chunk.documentId, [...(byDocument.get(it.chunk.documentId) ?? []), it])
  return { items, stats: corpusStats(items), byDocument }
}

let cached: KnowledgeIndex | null = null
/** Repo corpus, parsed once per server instance. A load failure is thrown (callers degrade to null), never cached. */
export function getKnowledgeIndex(): KnowledgeIndex {
  return (cached ??= buildKnowledgeIndex(loadKnowledgeChunks()))
}

/** Highest score first with per-document cap and category-coverage nudge. Ties break on chunk id (deterministic). */
function selectPrimary(scored: ScoredChunk[], k: number, penalty: { category: number; document: number } = DEFAULT_REPEAT_PENALTY, maxPerDoc = MAX_PRIMARY_PER_DOCUMENT): ScoredChunk[] {
  const pool = [...scored].sort((a, b) => b.score - a.score || (a.item.chunk.id < b.item.chunk.id ? -1 : 1))
  const picked: ScoredChunk[] = []
  while (picked.length < k) {
    let best: { s: ScoredChunk; adjusted: number } | null = null
    for (const s of pool) {
      if (picked.includes(s)) continue
      const sameDoc = picked.filter((p) => p.item.chunk.documentId === s.item.chunk.documentId).length
      if (sameDoc >= maxPerDoc) continue
      const repeats = picked.filter((p) => p.item.chunk.metadata.category === s.item.chunk.metadata.category).length
      const adjusted = s.score - penalty.category * repeats - penalty.document * sameDoc
      if (!best || adjusted > best.adjusted) best = { s, adjusted }
    }
    if (!best) break
    picked.push(best.s)
  }
  return picked
}

/**
 * R3-H (experiment): G3 semantic rerank over the flat pool, then the R3-F document signal on top. `docs` also feed the multi-document guard.
 * Returns null when the semantic rerank was skipped (no vector for the query or a pool member): the caller then runs plain R3, never a half hybrid.
 */
function hybridRank(index: KnowledgeIndex, query: NutritionKnowledgeQuery, config: ScoreConfig, lexical: ScoredChunk[]) {
  const h = config.hybrid!
  let skipped = false
  const sem = semanticRerank(lexical, query, { ...h.semantic, onSkip: (m) => ((skipped = true), h.semantic.onSkip?.(m)) }, config.relativeFloor)
  if (skipped) return null
  const docs = rankHierarchical(index.items, index.stats, query, { ...config, hybrid: undefined, hier: { ...h.doc, candidates: { n: Infinity, ratio: 0 } } }).docs
  return { docs, all: hybridScores(sem, docs, h) }
}

export type RetrievalResult = { context: NutritionKnowledgeContext | null; trace: NutritionRetrievalTrace }

/** Dev / eval only: every eligible chunk that clears the gates, with its full score breakdown, best first. */
export function scoreAllForEval(index: KnowledgeIndex, query: NutritionKnowledgeQuery, config: ScoreConfig = ACTIVE_CONFIG): ScoredChunk[] {
  if (config.hier) return rankHierarchical(index.items, index.stats, query, config).sections.map((s) => s.scored)
  const queryTerms = queryTermsOf(query)
  const flat = filterEligible(index.items)
    .filter((item) => !config.companionOnly || !(COMPANION_HEADINGS as readonly string[]).includes(headingSlug(item)))
    .flatMap((item) => scoreChunk(item, query, index.stats, queryTerms, config) ?? [])
    .sort((a, b) => b.score - a.score || (a.item.chunk.id < b.item.chunk.id ? -1 : 1))
  if (config.hybrid) return hybridRank(index, query, config, flat)?.all ?? flat
  return config.semantic ? semanticRerank(flat, query, config.semantic, config.relativeFloor) : flat
}

/** Synchronous core: filter -> score -> select -> companions -> bounded context. `config` is for evaluation; the runtime uses ACTIVE_CONFIG. */
export function retrieveKnowledge(index: KnowledgeIndex, query: NutritionKnowledgeQuery, decision: KnowledgeNeedDecision, config: ScoreConfig = ACTIVE_CONFIG): RetrievalResult {
  const started = performance.now()
  const eligible = filterEligible(index.items)
  const queryTerms = queryTermsOf(query)
  const rankable = config.companionOnly ? eligible.filter((item) => !(COMPANION_HEADINGS as readonly string[]).includes(headingSlug(item))) : eligible
  const k = Math.min(query.topK ?? MAX_PRIMARY_CHUNKS, MAX_PRIMARY_CHUNKS)
  const hier = config.hier ? rankHierarchical(index.items, index.stats, query, config) : null
  const lexical = rankable.flatMap((item) => scoreChunk(item, query, index.stats, queryTerms, config) ?? [])
  const hyb = config.hybrid ? hybridRank(index, query, config, lexical) : null
  const all = hyb ? hyb.all : hier ? hier.sections.map((s) => s.scored) : config.semantic ? semanticRerank(lexical, query, config.semantic, config.relativeFloor) : lexical
  const best = all.reduce((m, s) => Math.max(m, s.score), 0)
  const scored = config.relativeFloor ? all.filter((s) => s.score >= best * config.relativeFloor!) : all
  const protect = hyb ? config.hybrid!.protect : undefined
  const dominant = protect?.dominantRepeat && hyb && !protectedDocuments(scored, hyb.docs, protect, query).length
  const normal = selectPrimary(scored, k, dominant ? protect!.dominantRepeat : config.repeatPenalty, config.maxPerDocument)
  const primary =
    hier && config.hier!.allocation
      ? allocateSlots(hier.sections.filter((s) => scored.includes(s.scored)), hier.docs, k, config.hier!.allocation)
      : hyb && protect
        ? protectDocuments(normal, scored, hyb.docs, protect, query)
        : normal
  const built = primary.length ? buildKnowledgeContext(primary, pickCompanions(primary, index.byDocument)) : null
  const chunks = built?.chunks ?? []
  const trace = makeTrace({
    reason: decision.reason,
    query,
    candidateCount: index.items.length,
    filteredCount: eligible.length,
    chunks,
    contextCharacters: built ? renderKnowledgeContext(built).length : 0,
    latencyMs: performance.now() - started,
  })
  return { context: built ? { query, chunks, retrievalTrace: trace } : null, trace }
}

/**
 * Optional enhancement under the N1.5 conversation layer. Any failure
 * (loader, parser, scorer, malformed chunk) degrades to `null` — retrieval is
 * never a dependency of the Nutrition Coach.
 */
export async function getOptionalNutritionKnowledgeContext(
  input: Omit<Parameters<typeof buildKnowledgeQuery>[0], "reason"> & { need: KnowledgeNeedDecision },
  options: { index?: KnowledgeIndex; log?: (trace: NutritionRetrievalTrace) => void; semantic?: SemanticDeps; logSemantic?: (d: SemanticDiagnostics & { candidateCount: number; rerankLatencyMs: number }) => void } = {},
): Promise<NutritionKnowledgeContext | null> {
  if (!input.need.needed) return null
  const started = performance.now()
  const log = options.log ?? ((t: NutritionRetrievalTrace) => console.info("[nutrition-knowledge]", JSON.stringify(t)))
  let query: NutritionKnowledgeQuery = { query: "" }
  try {
    query = buildKnowledgeQuery({ ...input, reason: input.need.reason, hints: input.need.hints })
    const index = options.index ?? getKnowledgeIndex()
    // R3-H: the single (bounded, never-throwing) query embedding of this turn; any failure leaves plain R3.
    const prepared = await prepareRetrievalConfig(query, index.items, options.semantic)
    const rerankStarted = performance.now()
    const { context, trace } = retrieveKnowledge(index, query, input.need, prepared.config)
    prepared.finish()
    log(trace)
    // Counts, flags and timings only: never the query, vectors or chat content.
    ;(options.logSemantic ?? ((d) => console.info("[nutrition-knowledge-semantic]", JSON.stringify(d))))({ ...prepared.diag, candidateCount: trace.candidateCount, rerankLatencyMs: Math.round(performance.now() - rerankStarted) })
    return context
  } catch {
    log(makeTrace({ reason: input.need.reason, query, candidateCount: 0, filteredCount: 0, chunks: [], contextCharacters: 0, latencyMs: performance.now() - started, fallbackUsed: true }))
    return null
  }
}
