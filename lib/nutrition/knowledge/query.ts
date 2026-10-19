import type { NutritionIntent, NutritionTopic } from "../coach/conversation"
import { canonTerm, detectConcepts, normalizeTerms } from "./normalize"
import { SENSORY_RETRIEVAL_TERMS, TOPIC_RETRIEVAL_TERMS, type SemanticQueryHints } from "./semantic-hints"
import type { KnowledgeNeedReason, NutritionKnowledgeCategory, NutritionKnowledgeLocale, NutritionKnowledgeQuery } from "./types"

export const DEFAULT_TOP_K = 4

/**
 * N1.6.3-R3-G (experimental, opt-in): the raw message behind a built query, for the semantic reranker only. A WeakMap side
 * channel, not a field: the query object is passed around and returned in the context, and a raw message must never ride along.
 */
const RAW_MESSAGE = new WeakMap<object, string>()
export const rawMessageOf = (q: NutritionKnowledgeQuery): string | undefined => RAW_MESSAGE.get(q)

/** Which corpus categories each need reason searches, most relevant first. */
const CATEGORIES: Record<KnowledgeNeedReason, NutritionKnowledgeCategory[]> = {
  CRAVING: ["craving", "food_makeover", "flavor_texture", "coaching", "goal"],
  FOOD_MAKEOVER: ["food_makeover", "flavor_texture", "craving", "goal"],
  CUISINE: ["cuisine", "flavor_texture"],
  FLAVOR_TEXTURE: ["flavor_texture", "food_makeover", "craving"],
  STRATEGY: ["goal", "principle", "cuisine", "food_makeover"],
  COACHING: ["coaching", "principle"],
  GENERAL_NUTRITION: ["principle", "goal"],
  NOT_NEEDED: [],
}

/**
 * Builds the retrieval query from N1.5 understanding + real Athlete State
 * fields (goal, timezone). The raw message is only a source of terms; it is
 * not searched verbatim and it is not stored in the trace.
 */
export function buildKnowledgeQuery(input: {
  message: string
  reason: KnowledgeNeedReason
  intent?: NutritionIntent
  topic?: NutritionTopic
  /** CoachContext.snapshot.goal */
  goal?: string | null
  /** CoachContext.snapshot.timezone */
  timezone?: string | null
  /** Layer-2 facets (closed vocabularies). Absent for deterministic decisions. */
  hints?: SemanticQueryHints
}): NutritionKnowledgeQuery {
  const { message, topic } = input
  const found = detectConcepts(`${message} ${topic?.food ?? ""}`)
  const hints = (input.hints?.sensory ?? []).map((h) => SENSORY_RETRIEVAL_TERMS[h])
  const sensory = [...new Set([...(topic?.sensoryTargets ?? []).map(canonTerm), ...found.sensory, ...hints.map((h) => canonTerm(h.sensory))])]
  const locale: NutritionKnowledgeLocale = input.timezone === "Asia/Singapore" ? "SG" : "global"
  const foods = [...new Set([...found.food, ...(input.hints?.foods ?? [])])]
  const cuisines = [...new Set([...found.cuisine, ...(input.hints?.cuisines ?? [])])]
  // The goal the message itself states (any language) outranks the stored goal; both only steer retrieval, never state.
  const statedGoal = found.goal[0] ?? input.hints?.goal
  const goal = statedGoal ?? input.goal ?? undefined
  const conceptTerms = [...new Set(normalizeTerms((input.hints?.topics ?? []).flatMap((t) => TOPIC_RETRIEVAL_TERMS[t]).join(" ")))]
  const terms = [...new Set([...normalizeTerms(`${message} ${topic?.food ?? ""}`), ...hints.flatMap((h) => h.terms), ...foods, ...cuisines])]

  const built: NutritionKnowledgeQuery = {
    query: terms.join(" ").slice(0, 200),
    ...(input.intent ? { intent: input.intent } : {}),
    ...(goal ? { goal } : {}),
    ...(statedGoal ? { goalStated: true } : {}),
    categories: CATEGORIES[input.reason],
    ...(foods.length ? { foodTypes: foods } : {}),
    ...(cuisines.length ? { cuisines } : {}),
    ...(sensory.length ? { sensoryTargets: sensory } : {}),
    ...(conceptTerms.length ? { conceptTerms } : {}),
    locale,
    topK: DEFAULT_TOP_K,
  }
  RAW_MESSAGE.set(built, message)
  return built
}

/** Short, privacy-safe description for the trace: structure only, no free text. */
export function summarizeQuery(q: NutritionKnowledgeQuery): string {
  const part = (k: string, v?: string[] | string) => (v && v.length ? [`${k}=${[v].flat().join("+")}`] : [])
  return [...part("goal", q.goal), ...part("cuisine", q.cuisines), ...part("food", q.foodTypes), ...part("sensory", q.sensoryTargets), ...part("concepts", q.conceptTerms?.length ? String(q.conceptTerms.length) : undefined), ...part("locale", q.locale)].join(" ") || "generic"
}
