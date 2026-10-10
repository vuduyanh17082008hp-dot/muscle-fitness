import { z } from "zod"

import { COACH_INGREDIENT_IDS, findIngredientByText, getIngredient } from "./ingredients"
import { opSchema } from "./schema"
import { totalsFor } from "./macros"
import type { ActiveMealDraft, DraftItem, MacroTotals } from "./types"

/**
 * N1.5.6 — conversational continuity & safe follow-up resolution (pure: no
 * Supabase, no LLM, no clock except the injected `now`).
 *
 * "Last referent != user intent." This file only decides WHAT a short message
 * refers to and WHAT KIND of thing is being asked (read / explain / propose /
 * clarify / new topic). Numbers come from `totalsFor`; proposals are built and
 * safety-gated in followup-actions.ts; nothing here mutates a draft.
 */

/* =========================================================
   TYPES + WIRE SCHEMAS (state is client-echoed, so everything is re-validated)
========================================================= */

export const FOLLOW_UP_INTENTS = [
  "SHOW_INGREDIENTS", "SHOW_MACROS", "SHOW_PORTIONS", "EXPLAIN_RECOMMENDATION",
  "SELECT_PREVIOUS_OPTION", "COMPARE_PREVIOUS_OPTIONS",
  "MODIFY_PREVIOUS_RESULT", "SUBSTITUTE_IN_PREVIOUS_RESULT",
  "ADD_INGREDIENT", "REMOVE_INGREDIENT", "ADJUST_QUANTITY", "APPLY_DIETARY_CONSTRAINT",
  "CORRECT_PREVIOUS_RESOLUTION", "UNDO_LAST_PROPOSAL", "REVERT_TO_ORIGINAL",
  "CONTINUE_CURRENT_TOPIC",
] as const
export type NutritionFollowUpIntent = (typeof FOLLOW_UP_INTENTS)[number]

export const MODIFIERS = ["cheaper", "more_protein", "lower_calories", "more_filling", "faster", "tastier"] as const
export type Modifier = (typeof MODIFIERS)[number]

export type ResponseMode = "READ_ONLY" | "EXPLAIN" | "PROPOSE_MODIFICATION" | "CLARIFY" | "NEW_TOPIC"
export type ResolutionConfidence = "HIGH" | "MEDIUM" | "LOW"

const idString = z.string().min(1).max(64)
export const referentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("MEAL_DRAFT"), id: idString, name: z.string().max(120) }),
  z.object({ type: z.literal("MEAL_RESULT"), id: idString, name: z.string().max(120) }),
  z.object({ type: z.literal("FOOD"), name: z.string().max(80) }),
  z.object({ type: z.literal("OPTION_SET"), optionIds: z.array(idString).max(6) }),
  z.object({ type: z.literal("GENERAL_TOPIC"), topic: z.string().max(80) }),
])
export type ConversationReferent = z.infer<typeof referentSchema>

const isoString = z.string().max(40)
const itemSchema = z.object({ ingredientId: z.enum(COACH_INGREDIENT_IDS as [string, ...string[]]), grams: z.number().positive().max(2000) })

/** Server-recorded structured result. Only ids + grams are trusted; macros are always recomputed (see toMealResultReference). */
export const mealResultSchema = z.object({
  id: idString,
  name: z.string().trim().min(1).max(120),
  family: z.string().max(40).optional(),
  items: z.array(itemSchema).min(1).max(20),
  source: z.enum(["meal_builder", "optimizer", "conversation", "craving_makeover"]),
  createdAt: isoString,
  rationale: z.array(z.string().max(160)).max(4).optional(),
})
export type MealResultState = z.infer<typeof mealResultSchema>

export const pendingChoiceSchema = z.object({
  options: z.array(z.object({ id: idString, label: z.string().max(120) })).min(1).max(6),
  createdAt: isoString,
  expiresAt: isoString,
})
export type PendingChoiceContext = z.infer<typeof pendingChoiceSchema>

const argsSchema = z.object({
  modifier: z.enum(MODIFIERS).optional(),
  foodText: z.string().max(40).optional(),
  toText: z.string().max(40).optional(),
  fromText: z.string().max(40).optional(),
  optionIndex: z.number().int().min(1).max(6).optional(),
  nameText: z.string().max(40).optional(),
  dietary: z.string().max(20).optional(),
  factor: z.number().positive().max(4).optional(),
  demonstrative: z.boolean().optional(),
})
export type FollowUpArgs = z.infer<typeof argsSchema>

export const clarificationSchema = z.object({
  question: z.string().max(300),
  candidateReferents: z.array(referentSchema).max(6),
  expectedResponseType: z.enum(["OPTION_SELECTION", "REFERENT_SELECTION", "INTENT_CLARIFICATION"]),
  expiresAt: isoString,
  /** The ORIGINAL unresolved request, continued once the user answers. */
  pendingIntent: z.object({ intent: z.enum(FOLLOW_UP_INTENTS), args: argsSchema }).optional(),
})
export type ClarificationRequest = z.infer<typeof clarificationSchema>

export const mealModificationProposalSchema = z.object({
  sourceMealResultId: idString,
  ops: z.array(opSchema).min(1).max(6),
  /** Fingerprint of the source meal when the proposal was made: a changed meal makes the proposal stale. */
  baseKey: z.string().max(400),
  expiresAt: isoString,
})
export type PendingProposal = z.infer<typeof mealModificationProposalSchema>

export type MealModificationProposal = {
  sourceMealResultId: string
  proposedChanges: string[]
  resultingIngredients: Array<{ name: string; grams: number }>
  resultingMacros: MacroTotals
  currentMacros: MacroTotals
  rationale: string[]
  requiresConfirmation: true
  expiresAt: string
}

export const followUpStateSchema = z.object({
  context: z.object({ createdAt: isoString, lastActiveAt: isoString, turnCount: z.number().int().min(0).max(100), expiresAt: isoString }),
  meals: z.array(mealResultSchema).max(5),
  referent: referentSchema.nullable(),
  previousReferent: referentSchema.nullish(),
  candidateReferents: z.array(referentSchema).max(6),
  presentedOptions: pendingChoiceSchema.nullable(),
  clarification: clarificationSchema.nullable(),
  pendingProposal: mealModificationProposalSchema.nullable(),
  lastResolved: z.object({ intent: z.enum(FOLLOW_UP_INTENTS), args: argsSchema }).nullish(),
})
export type FollowUpState = z.infer<typeof followUpStateSchema>

export type AssistantTurnMetadata = {
  referent?: ConversationReferent
  candidateReferents?: ConversationReferent[]
  presentedOptions?: PendingChoiceContext
  suggestedAction?: { type: string; targetId?: string }
}

export type FollowUpResolution = {
  isFollowUp: boolean
  referent: ConversationReferent | null
  intent?: NutritionFollowUpIntent
  responseMode: ResponseMode
  confidence: ResolutionConfidence
}

export type StructuredBlock =
  | { type: "INGREDIENT_LIST"; mealName: string; items: Array<{ name: string; grams: number }> }
  | { type: "MACRO_SUMMARY"; mealName: string; macros: MacroTotals; confidence: string }
  | { type: "OPTION_LIST"; options: Array<{ id: string; label: string; calories: number; protein: number }> }
  | { type: "MEAL_COMPARISON"; rows: Array<{ id: string; label: string; calories: number; protein: number; carbs: number; fat: number }> }
  | { type: "MODIFICATION_PROPOSAL"; mealName: string; changes: string[]; before: MacroTotals; after: MacroTotals; expiresAt: string }
  | { type: "CLARIFICATION"; question: string; options: string[] }

export type MealResultReference = {
  id: string
  name: string
  ingredients: Array<{ foodId?: string; name: string; quantity?: number; unit?: string }>
  macros?: { calories?: number; protein?: number; carbs?: number; fat?: number }
  rationale?: string[]
  source: MealResultState["source"]
  createdAt: string
}

/** The spec'd structured result, derived so the numbers can only come from the deterministic calculator. */
export function toMealResultReference(meal: MealResultState): MealResultReference {
  const macros = totalsFor(meal.items)
  return {
    id: meal.id,
    name: meal.name,
    ingredients: meal.items.map((item) => ({ foodId: item.ingredientId, name: getIngredient(item.ingredientId)?.name ?? item.ingredientId, quantity: item.grams, unit: "g" })),
    macros,
    rationale: meal.rationale,
    source: meal.source,
    createdAt: meal.createdAt,
  }
}

/* =========================================================
   TTL — follow-up context is ephemeral, never long-term memory
========================================================= */

export const FOLLOW_UP_TURN_LIMIT = 8
export const FOLLOW_UP_IDLE_MS = 20 * 60_000
export const PROPOSAL_TTL_MS = 10 * 60_000
export const CHOICE_TTL_MS = 15 * 60_000

const after = (now: Date, ms: number) => new Date(now.getTime() + ms).toISOString()
const alive = (iso: string, now: Date) => Number.isFinite(Date.parse(iso)) && Date.parse(iso) > now.getTime()

export function isFollowUpLive(state: FollowUpState | null | undefined, now: Date): state is FollowUpState {
  return Boolean(state) && alive(state!.context.expiresAt, now) && state!.context.turnCount < FOLLOW_UP_TURN_LIMIT
}

export type StatePatch = {
  reset?: boolean
  /** A new referent was established: restarts the turn counter. */
  newReferent?: boolean
  upsertMeals?: MealResultState[]
  referent?: ConversationReferent | null
  candidateReferents?: ConversationReferent[]
  presentedOptions?: PendingChoiceContext | null
  clarification?: ClarificationRequest | null
  pendingProposal?: PendingProposal | null
  lastResolved?: FollowUpState["lastResolved"]
}

const referentId = (r: ConversationReferent | null | undefined) => (r && (r.type === "MEAL_DRAFT" || r.type === "MEAL_RESULT") ? r.id : null)

/** Pure state transition. Unspecified fields carry over from a LIVE previous state; an expired one carries nothing. */
export function nextFollowUpState(prev: FollowUpState | null | undefined, patch: StatePatch, now: Date): FollowUpState | null {
  if (patch.reset) return null
  const base = isFollowUpLive(prev, now) ? prev : null
  const meals = [...(patch.upsertMeals ?? []), ...(base?.meals ?? [])].filter((meal, index, all) => all.findIndex((o) => o.id === meal.id) === index).slice(0, 4)
  const referent = patch.referent !== undefined ? patch.referent : (base?.referent ?? null)
  const candidates = patch.candidateReferents ?? (patch.referent !== undefined ? [] : (base?.candidateReferents ?? []))
  const presentedOptions = patch.presentedOptions !== undefined ? patch.presentedOptions : (base?.presentedOptions && alive(base.presentedOptions.expiresAt, now) ? base.presentedOptions : null)
  const clarification = patch.clarification !== undefined ? patch.clarification : null // a clarification lives for exactly one answer
  const pendingProposal = patch.pendingProposal !== undefined ? patch.pendingProposal : (base?.pendingProposal && alive(base.pendingProposal.expiresAt, now) ? base.pendingProposal : null)
  const previousReferent = patch.referent !== undefined && referentId(patch.referent) !== referentId(base?.referent) ? (base?.referent ?? null) : (base?.previousReferent ?? null)
  const lastResolved = patch.lastResolved !== undefined ? patch.lastResolved : (base?.lastResolved ?? null)
  const meaningful = meals.length > 0 || referent || candidates.length > 0 || presentedOptions || clarification || pendingProposal
  if (!meaningful) return null
  const fresh = patch.newReferent || !base
  return {
    context: {
      createdAt: fresh ? now.toISOString() : base!.context.createdAt,
      lastActiveAt: now.toISOString(),
      turnCount: fresh ? 0 : base!.context.turnCount + 1,
      expiresAt: after(now, FOLLOW_UP_IDLE_MS),
    },
    meals,
    referent,
    previousReferent,
    candidateReferents: candidates,
    presentedOptions,
    clarification,
    pendingProposal,
    lastResolved,
  }
}

export const mealFromDraft = (draft: Pick<ActiveMealDraft, "id" | "name" | "family" | "ingredients" | "source" | "sessionContextSnapshot" | "notes">, rationale?: string[]): MealResultState => ({
  id: draft.id,
  name: draft.name,
  family: draft.family,
  items: draft.ingredients.map(({ ingredientId, grams }) => ({ ingredientId, grams })),
  source: draft.source === "craving_makeover" ? "craving_makeover" : draft.source === "build_next_meal" || draft.source === "choose_food" || draft.source === "suggested_for_you" ? "meal_builder" : "conversation",
  createdAt: draft.sessionContextSnapshot.capturedAt,
  ...(rationale?.length ? { rationale: rationale.slice(0, 4) } : {}),
})

export const mealKey = (items: DraftItem[]) => items.map((item) => `${item.ingredientId}:${Math.round(item.grams)}`).join("|")

export const draftReferent = (draft: { id: string; name: string }): ConversationReferent => ({ type: "MEAL_DRAFT", id: draft.id, name: draft.name })

/* =========================================================
   LANGUAGE NORMALIZATION — small, intentional vocabulary
========================================================= */

/** JS `\b` is ASCII-only, so Vietnamese tokens need explicit letter lookarounds. */
function uword(word: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${word}(?![\\p{L}\\p{N}])`, "gu")
}

const VI: Array<[RegExp, string]> = [
  [/chi tiết/g, "detailed"],
  [/nguyên liệu/g, "ingredients"],
  [/bao nhiêu/g, "how much"],
  [/tại sao|vì sao|sao lại/g, "why"],
  [/món này|cái này|bữa này/g, "this"],
  [/rẻ hơn/g, "cheaper"],
  [/(?:nhiều|thêm) (?:đạm|protein) hơn/g, "more protein"],
  [/(?:ít|giảm) (?:calo|calories|calorie) hơn/g, "less calories"],
  [/no (?:lâu )?hơn/g, "more filling"],
  [/(?:cái |món |phần )?thứ (?:nhất|1)\b|đầu tiên/g, "first one"],
  [/(?:cái |món |phần )?thứ (?:hai|2)\b/g, "second one"],
  [/(?:cái |món |phần )?thứ (?:ba|3)\b/g, "third one"],
  [/dinh dưỡng/g, "macros"],
  [/lượng calo/g, "calories"],
  [uword("calo"), "calories"],
  [uword("đạm"), "protein"],
  [uword("thay"), "replace"],
  [uword("bỏ"), "remove"],
  [uword("thêm"), "add"],
  [/ được không|\s+không\s*$|\s+đi\s*$|\s+nhé\s*$|\s+nha\s*$|\s+với\s*$/g, ""],
]

export function normalizeMessage(raw: string): string {
  let text = raw.normalize("NFC").toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, " ").trim().replace(/[\s?!.,]+$/g, "")
  for (const [pattern, to] of VI) text = text.replace(pattern, to)
  text = text.replace(/^(?:ok(?:ay)?|so|and|hey|yo|hmm+|um+|please|pls|then)[ ,]+/, "").replace(/[\s?!.,]+$/g, "").replace(/\s+/g, " ").trim()
  return text
}

/* =========================================================
   DETERMINISTIC FAST PATH
========================================================= */

const AFFIRM = /^(?:yes|yeah|yep|yup|sure|ok(?:ay)?|please|do it|go ahead|apply(?: it| that| this)?|sounds good|that works|yes please|đồng ý|ừ|được)$/
const REJECT = /^(?:no|nope|nah|cancel|reject|don'?t|not now|no thanks|keep (?:it|the original|original)|leave it|never ?mind)$/

export const isAccept = (t: string) => AFFIRM.test(t)
export const isReject = (t: string) => REJECT.test(t)

const INGREDIENTS = /^(?:(?:show|give|tell) me )?(?:the |its )?(?:(?:detailed|full|complete|exact) )?(?:ingredients?(?: list)?|what(?:'s| is) in (?:it|this|that|the (?:meal|bowl))|what(?:'s| is) inside(?: it)?|what goes in (?:it|this))(?: list)?(?: please)?$/
const MACROS = /^(?:(?:show|give|tell) me )?(?:the |its )?(?:(?:detailed|full) )?(?:macros?|macro breakdown|nutrition(?: facts| info)?|calories|kcal|protein|carbs?|fat|how many (?:calories|kcal)(?: (?:is|are) (?:in )?(?:it|this|that))?|how much (?:protein|carbs?|fat)(?: (?:is|are) (?:in )?(?:it|this|that))?|what(?:'s| are| is) (?:the |its )?(?:macros?|calories|protein))(?: please)?$/
const PORTIONS = /^(?:how much|how many (?:grams|g) of|what(?:'s| is) the (?:portion|amount|quantity) of|portion of) ([a-z]+(?: [a-z]+){0,1})(?: (?:is|are) (?:there|in (?:it|this|that)))?(?: in (?:it|this|that))?$/
const NOT_A_PORTION_FOOD = /\b(?:should|per|day|week|do|did|can|i|eat|need|have|get|daily|each|every|meal|a|the|my|to|of|usually|normally|is|are|it|this|that)\b/
const PORTIONS_ALL = /^(?:portions?|portion sizes?|how much of (?:each|everything)|amounts?|quantities)$/
const SAUCE = /^(?:what|which) (?:sauce|seasoning|dressing|flavou?ring)(?: (?:is|are) (?:in|with) (?:it|this))?$/
const WHY = /^(?:why(?: (?:this|that|it))?(?: one| meal| bowl| pick| choice)?|why (?:did you|do you|would you) (?:pick|choose|suggest|recommend|give me) (?:this|that|it)(?: one)?|(?:explain|justify) (?:this|that|it|your (?:pick|choice))|what makes (?:this|it) good)$/
const ORDINALS: Record<string, number> = { first: 1, "1st": 1, one: 1, second: 2, "2nd": 2, two: 2, third: 3, "3rd": 3, three: 3, fourth: 4, "4th": 4, four: 4 }
const SELECT_ORD = /^(?:(?:i(?:'ll| will)? )?(?:take|want|pick|choose|go with|prefer|let'?s (?:do|go with|take))\s+)?(?:the )?(first|second|third|fourth|1st|2nd|3rd|4th)(?: one| option| meal| choice)?(?: please)?$/
const SELECT_NUM = /^(?:(?:i(?:'ll| will)? )?(?:take|want|pick|choose|go with)\s+)?(?:option|number|no\.?|#|choice) ?([1-4])(?: please)?$|^([1-4])$/
const SELECT_NAME = /^(?:(?:i(?:'ll| will)? )?(?:take|want|pick|choose|go with)\s+)?(?:the )?([a-z][a-z &-]{1,24}?) (?:one|option|meal|bowl|plate)$/
const DEMONSTRATIVE = /^(?:i(?:'ll| will)? (?:take|want|pick|choose|go with) )?(?:that|this|the) one$|^(?:that|this) (?:one|meal|bowl|option)$/
const COMPARE = /^(?:compare(?: them| these| those| both| the options| the meals)?|which (?:one )?is (?:better|healthier|higher in protein|lighter)|what(?:'s| is) the difference)$/

const MODIFY: Array<[RegExp, Modifier]> = [
  [/^(?:(?:can|could) (?:i|we|you) (?:get |have |do )?)?(?:something |a |an )?(?:bit |little |slightly )?(?:cheaper|less expensive|more affordable|budget(?:[- ]friendly)?)(?: version| option| one| meal)?$/, "cheaper"],
  [/^(?:something |a |an )?(?:more|extra|higher|bit more|little more) protein(?: version| option)?$|^(?:higher|more)[- ]protein(?: version| option)?$/, "more_protein"],
  [/^(?:something |a |an )?(?:less|fewer|lower) (?:calories|kcal|cals)(?: version| option)?$|^(?:something |a )?(?:lighter|light)(?: version| option| one)?$|^(?:would )?something lighter(?: make more sense| be better)?$/, "lower_calories"],
  [/^(?:something |a |an )?(?:more filling|fill(?:ing)?er|more satisfying|bulkier)(?: version| option)?$/, "more_filling"],
  [/^(?:something |a |an )?(?:faster|quicker)(?: version| option)?$/, "faster"],
  [/^(?:something |a |an )?(?:tastier|more flavou?rful|more flavou?r)(?: version| option)?$/, "tastier"],
]

const SUBST_INSTEAD = /^(?:(?:can|could|may) (?:i|we) )?(?:use|try|swap in|put|do|have) ([a-z][a-z ]{1,28}?) instead(?: of (?:the )?([a-z][a-z ]{1,28}))?$/
const SUBST_REPLACE = /^(?:(?:can|could) (?:i|we) )?(?:replace|substitute|swap)(?: the)? ([a-z][a-z ]{1,28}?)(?: (?:with|for|by) ([a-z][a-z ]{1,28}))?$/
const ADD = /^(?:(?:can|could) (?:i|we) )?add(?: some| a| an| more| extra)? ([a-z][a-z ]{1,28}?)(?: (?:to|in|into) (?:it|this|that|the (?:meal|bowl)))?$/
const REMOVE = /^(?:(?:can|could) (?:i|we) )?(?:remove|drop|skip|take out|without)(?: the)? ([a-z][a-z ]{1,28}?)(?: (?:from|in) (?:it|this|that))?$/
const ADJUST = /^(more|less|extra|double|halve|half|triple|fewer|lots more|a bit more|a bit less)(?: of)?(?: the)? ([a-z][a-z ]{1,28})$/
const DIETARY = /^(?:(?:can|could) (?:i|we) )?(?:make (?:it|this|that) )?(dairy|gluten|egg|soy|fish|lactose|nut)[- ]free$/

const UNDO = /^(?:undo(?: that| this| it| the (?:last )?(?:change|proposal))?|go back|revert(?: that| it)?|take that back)$/
const ORIGINAL = /^(?:(?:actually,? )?(?:keep|go back to|revert to|restore) the (?:original|first|old)(?: one| version| meal)?|back to (?:the )?original|original (?:one|version))$/
const CORRECT_MEANT = /^(?:no,? ?)?(?:i meant|i mean|i was talking about|i was asking about|meant|the one i meant is)(?: the)? ([a-z][a-z &-]{1,30}?)(?: one| meal)?$/
const CORRECT_NOT = /^(?:no,? ?)?not (?:that|this) one(?:,? (?:the )?([a-z][a-z &-]{1,24}?)(?: one| meal)?)?$|^(?:no,? )?(?:the )?([a-z][a-z &-]{1,24}?) (?:one|bowl|plate|meal),? (?:not (?:that|this)(?: one)?)$|^wrong one$/

type Fast = { intent: NutritionFollowUpIntent; args: FollowUpArgs }
const fast = (intent: NutritionFollowUpIntent, args: FollowUpArgs = {}): Fast => ({ intent, args })

const MACRO_WORDS = new Set(["protein", "carbs", "carb", "fat", "calories", "kcal", "macros", "macro"])

/** Maps a normalized short message to a canonical follow-up intent. Anchored patterns only: a miss means "not a short follow-up". */
export function classifyFollowUp(t: string): Fast | null {
  if (!t || t.length > 90) return null
  if (UNDO.test(t)) return fast("UNDO_LAST_PROPOSAL")
  if (ORIGINAL.test(t)) return fast("REVERT_TO_ORIGINAL")
  const meant = t.match(CORRECT_MEANT)
  if (meant) return fast("CORRECT_PREVIOUS_RESOLUTION", { nameText: meant[1].trim() })
  const not = t.match(CORRECT_NOT)
  if (not) return fast("CORRECT_PREVIOUS_RESOLUTION", { nameText: (not[1] ?? not[2])?.trim() })
  if (INGREDIENTS.test(t)) return fast("SHOW_INGREDIENTS")
  if (MACROS.test(t)) return fast("SHOW_MACROS", { foodText: t.match(/protein|carbs?|fat|calories|kcal/)?.[0] })
  if (PORTIONS_ALL.test(t)) return fast("SHOW_PORTIONS")
  if (SAUCE.test(t)) return fast("SHOW_PORTIONS", { foodText: "sauce" })
  const portion = t.match(PORTIONS)
  if (portion && !MACRO_WORDS.has(portion[1].trim()) && !NOT_A_PORTION_FOOD.test(portion[1])) return fast("SHOW_PORTIONS", { foodText: portion[1].trim() })
  if (WHY.test(t)) return fast("EXPLAIN_RECOMMENDATION")
  if (COMPARE.test(t)) return fast("COMPARE_PREVIOUS_OPTIONS")
  const ord = t.match(SELECT_ORD)
  if (ord) return fast("SELECT_PREVIOUS_OPTION", { optionIndex: ORDINALS[ord[1]] })
  const num = t.match(SELECT_NUM)
  if (num) return fast("SELECT_PREVIOUS_OPTION", { optionIndex: Number(num[1] ?? num[2]) })
  if (DEMONSTRATIVE.test(t)) return fast("SELECT_PREVIOUS_OPTION", { demonstrative: true })
  for (const [pattern, modifier] of MODIFY) if (pattern.test(t)) return fast("MODIFY_PREVIOUS_RESULT", { modifier })
  const dietary = t.match(DIETARY)
  if (dietary) return fast("APPLY_DIETARY_CONSTRAINT", { dietary: dietary[1] })
  const instead = t.match(SUBST_INSTEAD)
  if (instead) return fast("SUBSTITUTE_IN_PREVIOUS_RESULT", { toText: instead[1].trim(), fromText: instead[2]?.trim() })
  const replace = t.match(SUBST_REPLACE)
  if (replace) return fast("SUBSTITUTE_IN_PREVIOUS_RESULT", replace[2] ? { fromText: replace[1].trim(), toText: replace[2].trim() } : { foodText: replace[1].trim() })
  const adjust = t.match(ADJUST)
  if (adjust && findIngredientByText(adjust[2].trim())) {
    const factor = ({ more: 1.25, extra: 1.25, "a bit more": 1.15, "lots more": 1.5, less: 0.75, fewer: 0.75, "a bit less": 0.85, double: 2, halve: 0.5, half: 0.5, triple: 3 } as Record<string, number>)[adjust[1]]
    return fast("ADJUST_QUANTITY", { foodText: adjust[2].trim(), factor })
  }
  const add = t.match(ADD)
  if (add && findIngredientByText(add[1].trim())) return fast("ADD_INGREDIENT", { foodText: add[1].trim() })
  // A food we can't resolve must still reach the safety gate ("add peanuts"), so "add X" is claimed regardless.
  if (add && /^[a-z]+(?: [a-z]+){0,2}$/.test(add[1].trim()) && !/\b(?:me|us|you|my|to|the|it|that|this|them)\b/.test(add[1])) return fast("ADD_INGREDIENT", { foodText: add[1].trim() })
  const remove = t.match(REMOVE)
  if (remove && findIngredientByText(remove[1].trim())) return fast("REMOVE_INGREDIENT", { foodText: remove[1].trim() })
  const name = t.match(SELECT_NAME)
  if (name) return fast("SELECT_PREVIOUS_OPTION", { nameText: name[1].trim() })
  return null
}

/* =========================================================
   NEW-TOPIC DETECTION — layer 1 (explicit, deterministic)
========================================================= */

const NEW_TOPIC_WANT = /^(?:actually|wait|hold on|hmm+|ok(?:ay)?|no|nah)[ ,]+(?:i )?(?:want|feel like|'?d (?:like|rather have)|am craving|crave)\s+(.+)$|^(?:i )?(?:'?d rather (?:have|eat)|feel like|how about|what about|let'?s (?:have|do|try|eat)|can we (?:do|try|have)|i changed my mind[, ]+(?:i )?want)\s+(.+)$/
const NEW_TOPIC_PHRASE = /\b(?:forget (?:that|it|this)|different meal|something (?:else|different)|change of plans|changed my mind|let'?s do something else|try something (?:else|different|new)|not feeling (?:that|this|it)|something new)\b/
const NOT_A_FOOD_HINT = /^(?:(?:the |its )?(?:macros?|ingredients?|calories|protein|carbs|fat|nutrition|portions?)\b|cheaper\b|lighter\b|tastier\b|faster\b|quicker\b|healthier\b|spicier\b|sweeter\b|saltier\b|\w+ing\b|to\b|it\b|this\b|that\b|more\b|less\b|some(?:thing)?\b|any(?:thing)?\b|a (?:bit|little|lot)\b|extra\b|fewer\b|the (?:same|original|first|second|third|other)\b|another\b|one\b|lots\b)/

export type NewTopic = { hint?: string; food?: string }

/** Explicit "switch topics" signals. Modification-shaped phrases ("I want more protein") are NOT new topics. */
export function detectExplicitNewTopic(raw: string): NewTopic | null {
  const t = raw.normalize("NFC").toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, " ").trim().replace(/[.!?]+$/g, "")
  const want = t.match(NEW_TOPIC_WANT)
  if (want) {
    const hint = (want[1] ?? want[2]).trim()
    if (NOT_A_FOOD_HINT.test(hint)) return /^(?:something|anything)\b/.test(hint) ? { hint } : null
    if (/\b(?:cheaper|more|less|lighter|fewer|protein|calories)\b/.test(hint) && hint.split(" ").length > 2) return null
    const food = hint.replace(/^(?:a|an|some|the|to eat|to have)\s+/, "").replace(/\s+(?:instead|today|tonight|now|then)$/, "").trim()
    return { hint, ...(food && food.split(" ").length <= 4 ? { food } : {}) }
  }
  if (NEW_TOPIC_PHRASE.test(t)) return { hint: t.length <= 60 ? t : undefined }
  return null
}

/* =========================================================
   REFERENCE RESOLUTION
========================================================= */

/** Words every meal name shares: they identify nothing, so "the chicken bowl" matches "Chicken & Rice Plate". */
const NAME_GENERIC = new Set(["bowl", "plate", "dish", "high", "protein", "meal", "lunch", "dinner", "breakfast"])
const NAME_STOP = new Set(["the", "a", "an", "one", "this", "that", "meal", "option", "i", "meant", "mean", "no", "not", "my", "please", "and", "with"])
const stem = (word: string) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word)
const words = (text: string) => text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(" ").filter(Boolean)

/** Meals whose name (or ingredient list) contains every content word the user typed. Never guesses between several. */
export function matchMeals(nameText: string, meals: MealResultState[]): MealResultState[] {
  const wanted = words(nameText).filter((word) => !NAME_STOP.has(word) && !NAME_GENERIC.has(word) && word.length >= 3).map(stem)
  if (wanted.length === 0) return []
  return meals.filter((meal) => {
    const pool = new Set([...words(meal.name), ...meal.items.flatMap((item) => words(getIngredient(item.ingredientId)?.shortName ?? ""))].map(stem))
    return wanted.every((word) => pool.has(word))
  })
}

export type TargetResolution =
  | { kind: "meal"; meal: MealResultState; referent: ConversationReferent; confidence: ResolutionConfidence; via: "explicit" | "option" | "clarification" | "last_referent" | "topic" | "candidate" }
  | { kind: "clarify"; candidates: MealResultState[]; reason: "ambiguous" | "unanchored_draft" | "no_context" | "not_found" }

export type TurnInput = {
  message: string
  state: FollowUpState | null | undefined
  activeDraft: MealResultState | null
  /** The user's current conversation topic type, echoed from the previous reply. */
  topicType: string | null
  now: Date
  /** True when the legacy N1.5 draft-edit parser will deterministically handle this message: the fast path steps aside. */
  legacyHandles?: boolean
}

export const referentFor = (meal: MealResultState, activeId: string | undefined): ConversationReferent => ({ type: meal.id === activeId ? "MEAL_DRAFT" : "MEAL_RESULT", id: meal.id, name: meal.name })

export function knownMeals(state: FollowUpState | null, activeDraft: MealResultState | null): MealResultState[] {
  const fromState = state?.meals ?? []
  return activeDraft ? [activeDraft, ...fromState.filter((meal) => meal.id !== activeDraft.id)] : fromState
}

const mealOfReferent = (referent: ConversationReferent | null | undefined, meals: MealResultState[]) => {
  const id = referentId(referent)
  return id ? meals.find((meal) => meal.id === id) : undefined
}

/** Canonical priority: explicit reference > resolved clarification > last assistant referent > current topic > active draft (only via clarification). */
export function resolveTarget(t: string, fast: Fast, input: TurnInput, live: FollowUpState | null): TargetResolution {
  const meals = knownMeals(live, input.activeDraft)
  const activeId = input.activeDraft?.id
  const asMeal = (meal: MealResultState, confidence: ResolutionConfidence, via: Extract<TargetResolution, { kind: "meal" }>["via"]): TargetResolution => ({ kind: "meal", meal, referent: referentFor(meal, activeId), confidence, via })

  // 1. Explicit reference in the CURRENT message ("the chicken bowl", "option 2", "the tuna one").
  if (fast.args.optionIndex && live?.presentedOptions && alive(live.presentedOptions.expiresAt, input.now)) {
    const option = live.presentedOptions.options[fast.args.optionIndex - 1]
    const meal = option && meals.find((m) => m.id === option.id)
    if (meal) return asMeal(meal, "HIGH", "option")
  }
  const nameText = fast.args.nameText ?? fast.args.foodText
  if (fast.args.nameText || fast.intent === "CORRECT_PREVIOUS_RESOLUTION") {
    const found = nameText ? matchMeals(nameText, meals) : []
    if (found.length === 1) return asMeal(found[0], "HIGH", "explicit")
    if (found.length > 1) return { kind: "clarify", candidates: found, reason: "ambiguous" }
    if (fast.args.nameText) return { kind: "clarify", candidates: meals, reason: "not_found" }
  }

  // 2/3. Last assistant referent.
  const last = mealOfReferent(live?.referent, meals)
  if (last && !fast.args.nameText) return asMeal(last, "HIGH", "last_referent")

  // Several unresolved candidates are never auto-resolved.
  const candidates = (live?.candidateReferents ?? []).map((r) => mealOfReferent(r, meals)).filter((m): m is MealResultState => Boolean(m))
  if (candidates.length > 1) return { kind: "clarify", candidates, reason: "ambiguous" }
  if (candidates.length === 1) return asMeal(candidates[0], "MEDIUM", "candidate")

  // 4. Current topic is the meal.
  if (input.activeDraft && input.topicType === "MEAL") return asMeal(input.activeDraft, "MEDIUM", "topic")

  // 5. The Active Draft never wins merely because it exists: ask.
  if (input.activeDraft) return { kind: "clarify", candidates: [input.activeDraft], reason: "unanchored_draft" }
  return { kind: "clarify", candidates: [], reason: "no_context" }
}

export type TurnResolution =
  | { kind: "none" }
  | { kind: "new_topic"; topic: NewTopic }
  | { kind: "proposal_decision"; accept: boolean; proposal: PendingProposal; stale: boolean }
  | { kind: "follow_up"; resolution: FollowUpResolution; intent: NutritionFollowUpIntent; args: FollowUpArgs; target: TargetResolution; viaClarification: boolean }

export const MODE_BY_INTENT: Record<NutritionFollowUpIntent, ResponseMode> = {
  SHOW_INGREDIENTS: "READ_ONLY", SHOW_MACROS: "READ_ONLY", SHOW_PORTIONS: "READ_ONLY", EXPLAIN_RECOMMENDATION: "EXPLAIN",
  SELECT_PREVIOUS_OPTION: "READ_ONLY", COMPARE_PREVIOUS_OPTIONS: "READ_ONLY",
  MODIFY_PREVIOUS_RESULT: "PROPOSE_MODIFICATION", SUBSTITUTE_IN_PREVIOUS_RESULT: "PROPOSE_MODIFICATION", ADD_INGREDIENT: "PROPOSE_MODIFICATION",
  REMOVE_INGREDIENT: "PROPOSE_MODIFICATION", ADJUST_QUANTITY: "PROPOSE_MODIFICATION", APPLY_DIETARY_CONSTRAINT: "PROPOSE_MODIFICATION",
  CORRECT_PREVIOUS_RESOLUTION: "READ_ONLY", UNDO_LAST_PROPOSAL: "READ_ONLY", REVERT_TO_ORIGINAL: "READ_ONLY", CONTINUE_CURRENT_TOPIC: "EXPLAIN",
}

/** Intents that act on the conversation, not on a particular meal: they need no meal target. */
const TARGETLESS = new Set<NutritionFollowUpIntent>(["UNDO_LAST_PROPOSAL", "REVERT_TO_ORIGINAL"])
/** Bare nutrient words ("protein?") are only claimed when a meal is genuinely in view, so general questions keep their old path. */
const NEEDS_ANCHOR = new Set<NutritionFollowUpIntent>(["SHOW_MACROS", "SHOW_PORTIONS", "SELECT_PREVIOUS_OPTION", "ADD_INGREDIENT", "REMOVE_INGREDIENT", "ADJUST_QUANTITY", "SUBSTITUTE_IN_PREVIOUS_RESULT", "MODIFY_PREVIOUS_RESULT", "APPLY_DIETARY_CONSTRAINT"])

const resolutionFor = (intent: NutritionFollowUpIntent, target: TargetResolution, mode?: ResponseMode): FollowUpResolution => ({
  isFollowUp: true,
  referent: target.kind === "meal" ? target.referent : null,
  intent,
  responseMode: target.kind === "clarify" ? "CLARIFY" : (mode ?? MODE_BY_INTENT[intent]),
  confidence: target.kind === "meal" ? target.confidence : "LOW",
})

/**
 * Steps 2-6 of the N1.5.6 pipeline (the safety pre-gate has already run):
 * proposal decision -> explicit new topic -> clarification continuation ->
 * follow-up classification -> reference resolution.
 */
export function resolveTurn(input: TurnInput): TurnResolution {
  const t = normalizeMessage(input.message)
  const state = input.state ?? null
  const live = isFollowUpLive(state, input.now) ? state : null

  // A visible proposal awaiting an answer takes the next yes/no.
  if (state?.pendingProposal && (isAccept(t) || isReject(t))) {
    const fresh = alive(state.pendingProposal.expiresAt, input.now) && Boolean(live)
    return { kind: "proposal_decision", accept: isAccept(t), proposal: state.pendingProposal, stale: !fresh }
  }

  const meals = knownMeals(live, input.activeDraft)
  const fastHit = input.legacyHandles ? null : classifyFollowUp(t)

  // A correction is its own thing even when it begins with "actually".
  if (!(fastHit?.intent === "REVERT_TO_ORIGINAL" || fastHit?.intent === "CORRECT_PREVIOUS_RESOLUTION")) {
    const topic = detectExplicitNewTopic(input.message)
    if (topic) return { kind: "new_topic", topic }
  }

  // Clarification continuation: answer the ORIGINAL question, not a fresh one.
  if (live?.clarification && alive(live.clarification.expiresAt, input.now)) {
    const picked = pickFromClarification(t, live.clarification, meals)
    if (picked && live.clarification.pendingIntent) {
      const { intent, args } = live.clarification.pendingIntent
      const target: TargetResolution = { kind: "meal", meal: picked, referent: referentFor(picked, input.activeDraft?.id), confidence: "HIGH", via: "clarification" }
      return { kind: "follow_up", resolution: resolutionFor(intent, target), intent, args, target, viaClarification: true }
    }
  }

  if (!fastHit) return { kind: "none" }
  const { intent, args } = fastHit
  if (TARGETLESS.has(intent)) {
    const target: TargetResolution = { kind: "clarify", candidates: [], reason: "no_context" }
    return { kind: "follow_up", resolution: { isFollowUp: true, referent: live?.referent ?? null, intent, responseMode: MODE_BY_INTENT[intent], confidence: "HIGH" }, intent, args, target, viaClarification: false }
  }
  if (intent === "COMPARE_PREVIOUS_OPTIONS" || intent === "SELECT_PREVIOUS_OPTION") {
    const hasOptions = Boolean(live?.presentedOptions && alive(live.presentedOptions.expiresAt, input.now))
    const hasCandidates = (live?.candidateReferents.length ?? 0) > 0
    const nameMatches = args.nameText ? matchMeals(args.nameText, meals).length > 0 : false
    // Without a presented choice, "second one" / "the X one" isn't a follow-up we can honour.
    if (!hasOptions && !hasCandidates && !nameMatches && !(args.demonstrative && live?.referent)) return { kind: "none" }
  }
  if (intent === "COMPARE_PREVIOUS_OPTIONS") {
    const target: TargetResolution = { kind: "clarify", candidates: [], reason: "no_context" }
    return { kind: "follow_up", resolution: { isFollowUp: true, referent: null, intent, responseMode: "READ_ONLY", confidence: "HIGH" }, intent, args, target, viaClarification: false }
  }

  let target = resolveTarget(t, fastHit, input, live)
  if (target.kind === "clarify" && target.reason === "no_context" && NEEDS_ANCHOR.has(intent) && !state) return { kind: "none" }
  if (target.kind === "clarify" && target.reason === "unanchored_draft" && intent === "SELECT_PREVIOUS_OPTION") return { kind: "none" }
  // "that one" with a single strong referent is that referent; with several candidates resolveTarget already asked.
  if (intent === "SELECT_PREVIOUS_OPTION" && args.demonstrative && target.kind !== "meal" && target.reason === "no_context") target = { kind: "clarify", candidates: [], reason: "no_context" }
  return { kind: "follow_up", resolution: resolutionFor(intent, target), intent, args, target, viaClarification: false }
}

function pickFromClarification(t: string, clarification: ClarificationRequest, meals: MealResultState[]): MealResultState | null {
  const candidates = clarification.candidateReferents.map((r) => mealOfReferent(r, meals)).filter((m): m is MealResultState => Boolean(m))
  if (candidates.length === 0) return null
  if (candidates.length === 1 && isAccept(t)) return candidates[0]
  const ord = t.match(SELECT_ORD) ?? undefined
  const num = t.match(SELECT_NUM) ?? undefined
  const index = ord ? ORDINALS[ord[1]] : num ? Number(num[1] ?? num[2]) : undefined
  if (index && candidates[index - 1]) return candidates[index - 1]
  const name = t.match(SELECT_NAME)?.[1] ?? t.replace(/^(?:the|i meant|i mean|no,?)\s+/g, "")
  const found = matchMeals(name, candidates)
  return found.length === 1 ? found[0] : null
}
