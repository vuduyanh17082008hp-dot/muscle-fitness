import type { ResolvedFood, ResolveRequest } from "@/lib/intelligence/food-resolution"
import { toGrams } from "@/lib/intelligence/food-resolution"
import { buildQueryDiagnostics, decideRetrieval, normalizeQueryText, parseUserQuery, type RetrievalDecision, type UserQueryFrame } from "@/lib/intelligence/query-understanding"
import { extractFoods } from "@/lib/intelligence/query-understanding/entities"
import { recordQueryDiagnostics } from "@/lib/intelligence/query-understanding/telemetry"

import type { OrchestrationPlan, PlannerOutput, RecentMessage } from "./types"

/**
 * Gemma's bridge to the shared query layer: build the frame, reconcile it with the planner's foods, and resolve each
 * food ONCE through the shared resolver (local canonical -> USDA) BEFORE the synchronous deterministic tool run.
 * The frame never replaces the planner or any safety/confirmation rule; it only supplies deterministic facts the
 * planner may have dropped (a carried quantity, a requested preparation) and verified food data.
 */

export function buildGemmaFrame(message: string, recent: RecentMessage[], activeDraftFoods?: string[]): { frame: UserQueryFrame; retrieval: RetrievalDecision } {
  const history = recent.map((m) => ({ role: m.role === "user" ? ("user" as const) : ("assistant" as const), text: m.text }))
  const frame = parseUserQuery(message, { surface: "GEMMA", history, activeTask: activeDraftFoods?.length ? { foods: activeDraftFoods } : undefined })
  return { frame, retrieval: decideRetrieval(frame) }
}

export type FoodResolveFn = (req: ResolveRequest) => Promise<ResolvedFood>

const MASS = new Set(["g", "gram", "grams", "gr", "gam", "kg", "oz", "ounce", "ounces", "lb", "lbs"])

/** Planner foods + frame quantity: a single food with no grams inherits a deterministic mass from the frame (never a count unit). */
export function reconcileFoods(foods: OrchestrationPlan["foods"], frame: UserQueryFrame): OrchestrationPlan["foods"] {
  if (foods.length !== 1 || foods[0].grams !== null) return foods
  const { quantity, unit } = frame.constraints
  if (quantity === undefined || !unit || !MASS.has(unit)) return foods
  const g = toGrams(quantity, unit)
  return g.grams === null ? foods : [{ ...foods[0], grams: g.grams }]
}

/**
 * The food the previous tool run resolved, kept as structured state (never read back from assistant prose). It carries identity
 * and basis only: the client echoes it, so its numbers are never trusted — a follow-up re-resolves the record server-side and the
 * reference only pins which one ("150 g of that" stays the same raw/cooked record).
 */
export type ResolvedFoodReference = { canonicalName: string; provider: "LOCAL_CANONICAL" | "USDA_FDC"; sourceId: string; basis: "raw" | "cooked" | "prepared" | "packaged" | "unknown"; base: string }

const baseOf = (text: string) => extractFoods(normalizeQueryText(text))[0]?.base ?? text.toLowerCase()

/** Exactly one verified food this turn → the reference a follow-up may use. Anything else (none, several, unverified) → null. */
export function foodReferenceFrom(foods: OrchestrationPlan["foods"], resolved: Record<string, ResolvedFood>): ResolvedFoodReference | null {
  if (foods.length !== 1) return null
  const hit = resolved[foods[0].text]
  if (!hit || !hit.name || !hit.sourceId || !hit.per100g || hit.source === "NONE" || (hit.status !== "VERIFIED" && hit.status !== "ESTIMATED")) return null
  return { canonicalName: hit.name, provider: hit.source, sourceId: hit.sourceId, basis: hit.basis, base: baseOf(foods[0].text) }
}

export async function resolvePlanFoods(foods: OrchestrationPlan["foods"], frame: UserQueryFrame, resolve: FoodResolveFn, reference?: ResolvedFoodReference | null): Promise<Record<string, ResolvedFood>> {
  const out: Record<string, ResolvedFood> = {}
  await Promise.all(foods.map(async (food) => {
    try {
      const hit = extractFoods(normalizeQueryText(food.text))[0]
      const frameFood = frame.entities.find((e) => e.kind === "FOOD" && hit && e.base === hit.base)
      // Variety comes from the planner's own words, or the frame's entity when the planner used a bare noun after a follow-up.
      const text = hit?.value ?? food.text.toLowerCase()
      const variety = frameFood && frameFood.value.length > text.length ? frameFood.value : text
      const base = hit?.base ?? food.text.toLowerCase()
      // A follow-up about the food the last tool run resolved keeps that record's basis; a food named this turn starts fresh.
      const followsReference = reference && frameFood && frameFood.origin !== "CURRENT_TURN" && reference.base === base && (reference.basis === "raw" || reference.basis === "cooked")
      out[food.text] = await resolve({ text: variety, base, preparation: frame.constraints.preparation, quantityGrams: food.grams, ...(followsReference ? { referenceBasis: reference.basis as "raw" | "cooked" } : {}) })
    } catch (error) {
      // A resolver failure must never break the turn: the legacy local-table path still runs for this food.
      console.warn("[query-understanding] food resolution failed:", error instanceof Error ? error.name : "unknown")
    }
  }))
  return out
}

export function recordGemmaQueryTelemetry(frame: UserQueryFrame, retrieval: RetrievalDecision, resolved: Record<string, ResolvedFood>): void {
  const first = Object.values(resolved)[0]
  recordQueryDiagnostics("GEMMA", buildQueryDiagnostics(frame, retrieval), first ? { usda: first.diagnostics.USDA_LOOKUP.status, local: first.diagnostics.LOCAL_LOOKUP.hit, latencyMs: first.diagnostics.USDA_LOOKUP.latencyMs } : {})
}

const LOOKUP_INTENTS = new Set(["FOOD_MACRO_LOOKUP", "FOLLOWUP_QUANTITY", "MACRO_CALCULATION"])
const QUANTITY_QUESTION_INTENTS = new Set(["FOOD_FACT", "BARE_MENTION"])
const ASKS_MACRO = /(?<![\p{L}])(?:protein|calories?|kcal|carbs?|fat|macros?|calo|đạm)(?![\p{L}])/iu

/**
 * Stage-2 understanding without the planner model: a plain "macros for X" / "what about 200g?" turn whose food (and
 * quantity) the frame resolved is fully determined, so a planner outage must not turn it into a generic chat answer.
 * Returns null unless the frame is a confident, unambiguous food lookup.
 */
export function frameLookupOutput(frame: UserQueryFrame): PlannerOutput | null {
  if (frame.ambiguity.present) return null
  const food = frame.entities.find((e) => e.kind === "FOOD")
  if (!food) return null
  const { quantity, unit } = frame.constraints
  // A longer follow-up the classifier reads as a general food question ("how much protein is in 150 g of that?") is still a
  // quantity lookup: one food, a mass the user typed this turn, and a macro word. Without the tool the reply restates stale numbers.
  const statedMass = frame.entities.some((e) => e.kind === "QUANTITY" && e.origin === "CURRENT_TURN" && e.unit !== undefined && MASS.has(e.unit))
  const quantityQuestion = QUANTITY_QUESTION_INTENTS.has(frame.intent) && statedMass && ASKS_MACRO.test(frame.normalizedText) && new Set(frame.entities.filter((e) => e.kind === "FOOD").map((e) => e.base)).size === 1
  if (!LOOKUP_INTENTS.has(frame.intent) && !quantityQuestion) return null
  const grams = quantity !== undefined && unit && MASS.has(unit) ? toGrams(quantity, unit).grams : null
  if (quantity !== undefined && unit && grams === null) return null // a count unit needs a verified serving weight: let the planner/clarifier handle it
  return {
    understanding: { userGoal: null, explicitRequests: ["food macros"], implicitNeeds: [], referencedEntities: [food.surface], constraints: [], uncertainties: [], continuationOfPreviousTurn: false, referencedPriorOffer: false, referencedOption: null, proposedResponseStrategy: null },
    need: { primaryNeed: "food macros", secondaryNeeds: [], needExactCalculation: true, needFoodLookup: true, needKnowledgeRetrieval: false, needAthleteState: false, needClarification: false, needActionConfirmation: false, confidence: "MEDIUM" },
    strategy: { mode: "ANSWER", primaryObjective: "state food macros", supportingObjectives: [], requiresConfirmation: false },
    clarification: null,
    // The user's own words (entity grounding only accepts foods that appear in the conversation); the resolver maps them to the canonical base.
    foods: [{ text: food.surface, grams }],
  } as PlannerOutput
}

const REFERENCE_INTENTS = new Set([...LOOKUP_INTENTS, ...QUANTITY_QUESTION_INTENTS, "UNKNOWN"])

/**
 * "150 g of that" with no food to point at, or with two: ask which food, never pick one. Deterministic (no model), and only for
 * a turn the frame read as depending on an earlier food and that states a mass of its own.
 */
export function frameReferenceClarification(frame: UserQueryFrame): PlannerOutput | null {
  if (!frame.references.unresolvedReferences.includes("food") || !REFERENCE_INTENTS.has(frame.intent)) return null
  const mass = frame.entities.find((e) => e.kind === "QUANTITY" && e.origin === "CURRENT_TURN" && e.unit !== undefined && MASS.has(e.unit))
  if (!mass) return null
  const options = frame.references.ambiguousFoods ?? []
  const vi = frame.language === "VI"
  const choice = options.length > 1 ? `: ${options.slice(0, -1).join(", ")} ${vi ? "hay" : "or"} ${options[options.length - 1]}` : ""
  const question = vi ? `Bạn muốn tính ${mass.surface} cho món nào${choice}?` : `Which food do you mean for ${mass.surface}${choice}?`
  return {
    understanding: { userGoal: null, explicitRequests: ["food macros"], implicitNeeds: [], referencedEntities: [], constraints: [], uncertainties: ["food"], continuationOfPreviousTurn: false, referencedPriorOffer: false, referencedOption: null, proposedResponseStrategy: null },
    need: { primaryNeed: "food macros", secondaryNeeds: [], needExactCalculation: false, needFoodLookup: false, needKnowledgeRetrieval: false, needAthleteState: false, needClarification: true, needActionConfirmation: false, confidence: "MEDIUM" },
    strategy: { mode: "CLARIFY", primaryObjective: "ask which food", supportingObjectives: [], requiresConfirmation: false },
    clarification: { question, affects: "calculation" },
    foods: [],
  } as PlannerOutput
}

/**
 * The planner may recognise a food lookup yet leave `foods` empty (observed live on a Vietnamese "macro cá tuyết sao"), or treat
 * a quantity/variety follow-up ("same but Atlantic cod?") as pure continuity with no tools, so the reply restates stale numbers.
 * When the deterministic frame is a confident lookup, supply the food (in the user's own words, which entity grounding requires)
 * and request the exact calculation. Only ANSWER/CONTINUE turns are touched — questions, refusals and escalations keep the
 * planner's decision. Skipped while a meal draft is active: "what about 200g?" may then mean the draft, which the planner knows.
 */
export function reconcileOutputWithFrame(output: PlannerOutput, frame: UserQueryFrame, options: { hasActiveDraft?: boolean } = {}): PlannerOutput {
  if (options.hasActiveDraft) return output
  if (output.strategy.mode !== "ANSWER" && output.strategy.mode !== "CONTINUE") return output
  const clarify = frameReferenceClarification(frame)
  if (clarify) return clarify
  const fromFrame = frameLookupOutput(frame)
  if (!fromFrame) return output
  return { ...output, need: { ...output.need, needFoodLookup: true, needExactCalculation: true }, foods: output.foods.length > 0 ? output.foods : fromFrame.foods }
}
