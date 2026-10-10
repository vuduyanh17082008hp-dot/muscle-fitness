import type { HierConfig } from "./hierarchical"
import type { HybridConfig } from "./hybrid"
import { canonTerm, normalizeTerms } from "./normalize"
import type { SemanticConfig } from "./semantic-rerank"
import type { IndexedKnowledgeChunk, NutritionKnowledgeQuery } from "./types"

export const SIGNAL_NAMES = ["lexicalBody", "localMatch", "headingMatch", "titleMatch", "category", "foodType", "sensory", "concept", "cuisine", "goal", "locale", "authority"] as const
export type SignalName = (typeof SIGNAL_NAMES)[number]
export type ScoreWeights = Record<SignalName, number>
export type ScoreConfig = {
  weights: ScoreWeights
  minScore: number
  /** Drop candidates scoring below this fraction of the best candidate (0 = off). Trims the low-confidence tail. */
  relativeFloor?: number
  /** Decision-rule / failure-mode sections never rank as primaries; they only attach as companions (the N1.6.1 design intent). */
  companionOnly?: boolean
  /** Diversity penalties applied while picking primaries. Absent = the N1.6.2 values (category 0.08, document 0.10). */
  repeatPenalty?: { category: number; document: number }
  /** Most primaries one document may contribute. Absent = MAX_PRIMARY_PER_DOCUMENT (3). */
  maxPerDocument?: number
  /**
   * What `lexicalBody` is matched against. "full" (R2) = the retrieval text, which prepends the document title / category / metadata
   * header to every chunk, so a document-level word lights up all of its sections equally. "local" = the section's own heading and
   * body plus the document title: document identity still counts, but metadata-header words no longer broadcast. Dedicated metadata
   * signals (foodType, cuisine, sensory, goal, category) are unchanged and keep deciding which DOCUMENT is relevant.
   */
  lexicalScope?: "full" | "local"
  /**
   * Score multiplier for a chunk whose document is for a DIFFERENT goal than the one the message itself states ("while cutting"
   * vs a muscle-gain document). Only applies to a stated goal, never to the stored goal. 1 / absent = off.
   */
  goalMismatchFactor?: number
  /** N1.6.3-R3-F: hierarchical document -> section retrieval (see hierarchical.ts). Absent = the flat scorer. */
  hier?: HierConfig
  /** N1.6.3-R3-G: bounded semantic rerank over the flat candidate pool (see semantic-rerank.ts). EXPERIMENT; absent = the flat scorer. */
  semantic?: SemanticConfig
  /** N1.6.3-R3-H: document signal x semantic section rerank (see hybrid.ts). EXPERIMENT; absent = the flat scorer. */
  hybrid?: HybridConfig
}

/**
 * N1.6.2 as shipped (frozen). `headingMatch` / `titleMatch` exist as measurable
 * signals but carry weight 0 here, so this config reproduces N1.6.2 exactly and
 * stays the reference every N1.6.3 experiment is measured against.
 */
export const BASELINE_CONFIG: ScoreConfig = {
  weights: { lexicalBody: 0.38, localMatch: 0, headingMatch: 0, titleMatch: 0, category: 0.16, foodType: 0.14, sensory: 0.1, concept: 0, cuisine: 0.08, goal: 0.06, locale: 0.04, authority: 0.04 },
  minScore: 0.3,
}

/**
 * N1.6.3-R1 configuration, kept as the reference R2 is measured against (NOT frozen; R1 re-measured it on nutrition-retrieval-eval-v2, see docs/nutrition-knowledge-eval.md).
 * - headingMatch fixes section ranking (the "Crunch" defect); titleMatch trims wrong-document results.
 * - MIN_SCORE 0.30 re-confirmed on v2 dev (sweep 0.20-0.45): lower adds filler, higher loses recall.
 * - relativeFloor 0.5 (R1): failure bucketing showed the dominant wrong-document class is low-scoring tail filler that never
 *   outranked the right chunk. Dropping candidates under half of the best score cut v2-dev wrong documents 0.224 -> 0.184 and
 *   v1-dev 0.172 -> 0.164 with no Recall@3 change on either. 0.55+ regressed v1-dev Recall@3 (0.964 -> 0.929), so it was rejected.
 */
export const R1_CONFIG: ScoreConfig = {
  weights: { ...BASELINE_CONFIG.weights, headingMatch: 0.2, titleMatch: 0.08 },
  minScore: 0.3,
  relativeFloor: 0.5,
  companionOnly: true,
  maxPerDocument: 2,
}

/**
 * N1.6.3-R2 active configuration (dev-tuned on nutrition-retrieval-eval-v3.1 DEV; see docs/nutrition-knowledge-eval.md "R2").
 * Same as R1_CONFIG plus three measured changes:
 * - localMatch 0.04: a small section-local tie-break. Document-level header terms are broadcast to every sibling section, so
 *   siblings tied exactly and the winner was decided by chunk id; heading + body evidence now separates them. Larger weights
 *   (0.06+) cost v1 Recall@3 because body words are generic.
 * - repeatPenalty.document 0: the same-document penalty (0.10) pushed a correct second section out for an unrelated weaker
 *   document. Category diversity (0.08) is kept; dropping it cost v1 section Top-3 (0.90 -> 0.80).
 * - maxPerDocument 3 (was 2): a third section of the right document beats filler once the penalty is gone.
 */
export const R2_CONFIG: ScoreConfig = {
  ...R1_CONFIG,
  weights: { ...R1_CONFIG.weights, localMatch: 0.04 },
  repeatPenalty: { category: 0.08, document: 0 },
  maxPerDocument: 3,
}

/**
 * N1.6.3-R3 active configuration (dev-tuned on nutrition-retrieval-eval-v4 DEV; see docs/nutrition-knowledge-eval-v4.md "R3").
 * R2_CONFIG plus three measured changes. The retrieval gains come mostly upstream (gate, Layer-2 retrieval intent, stopwords);
 * these are the scoring-side pieces that survived DEV measurement.
 * - lexicalScope "local": lexicalBody no longer matches the document metadata header that was prepended to every chunk, so a
 *   document-level word stops lighting up all sibling sections equally. Metadata signals still pick the document.
 * - concept 0.25: Layer-2 topic terms scored against the section's own heading + body. Larger weights (0.45+) let a
 *   semantic guess override exact local evidence and cost Section Top-3.
 * - goalMismatchFactor 0.7: a document for a different goal than the one the MESSAGE states ("while cutting") is demoted.
 * Rejected on DEV (see the doc): a no-local-evidence penalty, a stricter floor for non-leading documents, a reserved
 * second-document slot, damping raw lexical evidence when concepts exist, per-topic concept scoring, lower category diversity.
 */
export const R3_CONFIG: ScoreConfig = {
  ...R2_CONFIG,
  weights: { ...R2_CONFIG.weights, concept: 0.25 },
  lexicalScope: "local",
  goalMismatchFactor: 0.7,
}

/**
 * N1.6.3-R3-F DEV candidate (NOT active; see docs/nutrition-knowledge-eval-v4.md "R3-F"). R3_CONFIG plus an explicit document stage:
 * every document gets its own score (metadata + title + its best single section's evidence) and the final chunk order is
 * 0.5 x relative document score + 0.5 x the flat R3 chunk score. Measured and rejected, on four suites: local-only section scoring
 * (within a correct document Top-3 is 0.845 for every lexical variant), a candidate-document cutoff (v1 Recall@3 0.884 -> 0.837 for no
 * wrong-document gain), slot reservation / dominance-gated allocation (Recall@3 fell faster than wrong-document), a final-score floor.
 */
export const R3F_CONFIG: ScoreConfig = {
  ...R3_CONFIG,
  hier: {
    docWeights: { category: 0.16, foodType: 0.14, cuisine: 0.08, sensory: 0.1, goal: 0.06, title: 0.08, locale: 0.04, authority: 0.04, evidence: 0.38, concept: 0.25, coverage: 0, evidence2: 0 },
    sectionMode: "legacy",
    sectionWeights: { heading: 0.35, lexical: 0.35, concept: 0.2, sensory: 0.1 },
    docShare: 0.5,
    candidates: { n: Infinity, ratio: 0 },
    minSection: 0,
  },
}

export const ACTIVE_CONFIG: ScoreConfig = R3_CONFIG

/** Needs at least one topical signal; category/goal/locale/authority alone never qualify a chunk. */
const MIN_LEXICAL = 0.12

const GOAL = { full: 1, broad: 0.6, other: 0.15 } as const
const AUTHORITY = { mf_curated: 1, structured_database: 0.8, official_brand: 0.6, policy: 0 } as const

export type ScoreSignals = Record<SignalName, number>
/** Dev / eval only. Never serialised into an API response or a user-visible trace. */
export type ScoreBreakdown = ScoreSignals & { total: number }
export type ScoredChunk = { item: IndexedKnowledgeChunk; score: number; signals: ScoreSignals; breakdown: ScoreBreakdown }

export type CorpusStats = { size: number; df: Map<string, number> }

export function corpusStats(items: IndexedKnowledgeChunk[]): CorpusStats {
  const df = new Map<string, number>()
  for (const { normalizedTerms } of items) for (const t of normalizedTerms) df.set(t, (df.get(t) ?? 0) + 1)
  return { size: items.length, df }
}

/** No goal metadata = broadly applicable, never a rejection. */
export function compatibleGoalScore(queryGoal: string | undefined, docGoals: string[] | undefined): number {
  if (!queryGoal) return 0
  if (!docGoals?.length) return GOAL.broad
  return docGoals.map(canonTerm).includes(canonTerm(queryGoal)) ? GOAL.full : GOAL.other
}

const fraction = (wanted: string[] | undefined, have: Set<string>) => {
  const w = (wanted ?? []).map(canonTerm)
  return w.length ? w.filter((t) => have.has(t)).length / w.length : 0
}

export function scoreChunk(item: IndexedKnowledgeChunk, query: NutritionKnowledgeQuery, stats: CorpusStats, queryTerms: string[], config: ScoreConfig = ACTIVE_CONFIG): ScoredChunk | null {
  const m = item.chunk.metadata
  const terms = new Set(item.normalizedTerms)
  const local = new Set(item.localTerms)
  const idf = (t: string) => Math.log(1 + stats.size / (1 + (stats.df.get(t) ?? 0)))

  const known = queryTerms.filter((t) => stats.df.has(t))
  const total = known.reduce((s, t) => s + idf(t), 0)
  // Share of the (idf-weighted) query vocabulary that appears in a given term set.
  const overlap = (have: Set<string>) => (total ? known.filter((t) => have.has(t)).reduce((s, t) => s + idf(t), 0) / total : 0)
  const lexicalBody = overlap(config.lexicalScope === "local" ? new Set([...item.localTerms, ...item.titleTerms]) : terms)

  const catIndex = query.categories?.indexOf(m.category) ?? -1
  const foodType = fraction(query.foodTypes, new Set((m.foodTypes ?? []).map(canonTerm)))
  const sensory = fraction(query.sensoryTargets, terms)
  // Semantic topic terms are judged against the section's OWN heading + body: a topic never lights up every sibling of a document.
  const conceptKnown = (query.conceptTerms ?? []).filter((t) => stats.df.has(t))
  const conceptTotal = conceptKnown.reduce((s, t) => s + idf(t), 0)
  const concept = conceptTotal ? conceptKnown.filter((t) => local.has(t)).reduce((s, t) => s + idf(t), 0) / conceptTotal : 0
  const cuisine = fraction(query.cuisines, new Set((m.cuisines ?? []).map(canonTerm)))

  const signals: ScoreSignals = {
    lexicalBody,
    localMatch: overlap(local),
    headingMatch: overlap(new Set(item.headingTerms)),
    titleMatch: overlap(new Set(item.titleTerms)),
    category: catIndex < 0 ? 0 : Math.max(0.5, 1 - 0.2 * catIndex),
    foodType,
    sensory,
    concept,
    cuisine,
    goal: compatibleGoalScore(query.goal, m.goals),
    // Relevance modifier, not a filter: SG docs only get credit for SG users; everything else is neutral.
    locale: m.locale === "SG" ? (query.locale === "SG" ? 1 : 0) : 0.5,
    authority: AUTHORITY[m.authority],
  }

  // An explicit cuisine ask: other cuisines are noise, whatever their generic word overlap.
  if (query.cuisines?.length && m.category === "cuisine" && !cuisine) return null
  if (lexicalBody < MIN_LEXICAL && !foodType && !sensory && !cuisine && !concept) return null
  const goalMismatch = !!query.goalStated && signals.goal === GOAL.other
  const score = SIGNAL_NAMES.reduce((s, k) => s + config.weights[k] * signals[k], 0) * (goalMismatch ? (config.goalMismatchFactor ?? 1) : 1)
  return score >= config.minScore ? { item, score, signals, breakdown: { ...signals, total: score } } : null
}

export const queryTermsOf = (query: NutritionKnowledgeQuery) =>
  [...new Set([...normalizeTerms(query.query), ...(query.foodTypes ?? []), ...(query.cuisines ?? []), ...(query.sensoryTargets ?? []).map(canonTerm)])].sort()
