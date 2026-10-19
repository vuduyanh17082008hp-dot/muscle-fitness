import { z } from "zod"

import { detectCravingKey } from "./craving"
import type { DraftOp } from "./draft"
import { followUpStateSchema } from "./followup"
import { findIngredientByText, getIngredient } from "./ingredients"
import type { ActiveMealDraft, CravingKey } from "./types"

/**
 * Nutrition Coach conversation layer (N1.5) — pure, no Supabase, no LLM.
 *
 * "The conversation layer decides when the meal engine is needed. The meal
 * engine never decides what the conversation means." The Active Meal Draft is
 * CONTEXT: it is the target of a message only when reference resolution finds
 * evidence for it, never by default.
 *
 * Safety priority (unchanged, N1.6 retrieval slots in at 6):
 *   1 allergies/exclusions/safety  2 current message  3 Athlete State
 *   4 explicit preferences  5 conversation state  6 retrieved knowledge  7 model prior
 * Nothing in this file can relax 1 — allergy/exclusion checks live in the
 * engine (ingredients.ts / optimizer.ts) and run on every draft it builds.
 */

export const NUTRITION_INTENTS = [
  "NEW_MEAL_REQUEST",
  "NEW_CRAVING_REQUEST",
  "EDIT_ACTIVE_DRAFT",
  "GENERAL_NUTRITION_QUESTION",
  "FOOD_SUBSTITUTION",
  "MACRO_CALCULATION",
  "LOG_MEAL",
  "PREFERENCE_UPDATE",
  "RESET_CONTEXT",
] as const
export type NutritionIntent = (typeof NUTRITION_INTENTS)[number]

export const SENSORY_TARGETS = ["sweet", "salty", "crunchy", "creamy", "chocolate", "cold", "filling"] as const
export type SensoryTarget = (typeof SENSORY_TARGETS)[number]

export type TopicType = "MEAL" | "CRAVING" | "FOOD" | "GENERAL_NUTRITION"

export type NutritionTopic = {
  type: TopicType
  food?: string
  brand?: string
  sensoryTargets?: SensoryTarget[]
}

export type PreferenceSignal = {
  kind: "DISLIKE" | "LIKE" | "PREFERRED_TEXTURE" | "CRAVING_PATTERN"
  value: string
  /** EXPLICIT = the user said it. INFERRED stays weak and is never persisted in N1.5. */
  strength: "EXPLICIT" | "INFERRED"
  /** N1.5 keeps every signal in-session; nothing here is written to a table. */
  scope: "SESSION"
  context?: string
}

export type ToolCallSummary = { name: "meal_optimizer" | "macro_calculator" | "draft_editor" | "cravings_engine"; ok: boolean }

/** Ops the assistant can offer in a question ("Want me to make this cheaper?") and a bare "yes" can accept. */
const OFFERABLE_OPS = ["cheaper", "tastier", "more_protein", "lower_calories", "more_filling", "faster"] as const
type OfferableOp = (typeof OFFERABLE_OPS)[number]

export type NutritionConversationState = {
  activeMealDraft?: ActiveMealDraft
  lastIntent?: NutritionIntent
  currentTopic?: NutritionTopic
  pendingMealBuild?: { topic: string; approach?: string }
  /**
   * Set only when the IMMEDIATELY preceding assistant turn asked how to
   * modify the active draft. The server recomputes it on every turn, so it
   * lives for exactly one user turn.
   */
  handoff?: { offer: OfferableOp | null }
  recentMessages: Array<{ role: "user" | "coach"; text: string }>
}

const topicSchema = z.object({
  type: z.enum(["MEAL", "CRAVING", "FOOD", "GENERAL_NUTRITION"]),
  food: z.string().max(80).optional(),
  brand: z.string().max(80).optional(),
  sensoryTargets: z.array(z.enum(SENSORY_TARGETS)).max(7).optional(),
})

/** N1.6.4-P2R: the options the last reply actually showed. A client-echoed claim: malformed => ignored (never a 400), valid => re-validated against the conversation before use. */
const presentedSnapshotSchema = z.object({
  responseId: z.string().max(40),
  owner: z.enum(["ENGINE", "CONVERSATION"]),
  options: z.array(z.object({ index: z.number().int().min(1).max(5), entityId: z.string().max(100), label: z.string().max(200), sourceRef: z.string().max(80), provenance: z.literal("ASSISTANT_DISPLAYED_OPTION") })).min(2).max(5),
  createdAtServer: z.string().max(40),
  expiresAt: z.string().max(40),
})
/** N1.6.4-P2R: the blocking question the last reply asked and the request its answer resumes. Lives for exactly one answer. */
const pendingClarificationSchema = z.object({
  questionType: z.enum(["safety", "calculation", "option", "action", "none"]),
  requestedField: z.enum(["calorieTarget", "quantity", "referent", "slot", "other"]),
  question: z.string().max(300),
  resumeIntent: z.string().max(200),
  resumeTaskRef: z.enum(["remaining_calories", "request"]),
  createdAtServer: z.string().max(40),
  expiresAt: z.string().max(40),
})

/** What the client echoes back each turn (the draft itself travels as `activeDraft`). */
export const conversationInputSchema = z.object({
  lastIntent: z.enum(NUTRITION_INTENTS).optional(),
  currentTopic: topicSchema.nullish(),
  pendingMealBuild: z.object({ topic: z.string().max(80), approach: z.string().max(40).optional() }).nullish(),
  handoff: z.object({ offer: z.enum(OFFERABLE_OPS).nullable() }).nullish(),
  recentMessages: z.array(z.object({ role: z.enum(["user", "coach"]), text: z.string().max(800) })).max(6).optional(),
  /** H0 cluster A: the user's own earlier messages (newest last) for the context working set only — disclosures outlive the 6-message window. */
  priorUserTurns: z.array(z.string().max(400)).max(20).optional().catch(undefined),
  /** N1.5.6 ephemeral follow-up context (TTL-bound, server-validated, macros always recomputed). */
  followUp: followUpStateSchema.nullish(),
  signals: z.array(z.object({ kind: z.enum(["DISLIKE", "LIKE", "PREFERRED_TEXTURE", "CRAVING_PATTERN"]), value: z.string().max(60), strength: z.enum(["EXPLICIT", "INFERRED"]), scope: z.literal("SESSION"), context: z.string().max(40).optional() })).max(10).optional(),
  /** N1.6.4: the user's own durable constraints for THIS conversation ("low_prep", "without:x"...). Session-scoped, shape-validated, never persisted. */
  constraints: z.array(z.string().max(60)).max(10).optional(),
  /** N1.6.4: the coach's own written options own the conversation until the engine produces a new meal. `item` = the option the user picked. */
  focus: z.object({ owner: z.literal("CONVERSATION"), item: z.string().max(160).nullable() }).nullish(),
  /** N1.6.4-P2R: undefined = a client that predates the snapshot (legacy ownership heuristic); null = nothing selectable is displayed. */
  presented: presentedSnapshotSchema.nullable().optional().catch(undefined),
  pending: pendingClarificationSchema.nullish().catch(undefined),
  /** The food the last tool run resolved. Identity + basis only: a follow-up ("150 g of that") re-resolves it server-side, so no echoed number is ever used. */
  foodReference: z.object({ canonicalName: z.string().max(160), provider: z.enum(["LOCAL_CANONICAL", "USDA_FDC"]), sourceId: z.string().max(80), basis: z.enum(["raw", "cooked", "prepared", "packaged", "unknown"]), base: z.string().max(60) }).nullish().catch(undefined),
})
export type ConversationInput = z.infer<typeof conversationInputSchema>

/* =========================================================
   REFERENCE RESOLUTION
========================================================= */

const EDIT_WORDS = /\b(make|get|bring|keep|cut|trim|scale|swap|switch|replace|change|remove|reduce|lower|increase|decrease|add|drop|skip|double|halve|less|more|extra|tweak|adjust|modify|improve|update|under|below)\b|\b(cheaper|tastier|sweeter|saltier|spicier|lighter|quicker|faster)\b/i
/** "this/that + meal noun", "the active meal/draft", "the draft" — never a bare "this". */
const EXPLICIT_DRAFT_REF = /\b(?:this|that)\s+(?:\w+\s+)?(?:meal|bowl|recipe|dish|plate|draft|smoothie|shake)\b|\b(?:the\s+)?(?:active|current)\s+(?:meal\s+)?(?:draft|meal)\b|\bthe\s+draft\b/i
/** An edit verb bound directly to a pronoun: "make it …", "add more protein to this". */
const PRONOUN_EDIT = /\b(?:make|get|keep|bring|turn|cut|trim|scale)\s+(?:this|it|that)\b|\b(?:add|more|less|extra)\b[^.?!]*\b(?:to|in|on)\s+(?:this|it)\s*[.!?]*$/i
const AFFIRMATION = /^\s*(?:yes|yeah|yep|yup|sure|ok(?:ay)?|please|do it|go ahead|go for it|sounds good|let'?s do it|that works)\W*$/i

export function isAffirmation(message: string): boolean {
  return AFFIRMATION.test(message)
}

export type DraftReference = {
  bound: boolean
  /** The message uses an explicit "this meal / the draft" noun phrase (even if no draft exists). */
  explicit: boolean
  via: "explicit" | "ingredient" | "pronoun" | "handoff" | "none"
}

function mentionsDraftIngredient(lower: string, draft: ActiveMealDraft): boolean {
  return draft.ingredients.some((item) => {
    const tokens = getIngredient(item.ingredientId)?.shortName.toLowerCase().split(/[^a-z]+/) ?? []
    return tokens.some((token) => token.length >= 3 && new RegExp(`\\b${token}\\b`).test(lower))
  })
}

/**
 * Decides whether a message is directed at the Active Meal Draft. Requires
 * semantic evidence (meal reference + edit intent), not a stray "this".
 */
export function resolveDraftReference(message: string, draft: ActiveMealDraft | null, handoff: ConversationInput["handoff"]): DraftReference {
  const explicit = EXPLICIT_DRAFT_REF.test(message)
  const none: DraftReference = { bound: false, explicit, via: "none" }
  if (!draft) return none
  const lower = message.toLowerCase()
  const isEdit = EDIT_WORDS.test(lower)

  if (explicit && isEdit) return { bound: true, explicit, via: "explicit" }
  if (PRONOUN_EDIT.test(message)) return { bound: true, explicit, via: "pronoun" }
  if (isEdit && mentionsDraftIngredient(lower, draft)) return { bound: true, explicit, via: "ingredient" }
  // One-turn handoff: the previous assistant turn asked how to modify the draft.
  if (handoff && (isAffirmation(message) || isEdit)) return { bound: true, explicit, via: "handoff" }
  return none
}

/** Resolves a bare "yes" against a one-turn offer such as "Want me to make this cheaper?". */
export function acceptedOffer(message: string, handoff: ConversationInput["handoff"]): DraftOp | null {
  return handoff?.offer && isAffirmation(message) ? ({ type: handoff.offer } as DraftOp) : null
}

const OFFER_OPS: Array<[RegExp, OfferableOp]> = [
  [/cheaper|less expensive/, "cheaper"],
  [/tastier|sweeter|better tasting/, "tastier"],
  [/lighter|fewer calories|lower in calories/, "lower_calories"],
  [/more filling|filling/, "more_filling"],
  [/higher[- ]protein|more protein/, "more_protein"],
  [/quicker|faster/, "faster"],
]

/**
 * Looks at the assistant's own reply: if it ends by asking how to modify the
 * active draft, the next user turn (and only that one) may address the draft
 * without naming it. Returns null otherwise, so the handoff always expires.
 */
export function detectDraftEditOffer(reply: string, hasDraft: boolean): ConversationInput["handoff"] {
  if (!hasDraft) return null
  const question = reply.trim().match(/[^.!?]*\?\s*$/)?.[0]?.toLowerCase()
  if (!question) return null
  if (/\b(?:want|like) me to (?:make|get|keep)\b/.test(question) && /\b(?:this|it|that|the (?:meal|bowl|recipe|draft))\b/.test(question)) {
    const match = OFFER_OPS.find(([pattern]) => pattern.test(question))
    if (match) return { offer: match[1] }
  }
  if (/\b(?:what|how) would you like (?:to )?(?:change|adjust|tweak|modify|edit)\b|\bwant me to (?:adjust|tweak|change|modify)\b|\bwhat should (?:replace|go in)\b|\banything (?:you'?d like|you want) (?:to )?(?:change|adjust)\b/.test(question)) return { offer: null }
  return null
}

/* =========================================================
   TOPIC RESOLUTION
========================================================= */

const FOOD_SENSORY: Array<[RegExp, string, SensoryTarget[]]> = [
  [/coco ?pops|choco(?:late)? (?:crunch|pops|cereal)/i, "Coco Pops", ["chocolate", "sweet", "crunchy"]],
  [/chocolate cereal/i, "chocolate cereal", ["chocolate", "sweet", "crunchy"]],
  [/cereal/i, "cereal", ["crunchy", "sweet"]],
  [/ice[ -]?cream|gelato/i, "ice cream", ["creamy", "sweet", "cold"]],
  [/pizza/i, "pizza", ["salty", "filling"]],
  [/chips|crisps/i, "chips", ["salty", "crunchy"]],
  [/chocolate/i, "chocolate", ["chocolate", "sweet"]],
]

const SENSORY_WORDS: Array<[RegExp, SensoryTarget]> = [
  [/\bchoco\w*/i, "chocolate"],
  [/\bsweet\w*/i, "sweet"],
  [/\bsalty|savou?ry\b/i, "salty"],
  [/\bcrunch\w*|crispy\b/i, "crunchy"],
  [/\bcreamy|smooth\b/i, "creamy"],
  [/\bcold|icy|frozen\b/i, "cold"],
  [/\bfilling|hearty\b/i, "filling"],
]

export function sensoryTargetsFor(text: string, food?: string): SensoryTarget[] {
  const found = new Set<SensoryTarget>()
  const known = FOOD_SENSORY.find(([pattern]) => pattern.test(food ?? text))
  known?.[2].forEach((target) => found.add(target))
  for (const [pattern, target] of SENSORY_WORDS) if (pattern.test(text)) found.add(target)
  return [...found]
}

/** Canonical display name for a food the user mentioned. Free text is kept (trimmed) when unknown. */
function canonicalFood(raw: string): string | undefined {
  const text = raw.trim().replace(/^(some|a|an|the|my)\s+/i, "").replace(/[.!?,;]+$/, "").trim()
  if (!text || /^(something|anything|food|a snack|snack)\b/i.test(text) || text.length > 60) return undefined
  const known = FOOD_SENSORY.find(([pattern]) => pattern.test(text))
  return known && known[1] === "Coco Pops" ? known[1] : text
}

const CRAVING_FOOD = /\bcrav\w*\s+(?:for\s+)?(.+?)(?=[,.;!?]|\s+(?:what|but|and|so|how|can|could|right|tonight|now|again|at|after|before|while|that|which|because)\b|$)/i

export function extractCravingFood(message: string): string | undefined {
  const crave = message.match(CRAVING_FOOD)
  if (crave) return canonicalFood(crave[1])
  const known = FOOD_SENSORY.find(([pattern]) => pattern.test(message))
  return known ? canonicalFood(known[1]) : undefined
}

/* =========================================================
   CONVERSATION CLASSIFICATION
========================================================= */

export type CravingApproach = "real" | "makeover"

export type Classification =
  | { intent: "RESET_CONTEXT" }
  | { intent: "LOG_MEAL" }
  | { intent: "PREFERENCE_UPDATE"; signals: PreferenceSignal[] }
  | { intent: "MACRO_CALCULATION"; ingredientId: string | null; grams: number; food: string }
  | { intent: "NEW_CRAVING_REQUEST"; topic: NutritionTopic; build: false }
  | { intent: "NEW_CRAVING_REQUEST"; topic: NutritionTopic; build: true; approach: CravingApproach; key: CravingKey | null }
  | { intent: "FOOD_SUBSTITUTION"; topic: NutritionTopic }

const RESET = /\b(?:forget|scrap|discard|ditch|cancel|clear)\b[^.?!]*\b(?:that|this|the)\b[^.?!]*\b(?:meal|bowl|recipe|draft|dish)\b|\bstart over\b|\bnever ?mind\b|\bforget (?:it|that)\b/i
const LOG = /\blog\s+(?:this|that|it)\b(?!\s+(?:workout|session))|\blog the (?:active )?(?:meal|draft)\b|\bsave this meal\b/i
const PREF_CRAVE = /^\s*(?:actually,?\s*)?i\s+(?:always|usually|often)\s+crav\w*\s+([a-z' -]{2,40}?)(?:\s+(?:at|in|every)\s+(?:the\s+)?(night|evening|morning|afternoon|day))?\s*[.!]*$/i
const PREF_DISLIKE = /^\s*(?:actually,?\s*)?i\s+(?:really\s+)?(?:hate|dislike|can'?t stand|don'?t like|do not like|am not a fan of|'?m not a fan of)\s+([a-z' -]{2,40}?)\s*[.!]*$/i
const PREF_LIKE = /^\s*(?:actually,?\s*)?i\s+(?:really\s+)?(?:love|like|enjoy|prefer)\s+([a-z' -]{2,40}?)\s*[.!]*$/i
const TEXTURES = /\b(crunchy|crispy|creamy|chewy|smooth|crumbly)\b/i
const SOMETHING_TASTE = /\b(?:i want|i'?d like|i need|got a|do you have|any)\b[^.?!]*\b(?:something|a|an)\s+(sweet|salty|crunchy|creamy|chocolate\w*|cold)\b|\bsweet tooth\b|\b(sweet|salty|crunchy|creamy) (?:snack|treat) idea\b/i
const BUILD_AROUND = /\b(?:fit|squeeze|work|build|make|include|keep|use|put)\b[^.?!]*\b(?:real|actual)\b|\b(?:fit|work|squeeze)\b[^.?!]*\b(?:macros?|remaining|left today|budget)\b|\bmakeover\b/i
const REFERS_BACK = /\b(?:it|them|that|those|real|actual|makeover)\b/i
const MACRO_QUESTION = /\b(?:how (?:much|many)|what(?:'?s| is| are))\b[^.?!]*\b(?:protein|calories?|kcal|carbs?|fat|macros?)\b/i
const GRAMS_OF = /(\d{1,4})\s*(?:g|grams?)\s*(?:of\s+)?([a-z][a-z ]{1,40}?)(?:\s+(?:have|has|contain|contains|in it|there)\b|[?.!,]|$)/i
const SUBSTITUTION = /\b(?:substitute|alternative|replacement)s?\b[^.?!]*\b(?:for|to|of)\b|\bwhat (?:can|could|should) i (?:use|swap|replace)\b|\binstead of\b/i

function cravingKeyFor(food: string | undefined, approach: CravingApproach): CravingKey | null {
  const base = food ? detectCravingKey(food) : null
  return base === "chocolate_cereal" && approach === "real" ? "real_cereal" : base
}

/**
 * Classifies the conversation-level intents that must NOT be forced into a
 * meal operation. Returns null when the message is a plain meal/edit/general
 * message (handled by the deterministic parser + the conversational reply).
 * Call AFTER draft-reference resolution and the safety/scope checks.
 */
export function classifyConversation(message: string, input: { reference: DraftReference; state: Pick<ConversationInput, "currentTopic" | "pendingMealBuild"> }): Classification | null {
  const { reference, state } = input
  const text = message.trim()

  if (RESET.test(text)) return { intent: "RESET_CONTEXT" }
  if (LOG.test(text)) return { intent: "LOG_MEAL" }

  const crave = text.match(PREF_CRAVE)
  if (crave) return { intent: "PREFERENCE_UPDATE", signals: [{ kind: "CRAVING_PATTERN", value: crave[1].trim(), strength: "EXPLICIT", scope: "SESSION", context: crave[2]?.toLowerCase() }] }
  const dislike = text.match(PREF_DISLIKE)
  const isAboutDraft = (value: string) => /^(this|that|it|the|these|those)\b/i.test(value)
  if (dislike && !isAboutDraft(dislike[1])) return { intent: "PREFERENCE_UPDATE", signals: [{ kind: "DISLIKE", value: dislike[1].trim(), strength: "EXPLICIT", scope: "SESSION" }] }
  const like = text.match(PREF_LIKE)
  if (like && !isAboutDraft(like[1]) && !/\?/.test(text)) {
    const value = like[1].trim()
    return { intent: "PREFERENCE_UPDATE", signals: [{ kind: TEXTURES.test(value) ? "PREFERRED_TEXTURE" : "LIKE", value, strength: "EXPLICIT", scope: "SESSION" }] }
  }

  // Craving: a NEW topic. Never anchored to the Active Meal Draft.
  const pendingFood = state.pendingMealBuild?.topic ?? (state.currentTopic?.type === "CRAVING" ? state.currentTopic.food : undefined)
  const messageFood = extractCravingFood(text)
  const approachOf = (): CravingApproach => (/\b(?:makeover|full|high[- ]protein (?:version|makeover)|replace|swap it|healthier version)\b/i.test(text) ? "makeover" : /\b(?:real|actual|topping|keep)\b/i.test(text) ? "real" : state.pendingMealBuild?.approach === "makeover" ? "makeover" : "real")

  const wantsBuild = BUILD_AROUND.test(text) && !/\bcrav\w*/i.test(text)
  const confirmsBuild = Boolean(state.pendingMealBuild) && isAffirmation(text)
  if (wantsBuild || confirmsBuild) {
    const food = messageFood ?? (confirmsBuild || REFERS_BACK.test(text) ? pendingFood : undefined)
    if (food) {
      const approach = approachOf()
      const sensoryTargets = sensoryTargetsFor(text, food)
      return { intent: "NEW_CRAVING_REQUEST", build: true, approach, key: cravingKeyFor(food, approach), topic: { type: "CRAVING", food, sensoryTargets: sensoryTargets.length ? sensoryTargets : state.currentTopic?.sensoryTargets } }
    }
  }

  if (/\bcrav\w*/i.test(text) || SOMETHING_TASTE.test(text)) {
    const sensoryTargets = sensoryTargetsFor(text, messageFood)
    return { intent: "NEW_CRAVING_REQUEST", build: false, topic: { type: "CRAVING", food: messageFood, sensoryTargets } }
  }

  if (MACRO_QUESTION.test(text)) {
    const grams = text.match(GRAMS_OF)
    if (grams) {
      const found = findIngredientByText(grams[2].trim())
      return { intent: "MACRO_CALCULATION", ingredientId: found?.id ?? null, grams: Number(grams[1]), food: grams[2].trim() }
    }
  }

  if (SUBSTITUTION.test(text) && !reference.bound) {
    const food = text.match(/\b(?:for|instead of)\s+([a-z][a-z ]{1,40}?)\s*[?.!]*$/i)?.[1]
    return { intent: "FOOD_SUBSTITUTION", topic: { type: "FOOD", food: food?.trim() } }
  }

  return null
}

export { QUICK_ACTIONS } from "./quick-actions"

/* =========================================================
   MACRO PROVENANCE
========================================================= */

const MACRO_NUMBER = [
  /(\d+(?:\.\d+)?)\s*(?:k?cal(?:ories)?\b)/gi,
  /(\d+(?:\.\d+)?)\s*(?:g|grams?)\s+(?:of\s+)?(?:protein|carbs?|carbohydrates?|fat)\b/gi,
  /\b(?:protein|carbs?|carbohydrates?|fat)\s*(?:of|:|is|are)?\s*(?:about|around|~)?\s*(\d+(?:\.\d+)?)\s*g\b/gi,
]

/** True when a model reply states an exact calorie/macro number that did not come from structured data or the user's own message. */
export function hasUngroundedMacros(reply: string, allowed: Iterable<number>): boolean {
  const ok = new Set([...allowed].map((n) => Math.round(n)))
  return MACRO_NUMBER.some((pattern) => [...reply.matchAll(pattern)].some((match) => !ok.has(Math.round(Number(match[1])))))
}
