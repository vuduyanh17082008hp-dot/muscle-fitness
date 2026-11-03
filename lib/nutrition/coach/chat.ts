import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"

import { callOpenAiWithFallback } from "@/lib/dante-core/openai/client"
import { isOpenAiConfigured } from "@/lib/dante-core/openai/config"
import { boundedDependency, createTurnBudget, EARLY_READ_MS, RETRIEVAL_PHASE_MS, type TurnBudget } from "@/lib/dante-core/turn-budget"
import { SEMANTIC_GATE_TIMEOUT_MS } from "@/lib/nutrition/knowledge/semantic-gate"

import {
  acceptedOffer,
  classifyConversation,
  detectDraftEditOffer,
  hasUngroundedMacros,
  isAffirmation,
  LOG_REQUEST,
  QUICK_ACTIONS,
  resolveDraftReference,
  sensoryTargetsFor,
  SENSORY_TARGETS,
  conversationInputSchema,
  type NutritionIntent,
  type NutritionTopic,
  type PreferenceSignal,
  type ToolCallSummary,
} from "./conversation"
import { renderKnowledgeContext } from "@/lib/nutrition/knowledge/context"
import { decideMealBuildKnowledgeNeed, decideNutritionKnowledgeNeed } from "@/lib/nutrition/knowledge/need"
import { getOptionalNutritionKnowledgeContext } from "@/lib/nutrition/knowledge/retrieve"
import { resolveUncertainNeed } from "@/lib/nutrition/knowledge/semantic-gate"
import type { MealSummary } from "@/lib/nutrition/food-log/totals"
import { MEAL_TYPES, type MealType } from "@/lib/nutrition/food-log/types"
import type { KnowledgeNeedDecision, NutritionKnowledgeContext } from "@/lib/nutrition/knowledge/types"

import { classifyTargetUtterance, guardCanonicalTargetClaim, isTargetQuestion, targetQuestionReply, targetTruthReply } from "@/lib/nutrition/targets"
import { loadCoachContext } from "./context"
import { buildContextBudget, commitEmitted, composeReply, durableConstraints, fallbackDiagnostics, legacySnapshot, listMatchesEngine, orchestrateTurn, OTHER_REF, parseOptions, pendingFromPlan, planDiagnostics, recordOrchestrationEvent, safetyReply, screenSafety, supplementEducationReply, validateSnapshot, type ModelCall, type OrchestrationDiagnostics, type PendingClarification, type PresentedOptionSnapshot } from "./orchestration"
import { isLoggedIntakeQuestion } from "./orchestration/needs"
import { decideProposal, draftForMeal, executeFollowUp, presentOptions, type FollowUpExec } from "./followup-actions"
import {
  FOLLOW_UP_INTENTS,
  MODE_BY_INTENT,
  MODIFIERS,
  draftReferent,
  isFollowUpLive,
  knownMeals,
  mealFromDraft,
  mentionsMeal,
  PROPOSAL_TTL_MS,
  referentFor,
  resolveTurn,
  type FollowUpArgs,
  type FollowUpResolution,
  type FollowUpState,
  type MealModificationProposal,
  type MealResultState,
  type NewTopic,
  type NutritionFollowUpIntent,
  type PendingChoiceContext,
  type ResolutionConfidence,
  type StatePatch,
  type StructuredBlock,
  type TurnResolution,
} from "./followup"
import { recordFollowUpEvent } from "./followup-telemetry"
import { buildCravingDraft, detectCravingKey } from "./craving"
import { applyDraftOp, oneMealBudget, type DraftOp } from "./draft"
import { ALLERGEN_GUARD, asksForMealSuggestion, coordinationDiagnostics, coordinationNote, EMPTY_COORDINATION, GEMMA_CLEARANCE, loadGemmaCoordination, type GemmaCoordination } from "@/lib/intelligence/gemma-consumer"
import { dayLevelCalorieProposal, excludedFoodsIn, foodsNamedIn, isSafetyMessage, isUnsafeCoachReply, MORE_OPTIONS, parseCoachMessage, requestedOptionCount, resolveFoods, SAFETY_REPLY } from "./intent"
import { compositionKey } from "./optimizer"
import { buildDanteDeferralReply } from "@/lib/intelligence/query-understanding"
import { activeFacts, buildContextWorkingSet, buildIntelligenceBrief, enforceIntegrity, restrictedSubstanceReply, withStoredAllergies } from "@/lib/intelligence/performance-core"
import { syncDisclosureSignals } from "@/lib/intelligence/dante-signal-persistence"
import { loadActiveCoachSignalsForDomain } from "@/lib/intelligence/coach-signal-store"
import { withDisclosedFacts } from "@/lib/intelligence/dante-runtime"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

/** Context-working-set allergen keys → the meal engine guard terms (ingredients.ts matches names, aliases and allergen tags). */
const WORKING_SET_ALLERGEN: Record<string, string[]> = {
  "ALLERGY:fish": ["fish"], "ALLERGY:shellfish": ["shellfish"], "ALLERGY:peanuts or tree nuts": ["peanut", "nuts"], "ALLERGY:dairy or lactose": ["dairy"],
  "ALLERGY:eggs": ["egg"], "ALLERGY:soy": ["soy"], "ALLERGY:gluten or wheat": ["gluten"], "ALLERGY:sesame": ["sesame"],
}
import { checkSafety } from "@/lib/dante-core/safety-layer"
import { detectLanguage } from "./orchestration/context"

/** S0 D-01: the fixed integrity lines speak the turn's language; with no explicit control, the message's own (VI stays VI). */
const integrityLanguage = (control: string, message: string): "en" | "vi" => (control === "VI" ? "vi" : control === "EN" ? "en" : detectLanguage(message) === "en" ? "en" : "vi")
import { buildGemmaFrame, type ResolvedFoodReference } from "./orchestration/shared-query"
import { COACH_INGREDIENT_IDS, getIngredient } from "./ingredients"
import { totalsFor } from "./macros"
import { buildNextMeal, chooseMyFood } from "./service"
import { draftInputSchema, rehydrateDraft, type ConstraintOverrides } from "./schema"
import { isLive, type LogActionStage, type PendingLog } from "./log-action"
import { handleLogTurn } from "./log-turn"
import type { ActiveMealDraft, CoachContext } from "./types"

/**
 * Nutrition Coach chat turn (coachMode: "nutrition" on /api/chatbot).
 *
 * Runs AFTER the chatbot route's auth + shared application rate limit.
 * Pipeline (N1.5): reference resolution -> conversation intent -> topic ->
 * decide (answer only | tool | draft create | draft edit | log proposal).
 * The Active Meal Draft is CONTEXT, not the default topic. Every number in a
 * reply comes from the deterministic engine; the LLM never computes one.
 */

/** The ONLY tools the Nutrition Coach may use. None can touch training or recovery. */
export const NUTRITION_COACH_TOOLS = ["get_nutrition_state", "search_food", "log_meal_draft"] as const

export const nutritionChatBodySchema = z.object({
  message: z.string().trim().min(1).max(800),
  coachMode: z.literal("nutrition"),
  activeDraft: draftInputSchema.nullish(),
  selectedFoods: z.array(z.enum(COACH_INGREDIENT_IDS as [string, ...string[]])).max(10).optional(),
  conversation: conversationInputSchema.nullish(),
})

export function getCoachMode(body: unknown): "dante" | "nutrition" {
  return typeof body === "object" && body !== null && (body as { coachMode?: unknown }).coachMode === "nutrition" ? "nutrition" : "dante"
}

/* =========================================================
   ONE AI COACH — Dante's domain router (MF Dante unified).
   The nutrition engine below is one of Dante's capabilities, not a second assistant: the same chat turn is routed to it
   or to Dante's main pipeline by what it asks, never answered with "ask the other coach".
========================================================= */

const MAIN_PIPELINE_DOMAINS = new Set(["TRAINING", "RECOVERY", "PERFORMANCE"])

/**
 * A turn sent from the Nutrition page that is really a training / recovery question runs Dante's main pipeline (the
 * same tests the engine used to answer with a referral). A safety screen hit stays here: the engine owns that copy.
 */
export function nutritionTurnForMainPipeline(body: unknown): boolean {
  const parsed = nutritionChatBodySchema.safeParse(body)
  if (!parsed.success) return false
  const { message } = parsed.data
  const recent = parsed.data.conversation?.recentMessages ?? []
  if (isSafetyMessage(message) || screenSafety(message, { recent })) return false
  // Exactly the engine's own tested boundaries (a supplement or food-for-recovery ask stays with the nutrition capability).
  if (parseCoachMessage(message, { hasDraft: false }).kind === "redirect_training") return true
  return buildGemmaFrame(message, recent).frame.deferToDante
}

/** The nutrition state the general Dante chat echoes between turns (from its last nutrition reply). Re-validated server-side every turn. */
const danteNutritionStateSchema = z.object({ activeDraft: draftInputSchema.nullish(), conversation: conversationInputSchema.nullish() })
export type DanteNutritionState = z.infer<typeof danteNutritionStateSchema>

export function danteNutritionState(body: unknown): DanteNutritionState | null {
  const raw = typeof body === "object" && body !== null ? (body as { nutrition?: unknown }).nutrition : undefined
  const parsed = raw ? danteNutritionStateSchema.safeParse(raw) : null
  return parsed?.success ? parsed.data : null
}

/** A meal list, draft, pending proposal or pending log is still in play, so a short follow-up ("the second one", "log that") is about it. */
export function nutritionStateIsLive(state: DanteNutritionState | null, now: Date = new Date()): boolean {
  if (!state) return false
  const conv = state.conversation
  const alive = (iso: string | undefined) => Boolean(iso) && Date.parse(iso!) > now.getTime()
  return Boolean(state.activeDraft && state.activeDraft.status !== "LOGGED") || isFollowUpLive(conv?.followUp ?? null, now) || isLive(conv?.pendingLog ?? null, now)
    // An option list on screen (engine- or coach-written) or a pending clarification is still what "the second one" refers to.
    || alive(conv?.presented?.expiresAt) || alive(conv?.pending?.expiresAt)
}

/**
 * "gợi ý cho mình 3 món trưa nhiều đạm": a Vietnamese meal-discovery request (request verb + a count of dishes). Dante's query
 * frame doesn't read it as meal construction (live: the general model answered in English with invented portions), so the
 * router uses the engine's own detector. Vietnamese only: the English frame already routes English meal requests.
 */
export function isVietnameseMealDiscovery(message: string): boolean {
  return requestedOptionCount(message) !== null && DISCOVERY_VERB_VI.test(message) && /(?<![\p{L}])(?:món|bữa|ăn)(?![\p{L}])/iu.test(message)
}

/** On the general Dante chat: a turn that continues live nutrition state stays with the nutrition capability unless it is clearly another domain. */
export function danteTurnContinuesNutrition(state: DanteNutritionState | null, frame: { primaryDomain: string; safetySignal: boolean }, now: Date = new Date()): boolean {
  return nutritionStateIsLive(state, now) && !MAIN_PIPELINE_DOMAINS.has(frame.primaryDomain) && !frame.safetySignal
}

type ActionType = "NONE" | "ASK_BEFORE_BUILD" | "CREATE_MEAL_DRAFT" | "UPDATE_MEAL_DRAFT" | "PROPOSE_LOG"

export type NutritionAgentResponse = {
  ok: true
  coachMode: "nutrition"
  reply: string
  intent: NutritionIntent
  /** Which internal path answered (safety, redirect_training, build, op, chat, ...). Debug/telemetry only. */
  route: string
  topic?: NutritionTopic
  action: { type: ActionType; label?: string }
  draftTarget: { mode: "NONE" | "ACTIVE" | "NEW"; draftId?: string }
  mealDraft: ActiveMealDraft | null
  preferenceSignals: PreferenceSignal[]
  toolCalls: ToolCallSummary[]
  /** State the client echoes back next turn. The one-turn draft handoff is recomputed here every time. */
  conversation: {
    lastIntent: NutritionIntent
    currentTopic: NutritionTopic | null
    pendingMealBuild: { topic: string; approach?: string } | null
    handoff: { offer: "cheaper" | "tastier" | "more_protein" | "lower_calories" | "more_filling" | "faster" | null } | null
    signals: PreferenceSignal[]
    deactivateDraft: boolean
    /** Ephemeral follow-up context (N1.5.6). TTL-bound; null when nothing is worth carrying. */
    followUp: FollowUpState | null
    /** N1.6.4: durable user constraints of this conversation ("low_prep", "without:x"), echoed so they outlive the 6-message window. */
    constraints: string[]
    /** N1.6.4: who owns "what the user was shown". CONVERSATION until the engine produces a new meal / topic switch / reset. */
    focus: { owner: "CONVERSATION"; item: string | null } | null
    /** N1.6.4-P2R: the options THIS reply actually showed (built from the emitted reply + blocks). The only set a later "option 2" may select from. */
    presented: PresentedOptionSnapshot | null
    /** N1.6.4-P2R: the blocking question THIS reply asked and the request its answer resumes. Lives for exactly one answer. */
    pending: PendingClarification | null
    /** The one food this conversation's last tool run resolved (identity + basis). A quantity follow-up re-resolves it server-side. */
    foodReference: ResolvedFoodReference | null
    /** Today's food-log rows when THIS reply was written: a later "it" may only mean one of them (a re-added food is a new row). */
    loggedRows: LoggedRow[] | null
    /** P0: the chat's pointer to its pending meal-log action (lib/nutrition/coach/log-action.ts). null = none. */
    pendingLog: PendingLog | null
  }
  /** P0 diagnostics: the log-action stages this turn passed through. null = not a log turn. */
  logAction: { stage: LogActionStage | null; trace: LogActionStage[]; foodLogId: string | null } | null
  /** True only when the SERVER confirmed a food-log write this turn: the client re-reads totals. */
  foodLogChanged: boolean
  /** Compact structured results the UI renders instead of re-parsing prose. */
  structuredBlocks: StructuredBlock[]
  referent: FollowUpState["referent"]
  presentedOptions: PendingChoiceContext | null
  followUpHints: string[]
  modificationProposal: MealModificationProposal | null
  /** Debug/telemetry only: how a short follow-up was resolved. */
  followUp: { intent?: NutritionFollowUpIntent; responseMode: FollowUpResolution["responseMode"]; confidence: ResolutionConfidence; viaModel: boolean } | null
  /** Debug/telemetry only (N1.6.4): privacy-safe orchestration diagnostics. No text, no foods, no reasoning. */
  orchestration: OrchestrationDiagnostics | null
  /** AI-R1E.2 debug/telemetry only: which Dante signals were read (tokens/refs/enums). null = none consumed. */
  coordination: ReturnType<typeof coordinationDiagnostics> | null
  // Compatibility fields used by the panel.
  draft: ActiveMealDraft | null
  proposal: ActiveMealDraft | null
  warnings: Array<{ kind: string; message: string; actions: Array<{ label: string; fit: string }> }>
  alternatives: ActiveMealDraft[]
  quickActions: typeof QUICK_ACTIONS
  /** H0 debug/telemetry: terminal runtime status, provider attempts and per-dependency outcome for this turn. */
  runtime: ReturnType<typeof gemmaRuntime>
}

function whyLines(draft: ActiveMealDraft, ctx: CoachContext): string {
  const lines: string[] = []
  const { constraints, nutrition } = draft
  if (constraints.calorieCeiling !== null && nutrition.calories <= constraints.calorieCeiling) lines.push(`fits a ${Math.round(constraints.calorieCeiling)} kcal budget for this meal`)
  if (constraints.proteinTarget !== null && nutrition.protein >= constraints.proteinTarget - 2) lines.push(`covers about ${Math.round(nutrition.protein)}g of protein`)
  if (ctx.guards.allergies.length + ctx.guards.excludedFoods.length > 0) lines.push("avoids your allergies and excluded foods")
  return lines.length ? ` Why: ${lines.join("; ")}.` : ""
}

function summarize(draft: ActiveMealDraft): string {
  const items = draft.ingredients.map((i) => `${i.name} ${i.grams} g`).join(", ")
  return `${draft.name} — ${Math.round(draft.nutrition.calories)} kcal, ${Math.round(draft.nutrition.protein)}g protein (${items}). Macro confidence: ${draft.confidence}.`
}

const left = (ctx: CoachContext) => `${Math.round(ctx.snapshot.caloriesRemaining)} kcal and ${Math.round(ctx.snapshot.proteinRemaining)}g protein`

/** Frame intents that ask ABOUT a food (facts, macros, a quantity, a comparison) rather than asking the engine to build a meal. */
const FOOD_INFORMATION_INTENTS: ReadonlySet<string> = new Set(["FOOD_FACT", "FOOD_MACRO_LOOKUP", "FOLLOWUP_QUANTITY", "MACRO_CALCULATION", "FOOD_COMPARISON", "NUTRITION_EXPLANATION"])

const GREETING = /^\s*(?:yo+|hi+|hey+|hello+|sup|hiya|what'?s up|good (?:morning|afternoon|evening))\b/i

/**
 * LAST RESORT, used only when no model reply exists (not configured, failed, or ungrounded).
 * Built from structured state — the meal in view or today's remaining macros — never a command list.
 */
function lastResortReply(ctx: CoachContext | null, options: { message?: string; lastMealName?: string } = {}): string {
  if (options.message && GREETING.test(options.message)) return "Hey 👋 What are we solving — your next meal, a craving, or just a nutrition question?"
  // "What did I eat today?" / "my last meal" with no model: the food log answers it verbatim (absent = not loaded, skip).
  if (options.message && ctx?.todayMeals && isLoggedIntakeQuestion(options.message)) {
    if (!ctx.todayMeals.length) return "Nothing is logged for today yet, so I can't say what you've eaten."
    // The last meal is the whole meal the latest row was logged under, so a follow-up "it" means the same thing.
    const last = ctx.lastLogged && ctx.todayMeals.find((meal) => meal.meal === ctx.lastLogged!.meal)
    if (/\b(?:last|latest|previous) meal\b/i.test(options.message) && last) return `Your last logged meal today was ${mealLabel(last)}: ${last.foods.join("; ")}.`
    // The day's total is the snapshot's sum of the same rows, so "how many calories today?" is answered, not just listed.
    const { caloriesConsumed, proteinConsumed } = ctx.snapshot
    const total = Number.isFinite(caloriesConsumed) && Number.isFinite(proteinConsumed) ? ` That's ${Math.round(caloriesConsumed)} kcal and ${Math.round(proteinConsumed * 10) / 10} g protein in total.` : ""
    return `Here's what you've logged today: ${ctx.todayMeals.map((meal) => `${meal.meal} — ${meal.foods.join("; ")}`).join(". ")}.${total}`
  }
  if (options.lastMealName) return `I can show the ingredients or macros for ${options.lastMealName}, suggest a change to it, or we can switch to something else. What would you like?`
  if (ctx && ctx.snapshot.caloriesRemaining > 0) return `You've got about ${left(ctx)} left today. Want a meal that fits that, a craving worked in, or a nutrition question answered?`
  return "What are we solving — a meal, a craving, or a nutrition question?"
}

const mealLabel = (meal: MealSummary | MealType) => (typeof meal === "string" ? meal : meal.meal).replace("_", "-")
const portionOf = (food: string) => food.slice(0, food.lastIndexOf(":"))
const MEAL_QUESTION = /\b(?:protein|calories|kcal|macros?|suitable|good|fit|ok(?:ay)?|right|healthy)\b/i
// "is it ok to eat late?" is a general question, not one about the meal just discussed.
const MEAL_BACKREF = /\b(?:in it|(?:was|is) it(?![^?.!]*\bto\b)|that meal|this meal|that one)\b/i
// "in/was/is my lunch" asks about the logged meal; "a snack for my dinner" asks for a new one.
const MY_MEAL = /\b(?:in|was|is|of) my (breakfast|lunch|dinner|snacks?|pre[- ]?workout|post[- ]?workout)(?: meal)?\b/i
const ASKS_NUMBERS = /\b(?:protein|calories|kcal|macros?)\b|\bwhat(?:'s| is| was) in\b/i
// "what did that meal have before I deleted it?" asks about the past, which the current log cannot answer.
const HISTORICAL = /\bbefore (?:i|you|it was) (?:delet|remov|chang|edit)/i
const LOG_TALK = /\b(?:logged|food log|you (?:had|ate)|you've had|your (?:last |latest )?(?:meal|breakfast|lunch|dinner|snack))\b/i
const PREP_WORDS = new Set(["cooked", "raw", "boiled", "grilled", "fried", "baked", "steamed", "roasted"])
const words = (text: string) => (text.toLowerCase().match(/\p{L}{3,}/gu) ?? []).filter((word) => !PREP_WORDS.has(word))
// "the chicken" / "my grilled rice": a food named with a determiner; it is a log reference only if a logged row has that word.
const FOOD_REF = /\b(?:the|my|that|this)\s+(?:(?:cooked|raw|boiled|grilled|fried|baked|steamed|roasted)\s+)?(\p{L}{3,})/giu
const NOT_FOOD = new Set(["protein", "calories", "kcal", "macros", "macro", "carbs", "fat", "meal", "food", "total", "log", "day", "breakfast", "lunch", "dinner", "snack", "snacks"])

type LoggedRow = { id: string; meal: string; food: string }

/**
 * "How much protein was in it?" / "was that meal suitable for my goal?" / "my lunch": the meal is resolved only against
 * today's CURRENT log rows, and its numbers come from those rows, never from the chat. "My lunch" is the current lunch.
 * "It" is a log ROW the last coach turn could have meant: the chat names the meal/food, `seen` (the rows logged when that
 * turn was written) says which rows those were. A current row is the discussed one only if its id and food are in `seen` —
 * a shared name, the same slot, or a delete + re-add of the same food is never proof (Codex P1). No snapshot, no identity:
 * the reply says so instead of guessing. `judge` = the discussed meal is unchanged and the user asks how it fits (a coaching
 * answer): the reply is then only the planner-failure fallback. `gone` = the discussed entry is no longer logged: the chat still
 * means THAT row, so the next turn keeps this turn's snapshot. Null = not a question about a logged meal.
 */
function loggedMealReply(message: string, ctx: CoachContext, recent: Array<{ role: "user" | "coach"; text: string }>, seen: LoggedRow[] | null): { reply: string; judge: boolean; gone?: true } | null {
  const meals = ctx.todayMeals
  const historical = HISTORICAL.test(message)
  if (!meals || !(MEAL_QUESTION.test(message) || historical || MY_MEAL.test(message))) return null
  const listed = meals.length ? `Today's log has ${meals.map(mealLabel).join(", ")}.` : "Nothing is logged for today yet."
  const lastCoach = recent.findLast((turn) => turn.role === "coach")?.text ?? ""
  // `ids` = the rows the answer covers; the numbers are those rows' own, summed.
  const answer = (meal: MealSummary, note = "", ids = meal.rows.map((row) => row.id)): { reply: string; judge: boolean } => {
    const rows = meal.rows.filter((row) => ids.includes(row.id))
    const protein = Math.round(rows.reduce((sum, row) => sum + row.protein, 0) * 10) / 10
    const calories = Math.round(rows.reduce((sum, row) => sum + row.calories, 0))
    const facts = `${note}Your ${mealLabel(meal)} (${meal.foods.filter((_, i) => ids.includes(meal.rows[i].id)).map(portionOf).join(", ")}) had ${protein} g protein and ${calories} kcal, from your food log.`
    if (historical) return { reply: `Today's log now has it as: ${facts} Earlier in this chat I said: “${lastCoach.slice(0, 300)}”`, judge: false }
    if (ASKS_NUMBERS.test(message) || note) return { reply: facts, judge: false }
    const goal = ctx.snapshot.goal ? `The goal on your profile is ${ctx.snapshot.goal.replace(/_/g, " ")}, but I` : "There is no goal on your profile yet, and I"
    return { reply: `${facts} ${goal} can't give a proper judgement of how it fits right now. Try again in a moment.`, judge: true }
  }
  const missing = (): { reply: string; judge: boolean; gone: true } => ({
    reply: historical && lastCoach
      ? `That meal is no longer in today's food log, so I can't check it against your log now. Earlier in this chat I said: “${lastCoach.slice(0, 300)}”`
      : `I can't find that meal in today's log anymore, so I can't give its numbers. ${listed}`,
    judge: false,
    gone: true,
  })

  const asked = message.match(MY_MEAL)?.[1]
  if (asked) {
    const key = asked.toLowerCase().replace(/s$/, "").replace(/(pre|post)[- ]?workout/, "$1_workout")
    const meal = meals.find((item) => item.meal === key)
    return meal ? answer(meal) : { reply: `Nothing is logged under ${asked.toLowerCase()} today, so I can't give its numbers. ${listed}`, judge: false }
  }
  const current = meals.flatMap((meal) => meal.rows.map((row) => ({ ...row, meal: meal.meal })))
  // "How much protein was in the chicken?" names a food, not "it" (live D-11: chicken deleted from a chicken + rice lunch, and
  // its 33.8 g was re-voiced from the chat as current). The food is the rows with that word logged NOW; a row from `seen` that is
  // gone is said to be gone, with no numbers (the snapshot holds no amounts), and is never answered with another row's numbers.
  const hasWord = (word: string) => (row: { food: string }) => words(row.food.replace(/\(.*$/, "")).includes(word)
  const ref = ASKS_NUMBERS.test(message) || historical
    ? [...message.matchAll(FOOD_REF)].map((m) => m[1].toLowerCase()).find((word) => !NOT_FOOD.has(word) && [...current, ...(seen ?? [])].some(hasWord(word)))
    : undefined
  if (ref) {
    const now = current.filter(hasWord(ref))
    const then = (seen ?? []).filter(hasWord(ref))
    const kept = now.filter((row) => then.some((old) => old.id === row.id && old.food === row.food))
    const removed = then.filter((old) => !current.some((row) => row.id === old.id && row.food === old.food))
    if (!now.length || (historical && !kept.length && removed.length)) {
      const slots = [...new Set(removed.map((row) => row.meal))]
      const nowIn = slots.map((slot) => meals.find((meal) => meal.meal === slot)).map((meal, i) => (meal ? `Your ${mealLabel(meal)} now has ${meal.foods.map(portionOf).join(", ")}.` : `Nothing is logged under ${mealLabel(slots[i] as MealType)} now.`))
      return {
        reply: `${[...new Set(removed.map((row) => row.food))].join(", ")} was logged under your ${slots.map((slot) => mealLabel(slot as MealType)).join(" and ")} when I last replied, but it is no longer in today's food log, so it isn't part of what you've logged now. I don't have a verified record of its amounts from before it was removed, so I won't give its numbers. ${nowIn.join(" ")}`,
        judge: false,
        gone: true,
      }
    }
    const pick = kept.length ? kept : now
    const where = [...new Set(pick.map((row) => row.meal))]
    if (where.length > 1) return { reply: `Which meal do you mean — ${where.map((slot) => mealLabel(slot as MealType)).join(" or ")}?`, judge: false }
    const meal = meals.find((item) => item.meal === where[0])!
    if (pick.length > 1) return { reply: `Your ${mealLabel(meal)} has more than one ${ref} entry: ${meal.foods.filter((_, i) => pick.some((row) => row.id === meal.rows[i].id)).map(portionOf).join(" and ")}. Which one do you mean?`, judge: false }
    const note = !kept.length && removed.length ? `The ${ref} entry from earlier in this chat (${removed.map((row) => row.food).join(", ")}) is no longer logged; this is a newer entry, not the same one. ` : ""
    const i = meal.rows.findIndex((row) => row.id === pick[0].id)
    const facts = `${note}The ${portionOf(meal.foods[i])} in your ${mealLabel(meal)} has ${Math.round(meal.rows[i].protein * 10) / 10} g protein and ${Math.round(meal.rows[i].calories)} kcal, from your food log. Your ${mealLabel(meal)} has ${meal.foods.map(portionOf).join(", ")}.`
    return { reply: historical ? `Today's log now has it as: ${facts}` : facts, judge: false }
  }
  if (!MEAL_BACKREF.test(message)) return null
  // The chat may only NAME the referent. A composed reply rephrases portions ("200 g of cooked chicken breast"), so a food is
  // named when all its name's words appear; that picks candidates, it never proves identity.
  const coachWords = new Set(words(lastCoach))
  const named = (food: string) => {
    const nameWords = words(food.replace(/\(.*$/, ""))
    return lastCoach.includes(food) || (nameWords.length > 0 && nameWords.every((word) => coachWords.has(word)))
  }
  // "it" points at something that was never about the food log (a food fact, a craving): not ours to answer.
  if (!LOG_TALK.test(lastCoach) && !meals.some((meal) => meal.rows.some((row) => named(row.food)))) return null
  const labels = MEAL_TYPES.filter((meal) => new RegExp(`\\b${mealLabel(meal)}\\b`, "i").test(lastCoach))
  if (labels.length > 1) {
    const present = meals.filter((item) => labels.includes(item.meal))
    return { reply: `Which meal do you mean — ${(present.length > 1 ? present.map(mealLabel) : labels.map(mealLabel)).join(" or ")}?${present.length > 1 ? "" : ` ${listed}`}`, judge: false }
  }
  if (!meals.length) return missing()
  if (!seen) return { reply: `I can't confirm from this chat which logged entry you mean, so I won't guess its numbers. ${listed} Ask about one by name, like “what's in my ${labels[0] ? mealLabel(labels[0]) : "lunch"} now?”`, judge: false }
  // What the last turn discussed: the rows of the meal it named, else the rows whose food it named — as logged back then.
  const then = seen.filter((row) => (labels.length ? row.meal === labels[0] : named(row.food)))
  if (!then.length) return missing()
  const kept = current.filter((row) => then.some((old) => old.id === row.id && old.food === row.food))
  const was = then.map((row) => row.food).join(", ")
  if (!kept.length) {
    if (historical) return missing()
    const slot = labels[0] ?? (new Set(then.map((row) => row.meal)).size === 1 ? then[0].meal : undefined)
    const now = meals.find((meal) => meal.meal === slot)
    if (now) return { reply: `Your ${mealLabel(now)} has changed since we discussed it: the entry we talked about (${was}) is no longer logged, and your ${mealLabel(now)} now has ${now.foods.map(portionOf).join(", ")}. I can't confirm that's the same food, so I won't carry the earlier numbers over. Do you want the numbers for your ${mealLabel(now)} as it is now?`, judge: false, gone: true }
    const lookalike = meals.filter((meal) => meal.rows.some((row) => named(row.food)))
    if (lookalike.length) return { reply: `The entry we talked about (${was}) is no longer in your log. A newer entry with that name is logged under ${lookalike.map(mealLabel).join(" and ")}, but I can't confirm it's the same one, so I won't give its numbers as that meal's. ${listed}`, judge: false, gone: true }
    return missing()
  }
  const where = [...new Set(kept.map((row) => row.meal))]
  if (where.length > 1) return { reply: `Which meal do you mean — ${where.map(mealLabel).join(" or ")}?`, judge: false }
  const meal = meals.find((item) => item.meal === where[0])!
  const gone = then.filter((old) => !kept.some((row) => row.id === old.id))
  const note = [
    labels[0] && meal.meal !== labels[0] ? `That meal is no longer logged as ${mealLabel(labels[0])}.` : "",
    gone.length ? `It has changed since we discussed it: ${gone.map((row) => row.food).join(", ")} ${gone.length > 1 ? "are" : "is"} no longer logged, so this is only what's left of it.` : "",
    kept.length < meal.rows.length ? `Entries added to your ${mealLabel(meal)} since then aren't counted here.` : "",
  ].filter(Boolean).join(" ")
  return answer(meal, note && `${note} `, kept.map((row) => row.id))
}

// A fallback reply may discuss any food, but may only say the user ATE one that is in today's log.
const INTAKE_CLAIM = /(?<!\bif )\byou(?:'ve| have)? (?:ate|eaten|had|logged)\b([^.,;:!?\n]*)/gi
const CLAIM_FILLER = new Set(["and", "the", "for", "with", "some", "today", "far", "your", "meal", "meals", "about", "around", "kcal", "calories", "protein", "carbs", "fat", "total", "breakfast", "lunch", "dinner", "snack", "workout", "pre", "post", "plus", "also", "then", "this", "that", "morning", "afternoon", "evening", "tonight", "earlier", "already", "just", "only", "from", "log", "yet"])
function claimsUnloggedFood(reply: string, ctx: CoachContext): boolean {
  const logged = (ctx.todayMeals ?? []).flatMap((meal) => meal.foods).join(" ").toLowerCase()
  return [...reply.matchAll(INTAKE_CLAIM)].some(([, clause]) => (clause.toLowerCase().match(/\p{L}{3,}/gu) ?? []).some((word) => !CLAIM_FILLER.has(word) && !logged.includes(word)))
}

/** Used when no model is configured (or its reply is unsafe/ungrounded). Built from structured topic + Athlete State only. */
function fallbackCravingReply(topic: NutritionTopic, ctx: CoachContext, buildable: boolean): string {
  const feel = topic.sensoryTargets?.length ? topic.sensoryTargets.join(", ") : "that"
  const remaining = ctx.snapshot.caloriesRemaining > 0 ? ` you have left today (${left(ctx)})` : " you have left today"
  if (topic.food && buildable) {
    return `Wanting ${topic.food} is completely fair, and you don't necessarily need to replace it. If it's the ${feel} hit you're after, I'd keep a measured portion of the real thing and build protein around it. We could keep the real ${topic.food}, use it as a topping or side on a higher-protein base, or do a full high-protein makeover. Want me to fit the real ${topic.food} into what${remaining}?`
  }
  if (topic.food) {
    return `${topic.food} is a fair thing to want. I don't have verified nutrition data for it yet, so I won't invent numbers, but I can suggest ways to get the same ${feel} hit with foods I do have data for. Tell me which direction sounds good.`
  }
  return `A ${feel} craving is easy to work with. Tell me what you're leaning toward, or I can suggest a couple of options that fit what${remaining}.`
}

/** AI-R1E.2: Dante context lines for model prompts. Empty object / empty string when no signal was consumed (prompt unchanged). */
const crossCoachField = (ctx: CoachContext) => (ctx.coordination?.signalLoaded ? { crossCoachContext: ctx.coordination.promptContext.map((p) => p.value) } : {})
const crossCoachRule = (ctx: CoachContext) =>
  ctx.coordination?.signalLoaded ? "\n- crossCoachContext is context from the training/recovery coach, not a verified fact: let it shape what you suggest, but it never overrides the targets, remaining macros, allergies or exclusions, and you must not change any target, plan or log because of it." : ""

type ConverseOptions = {
  intent: NutritionIntent
  topic?: NutritionTopic
  recent: Array<{ role: "user" | "coach"; text: string }>
  signals: PreferenceSignal[]
  craving?: boolean
  withholdDraft?: boolean
  /** The engine just built `draft` for this message; the reply presents it with the retrieved style guidance. */
  built?: { need: KnowledgeNeedDecision }
  budget: TurnBudget
}

/**
 * N1.6.2: optional curated strategy knowledge beneath the conversation layer.
 * The N1.5 intent/topic decide whether it is needed; any failure yields null
 * and the turn continues exactly as it did before retrieval existed.
 */
async function knowledgeFor(message: string, ctx: CoachContext, budget: TurnBudget, options: { intent?: NutritionIntent; topic?: NutritionTopic; need?: KnowledgeNeedDecision; semantic?: boolean }): Promise<NutritionKnowledgeContext | null> {
  try {
    const layer1 = options.need ?? decideNutritionKnowledgeNeed({ message, intent: options.intent })
    // Layer 2 (one bounded model call) only for an uncertain Layer-1 answer, and only on the open-ended chat path.
    // The gate's own 4s race now also CANCELS its provider call instead of leaving it running.
    const gateCall = (prompt: string) => callOpenAiWithFallback(prompt, { tryStart: budget.tryStart, signal: AbortSignal.any([budget.signal, AbortSignal.timeout(SEMANTIC_GATE_TIMEOUT_MS)]) })
    const need = options.semantic ? await resolveUncertainNeed(message, layer1, { call: gateCall }) : layer1
    if (!need.needed) return null
    // Retrieval is optional context: a failed/slow phase answers without it, and the outcome stays visible in `runtime`.
    const retrieved = await boundedDependency(budget, "knowledge_retrieval", () =>
      getOptionalNutritionKnowledgeContext({ need, message, intent: options.intent, topic: options.topic, goal: ctx.snapshot.goal, timezone: ctx.snapshot.timezone }),
      RETRIEVAL_PHASE_MS,
    )
    return retrieved.status === "OK" ? retrieved.value : null
  } catch {
    return null
  }
}

const knowledgeBlock = (knowledge: NutritionKnowledgeContext | null) => (knowledge ? `\n${renderKnowledgeContext(knowledge)}\n` : "")
/** ICH-1: the shared intelligence brief as a prompt block (empty when the turn carries none). */
const intelligenceBlock = (ctx: CoachContext) => (ctx.intelligence?.brief.promptBlock ? `\n${ctx.intelligence.brief.promptBlock}\n` : "")
/** Figures printed in the brief's canonical claims are sourced knowledge, so quoting one is grounded. */
const knowledgeNumbers = (ctx: CoachContext) => ctx.intelligence?.numbers ?? []

async function converse(message: string, ctx: CoachContext, draft: ActiveMealDraft | null, options: ConverseOptions, fallback: string): Promise<string> {
  if (!isOpenAiConfigured()) return fallback

  const knowledge = await knowledgeFor(message, ctx, options.budget, { ...options, need: options.built?.need })
  if (options.built && !knowledge) return fallback
  const draftContext = draft && { name: draft.name, ingredients: draft.ingredients.map((i) => ({ food: i.name, grams: i.grams })), nutrition: draft.nutrition, confidence: draft.confidence, status: draft.status }
  const context = {
    goal: ctx.snapshot.goal,
    remaining: { calories: Math.round(ctx.snapshot.caloriesRemaining), protein: Math.round(ctx.snapshot.proteinRemaining) },
    targets: { calories: Math.round(ctx.snapshot.caloriesTarget), protein: Math.round(ctx.snapshot.proteinTarget) },
    allergies: ctx.guards.allergies,
    excludedFoods: ctx.guards.excludedFoods,
    preferredFoods: ctx.guards.preferredFoods,
    sessionPreferences: options.signals.map((s) => ({ kind: s.kind, value: s.value })),
    currentIntent: options.intent,
    currentTopic: options.topic ?? null,
    // A new topic is not about the draft: withhold it so the model cannot anchor on stale meal context.
    activeMealDraft: options.craving || options.withholdDraft ? null : draftContext,
    ...crossCoachField(ctx),
  }
  const history = options.recent.slice(-4).map((m) => `${m.role === "user" ? "USER" : "COACH"}: ${m.text}`).join("\n")
  const cravingRules = options.craving
    ? `
- This is a CRAVING. Acknowledge the actual food and the sensory goals (currentTopic.sensoryTargets). No food-shaming. Do NOT assume the food must be replaced: lead with keeping a measured portion of the REAL food (e.g. as the base, a topping or a side) and building protein around it, and mention any makeover only as an alternative. Never mention or reuse any previously built meal. Offer 1-3 practical approaches and ask whether they want you to fit it into today's remaining macros. Do not write a recipe or state a meal's macros yet.`
    : ""
  const builtRules = options.built
    ? `
- The deterministic meal engine just built activeMealDraft for THIS request; it is the answer. Its ingredients and numbers are final: present them, keeping the user's requested cuisine/texture through seasoning, herbs, cooking method and serving from NUTRITION KNOWLEDGE. Any added seasoning or sauce is optional and NOT counted in the draft's numbers — say so. Never state a number that is not in CONTEXT.`
    : ""

  const prompt = `You are Dante, the Muscle Fitness coach, answering a nutrition turn with your nutrition tools. You are the only assistant in the app: never refer the user to another coach or assistant.
Rules:
- This turn is about food. Training, workout, recovery or injury questions are routed to your training side, never answered from here: do not give workout advice in this reply. You cannot change workouts or recovery from here.
- Use ONLY the numbers in CONTEXT. Never calculate, estimate or invent calories, macros or totals yourself. Strategy without numbers is fine.
- Never say a meal was logged: logging needs the user to tap Confirm on a log proposal.
- Never suggest compensating for food with exercise, skipping meals, restricting, or "earning" food. Never diagnose.
- Supplements: general evidence education only. If the user mentions a medical condition, pregnancy or any medication, never give a dose, timing, stack or cycle; say that is a question for their doctor or pharmacist.
- The user's CURRENT message decides the topic. activeMealDraft is background context only: talk about it only if the user clearly refers to it, and never repeat it as the answer to a new topic.
- Allergies and excluded foods always win over preferences. Answer naturally in under 110 words.${crossCoachRule(ctx)}${cravingRules}${builtRules}

CONTEXT: ${JSON.stringify(context)}
${knowledgeBlock(knowledge)}${intelligenceBlock(ctx)}${history ? `\nRECENT CONVERSATION:\n${history}\n` : ""}
USER: ${message}`

  try {
    const result = await callOpenAiWithFallback(prompt, options.budget)
    if (!result?.reply) return fallback
    if (isUnsafeCoachReply(result.reply)) return SAFETY_REPLY
    const grounded = [
      context.remaining.calories, context.remaining.protein, context.targets.calories, context.targets.protein,
      ...(draft ? [draft.nutrition.calories, draft.nutrition.protein, draft.nutrition.carbs, draft.nutrition.fat] : []),
      ...(message.match(/\d+(?:\.\d+)?/g) ?? []).map(Number),
      ...knowledgeNumbers(ctx),
    ]
    return hasUngroundedMacros(result.reply, grounded) ? fallback : result.reply
  } catch {
    return fallback
  }
}

const ambiguousTopicSchema = z.object({
  type: z.enum(["CRAVING", "FOOD", "GENERAL_NUTRITION"]),
  food: z.string().trim().min(1).max(80).nullable().optional(),
  sensoryTargets: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
})
const ambiguousTurnSchema = z.object({
  topic: ambiguousTopicSchema,
  reply: z.string().trim().min(1).max(1200),
})

/**
 * Model fallback for messages the deterministic router cannot classify.
 * It may label the current topic only: it cannot edit/build/log or call a tool.
 */
async function resolveAmbiguousTurn(
  message: string,
  ctx: CoachContext,
  recent: Array<{ role: "user" | "coach"; text: string }>,
  signals: PreferenceSignal[],
  lastMealName: string | undefined,
  budget: TurnBudget,
): Promise<{ topic: NutritionTopic; reply: string } | null> {
  if (!isOpenAiConfigured()) return null
  const knowledge = await knowledgeFor(message, ctx, budget, { semantic: true })
  const context = {
    goal: ctx.snapshot.goal,
    remaining: { calories: Math.round(ctx.snapshot.caloriesRemaining), protein: Math.round(ctx.snapshot.proteinRemaining) },
    targets: { calories: Math.round(ctx.snapshot.caloriesTarget), protein: Math.round(ctx.snapshot.proteinTarget) },
    allergies: ctx.guards.allergies,
    excludedFoods: ctx.guards.excludedFoods,
    preferredFoods: ctx.guards.preferredFoods,
    sessionPreferences: signals.map((signal) => ({ kind: signal.kind, value: signal.value })),
    // Name only (no numbers): lets the reply understand "I'm not feeling that anymore" without anchoring on the meal.
    lastDiscussedMeal: lastMealName ?? null,
    // Today's food log, exactly as logged: the only source for "what did I eat" when the planner failed.
    consumedToday: { calories: Math.round(ctx.snapshot.caloriesConsumed), protein: Math.round(ctx.snapshot.proteinConsumed) },
    todayFoodLog: ctx.todayMeals?.map((meal) => ({ meal: meal.meal, calories: meal.calories, protein: meal.protein, foods: meal.foods })) ?? null,
    lastLogged: ctx.lastLogged ?? null,
    ...crossCoachField(ctx),
  }
  const history = recent.slice(-4).map((item) => `${item.role === "user" ? "USER" : "COACH"}: ${item.text}`).join("\n")
  const prompt = `Handle one ambiguous Nutrition Coach turn. Return one JSON object and no prose:
{"topic":{"type":"CRAVING"|"FOOD"|"GENERAL_NUTRITION","food":string|null,"sensoryTargets":("sweet"|"salty"|"crunchy"|"creamy"|"chocolate"|"cold"|"filling")[]},"reply":"natural answer under 110 words"}
CRAVING = wanting a food, cuisine, taste, texture, temperature, or eating experience now.
FOOD = asking about or changing the subject to a named food/cuisine without asking to build a meal.
GENERAL_NUTRITION = a conceptual nutrition question.
The current message is a fresh conversational topic. lastDiscussedMeal is only the NAME of a meal talked about earlier: mention it only if the user's words clearly refer back to it.
If the user greets you or asks what you can do, answer briefly and naturally (meals, cravings, macros, swaps, nutrition questions) instead of reciting commands. Answer the actual question first and keep it casual, not robotic.
Never infer an edit, build, log, or macro calculation. Never say anything was logged.
Use ONLY the numbers in CONTEXT. Never calculate, estimate or invent calories, macros or totals.
What the user ate today comes ONLY from todayFoodLog and lastLogged. Never name a food they did not log; if todayFoodLog is null, say you can't see their log right now.
Allergies and exclusions always win. Never prescribe compensation, restriction, or exercise.
Supplements: general evidence education only. If the user mentions a medical condition, pregnancy or any medication, never give a dose, timing, stack or cycle; say that is a question for their doctor or pharmacist.${crossCoachRule(ctx)}
CONTEXT: ${JSON.stringify(context)}
${knowledgeBlock(knowledge)}${intelligenceBlock(ctx)}${history ? `RECENT CONVERSATION:\n${history}\n` : ""}MESSAGE: ${JSON.stringify(message)}`
  try {
    const result = await callOpenAiWithFallback(prompt, budget)
    if (!result?.reply) return null
    const object = result.reply.match(/\{[\s\S]*\}/)?.[0]
    const parsed = object ? ambiguousTurnSchema.safeParse(JSON.parse(object)) : null
    const data = parsed?.success
      ? parsed.data
      : { topic: { type: "GENERAL_NUTRITION" as const }, reply: result.reply }
    const allowed = [
      context.remaining.calories,
      context.remaining.protein,
      context.targets.calories,
      context.targets.protein,
      context.consumedToday.calories,
      context.consumedToday.protein,
      ...(ctx.todayMeals ?? []).flatMap((meal) => [meal.calories, meal.protein, ...(meal.foods.join(" ").match(/\d+(?:\.\d+)?/g) ?? []).map(Number)]),
      ...(message.match(/\d+(?:\.\d+)?/g) ?? []).map(Number),
      ...knowledgeNumbers(ctx),
    ]
    const reply = isUnsafeCoachReply(data.reply)
      ? SAFETY_REPLY
      : hasUngroundedMacros(data.reply, allowed) || claimsUnloggedFood(data.reply, ctx)
        ? lastResortReply(ctx, { message })
        : data.reply
    const sensoryTargets = (data.topic.sensoryTargets ?? []).filter(
      (target): target is (typeof SENSORY_TARGETS)[number] =>
        SENSORY_TARGETS.includes(target as (typeof SENSORY_TARGETS)[number]),
    )
    return {
      topic: {
        type: data.topic.type,
        ...(data.topic.food ? { food: data.topic.food } : {}),
        ...(sensoryTargets.length ? { sensoryTargets } : {}),
      },
      reply,
    }
  } catch {
    return null
  }
}

const modelResolutionSchema = z
  .object({
    isFollowUp: z.boolean(),
    candidate: z.number().int().min(0).max(5).nullable(),
    intent: z.enum(FOLLOW_UP_INTENTS).nullable(),
    modifier: z.enum(MODIFIERS).nullable().optional(),
    foodText: z.string().trim().max(40).nullable().optional(),
    toText: z.string().trim().max(40).nullable().optional(),
    factor: z.number().min(0.25).max(4).nullable().optional(),
    confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
    isNewTopic: z.boolean(),
    topicHint: z.string().trim().max(60).nullable().optional(),
  })
  .strict()
export type ModelResolution = z.infer<typeof modelResolutionSchema>

/**
 * ONE bounded model call for short follow-ups the deterministic layer could not place. It labels only:
 * is-follow-up, which server-held candidate (by index), intent, response mode inputs, confidence, new-topic hint.
 * It receives meal NAMES (no numbers), cannot call tools, mutate, log, compute, or name an id. Malformed or
 * unexpected output is rejected (null) and the turn continues as ordinary conversation.
 */
export async function resolveFollowUpWithModel(message: string, candidates: MealResultState[], recent: Array<{ role: "user" | "coach"; text: string }>, budget?: TurnBudget): Promise<ModelResolution | null> {
  if (!isOpenAiConfigured()) return null
  const history = recent.slice(-4).map((item) => `${item.role === "user" ? "USER" : "COACH"}: ${item.text.slice(0, 300)}`).join("\n")
  const prompt = `Classify ONE short message in a nutrition chat. Return one JSON object and no prose:
{"isFollowUp":boolean,"candidate":number|null,"intent":${FOLLOW_UP_INTENTS.map((i) => `"${i}"`).join("|")}|null,"modifier":${MODIFIERS.map((i) => `"${i}"`).join("|")}|null,"foodText":string|null,"toText":string|null,"factor":number|null,"confidence":"HIGH"|"MEDIUM"|"LOW","isNewTopic":boolean,"topicHint":string|null}
isFollowUp = the message depends on a meal already discussed. candidate = index into MEALS it refers to, or null if unclear. isNewTopic = the user is moving on to something else (e.g. "tuna is getting boring", "can we try something Asian?").
modifier is for MODIFY_PREVIOUS_RESULT only; foodText/toText name a food the user said (words only); factor is a portion multiplier for ADJUST_QUANTITY.
You cannot change, log or calculate anything. If unsure, use confidence LOW.
MEALS: ${JSON.stringify(candidates.map((meal, index) => ({ index, name: meal.name })))}
${history ? `RECENT CONVERSATION:\n${history}\n` : ""}MESSAGE: ${JSON.stringify(message)}`
  try {
    const result = await callOpenAiWithFallback(prompt, budget)
    const object = result?.reply?.match(/\{[\s\S]*\}/)?.[0]
    const parsed = object ? modelResolutionSchema.safeParse(JSON.parse(object)) : null
    if (!parsed?.success) return null
    const data = parsed.data
    if (data.candidate !== null && data.candidate >= candidates.length) return null
    return data
  } catch {
    return null
  }
}

function withSessionDislikes(ctx: CoachContext, signals: PreferenceSignal[]): CoachContext {
  const dislikes = signals.filter((signal) => signal.kind === "DISLIKE").map((signal) => signal.value)
  if (dislikes.length === 0) return ctx
  return {
    ...ctx,
    guards: {
      ...ctx.guards,
      excludedFoods: [...ctx.guards.excludedFoods, ...dislikes],
    },
  }
}

/** "log option 3 for lunch" / "add number 2 to my food log" / "log the second one" (EN) and "ghi món số 3" (VI). */
const LOG_OPTION = /\b(?:log|add|track|save|record)\s+(?:the\s+)?(?:option|number|no\.?|#|choice)\s*#?\s*([1-8])\b|(?<![\p{L}])(?:ghi|lưu|thêm)\s+(?:món|lựa chọn)\s+(?:số\s+)?([1-8])(?![\p{N}])|\b(?:log|add|track|save|record)\s+the\s+(first|second|third|fourth|fifth|sixth|seventh|eighth)\s+(?:one|option|meal)\b/iu
/** A request verb for meals ("give me", "suggest", "show me"…); "what meals are high in protein?" is a question, not one. */
const DISCOVERY_VERB = /\b(?:give|suggest|show|build|make|recommend|list|find|get|need|want|any)\b/i
/** Vietnamese request verbs ("cho mình 3 món…", "gợi ý vài món…"): JS \b is ASCII-only, so letter lookarounds. */
/** A message written in Vietnamese (diacritics): the engine answers its templates in Vietnamese. */
const VI_TEXT = /[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũỳýỵỷỹ]/i
const DISCOVERY_VERB_VI = /(?<![\p{L}])(?:cho (?:mình|tôi|tao|em|anh|chị)|gợi ý|đề xuất|tư vấn|giới thiệu|muốn ăn|nên ăn)(?![\p{L}])/iu
const PROTEIN_PRIORITY_VI = /(?:nhiều|giàu|cao|thêm) (?:đạm|protein)/iu
const ORDINAL_INDEX: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8 }
/** "the second one" / "the 3rd meal" / "option 2" / "#2": a reference to one option of the list on screen. */
const OPTION_REF = /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|[1-8](?:st|nd|rd|th))\s+(?:one|option|meal|bowl|plate|choice)\b|\b(?:option|number|no\.|#|choice)\s*#?\s*([1-8])\b/i
/** Legacy draft edits: they act on the ACTIVE draft, so they must not run when the user named a different option. */
const ACTIVE_DRAFT_EDITS = new Set(["op", "swap", "swap_missing_target", "remove", "portion", "remove_missing"])

/** A request about "the/this/that <thing>" (recipe, ingredients, steps...) names an existing referent rather than asking for a new meal. */
const DEFINITE_REFERENCE_REQUEST = /(?<![\p{L}\p{N}])(?:the|this|that|its)\s+(?:recipe|ingredients?|steps?|method|instructions?|portion|macros?)(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])how (?:do i|to|can i) (?:make|prepare|cook) (?:it|this|that)(?![\p{L}\p{N}])/iu

/** The orchestration layer's only model access: one bounded text call under the turn budget, null on any failure. */
const orchestrationModelCallFor = (budget: TurnBudget): ModelCall => async (prompt) => {
  try {
    return (await callOpenAiWithFallback(prompt, budget))?.reply ?? null
  } catch {
    return null
  }
}

/**
 * H0: Gemma's provider-attempt design maximum on one turn = follow-up resolver (1) + planner with its one reduced retry (2)
 * + semantic knowledge gate (1) + compose with its one repair (2). Anything past it (the ambiguous-turn fallback chain)
 * gets the deterministic last-resort reply instead of more model calls. The deadline is the route's TurnBudget.
 */
export const GEMMA_MAX_PROVIDER_ATTEMPTS = 6
/** Context load = timezone read, then three parallel reads: two sequential rounds of EARLY_READ_MS each. */
export const GEMMA_CONTEXT_LOAD_MS = 2 * EARLY_READ_MS

export type GemmaRuntimeStatus = "COMPLETED" | "PARTIAL" | "DEPENDENCY_FAILED" | "TIMED_OUT" | "CANCELLED"

/**
 * Terminal status from what actually happened. PARTIAL = answered, but an optional dependency did not deliver;
 * DEPENDENCY_FAILED = a required dependency did not, so no coaching answer was given.
 */
export function gemmaRuntime(budget: TurnBudget, requiredFailed = false) {
  const dependencies = { ...budget.dependencies }
  const status: GemmaRuntimeStatus = budget.clientGone() ? "CANCELLED" : budget.signal.aborted ? "TIMED_OUT" : requiredFailed ? "DEPENDENCY_FAILED" : Object.values(dependencies).some((outcome) => outcome !== "OK") ? "PARTIAL" : "COMPLETED"
  return { status, providerAttempts: budget.counts.provider, providerCap: budget.limit.provider, dependencies }
}

export type NutritionChatInput = { supabase: SupabaseClient; userId: string; body: unknown; now?: Date; /** The route's turn budget (deadline + client abort). Tests may omit it. */ budget?: TurnBudget }

export async function handleNutritionCoachChat({ supabase, userId, body, now = new Date(), budget: routeBudget }: NutritionChatInput): Promise<Response> {
  const turnBudget = routeBudget ?? createTurnBudget()
  turnBudget.limit.provider = GEMMA_MAX_PROVIDER_ATTEMPTS
  const orchestrationModelCall = orchestrationModelCallFor(turnBudget)
  const parsed = nutritionChatBodySchema.safeParse(body)
  if (!parsed.success) return Response.json({ ok: false, error: "Invalid Nutrition Coach request." }, { status: 400 })

  const { message, activeDraft, selectedFoods } = parsed.data
  const state = parsed.data.conversation ?? {}
  const recent = state.recentMessages ?? []
  const priorSignals: PreferenceSignal[] = state.signals ?? []
  const priorConstraints = durableConstraints(state.constraints)
  // The echoed focus outlives the 6-message window; it ends the moment the engine produces a new meal (see `respond`).
  const priorFocus = state.focus?.owner === "CONVERSATION" ? state.focus : null
  // N1.6.4-P2R: what the user was last SHOWN. A client that echoes the snapshot is re-validated against the conversation; one that
  // predates it falls back to the old heuristic once. Either way there is exactly one answer to "which options are selectable?".
  const engineOptionLabels = (state.followUp?.presentedOptions?.options ?? []).map((option) => option.label)
  const engineNames = [activeDraft?.name, ...(state.followUp?.meals ?? []).map((meal) => meal.name), ...engineOptionLabels].filter((name): name is string => Boolean(name))
  const snapshotInput = { recent, followUp: state.followUp, now }
  const priorSnapshot: PresentedOptionSnapshot | null = state.presented !== undefined ? validateSnapshot(state.presented, snapshotInput) : legacySnapshot({ ...snapshotInput, engine: { names: engineNames, optionLabels: engineOptionLabels } })
  const priorPending = state.pending && Date.parse(state.pending.expiresAt) > now.getTime() ? state.pending : null
  let draft: ActiveMealDraft | null = null
  let newTopicFlag = false
  const meta: { resolution: FollowUpResolution | null; viaModel: boolean } = { resolution: null, viaModel: false }
  // AI-R1E.2: stays empty on every safety/scope exit above the context load, and on any load failure.
  let coordination: GemmaCoordination = EMPTY_COORDINATION
  let caloriesRemaining = 0
  // ICH-1: set once the nutrition context has loaded; null on every exit above it.
  const intelligenceRef: { current: CoachContext["intelligence"] } = { current: undefined }
  let canonicalTarget: { calories: number | null; protein: number | null } | null = null
  // Null until the food log has loaded; every exit above it carries the previous turn's snapshot.
  let todayRows: LoggedRow[] | null = null

  /**
   * A pending log survives turns about something else. It ends with a reset, and a not-yet-proposed one ("which meal?")
   * ends when a different meal replaces the one it was about. A proposed action is self-contained, so it survives
   * (confirming it later asks which meal is meant).
   */
  const carriedPendingLog = (nextDraft: ActiveMealDraft | null, ended: boolean): PendingLog | null => {
    const live = isLive(state.pendingLog, now) ? state.pendingLog : null
    if (!live || ended) return null
    return live.stage === "AWAITING_REQUIRED_INPUT" && nextDraft && nextDraft.id !== live.draftId ? null : live
  }

  /** Builds the structured response. The handoff is recomputed from THIS reply, so it can never outlive one user turn. */
  const respond = (
    intent: NutritionIntent,
    route: string,
    reply: string,
    extra: {
      action?: ActionType
      topic?: NutritionTopic
      mealDraft?: ActiveMealDraft | null
      draftTarget?: "NONE" | "ACTIVE" | "NEW"
      pendingMealBuild?: { topic: string; approach?: string } | null
      signals?: PreferenceSignal[]
      toolCalls?: ToolCallSummary[]
      proposal?: ActiveMealDraft | null
      warnings?: NutritionAgentResponse["warnings"]
      alternatives?: ActiveMealDraft[]
      deactivate?: boolean
      label?: string
      /** Explicit follow-up state transition; otherwise derived from the reply (see defaultPatch). */
      followUp?: StatePatch
      blocks?: StructuredBlock[]
      hints?: string[]
      modificationProposal?: MealModificationProposal | null
      genericFallback?: boolean
      safetyBlocked?: boolean
      clarified?: boolean
      orchestration?: OrchestrationDiagnostics
      constraints?: string[]
      focus?: { owner: "CONVERSATION"; item: string | null } | null
      pending?: PendingClarification | null
      foodReference?: ResolvedFoodReference | null
      coordinationNoteApplied?: boolean
      /** undefined = carry the live pending log forward (a topic switch keeps it); null = it ended. */
      pendingLog?: PendingLog | null
      logAction?: NutritionAgentResponse["logAction"]
      foodLogChanged?: boolean
    } = {},
  ): Response => {
    // Final Repair D1: every non-safety reply on a supplement turn leaves as education, whichever path wrote it.
    if (!extra.safetyBlocked && !route.startsWith("safety")) reply = supplementEducationReply(reply, message, recent).reply
    // ICH-1: under a no-dosing posture no dose leaves, and no effect is asserted for a topic with no verified knowledge, whichever path wrote the reply.
    if (intelligenceRef.current && !extra.safetyBlocked && !route.startsWith("safety")) reply = enforceIntegrity(reply, intelligenceRef.current.brief, integrityLanguage(intelligenceRef.current.brief.control.responseLanguage, message))
    if (canonicalTarget && !extra.safetyBlocked && !route.startsWith("safety")) reply = guardCanonicalTargetClaim(reply, canonicalTarget.calories)
    // AI-R1E.2b: the note rides on EVERY mode that answers "what should I eat" (composed chat, follow-ups, active-draft turns), not only
    // the deterministic build. Prefixed so it never joins the last numbered option; skipped on questions back to the user and safety stops.
    const modeNote = !extra.coordinationNoteApplied && !extra.clarified && !extra.pending && !extra.safetyBlocked && asksForMealSuggestion(message) ? coordinationNote(coordination, caloriesRemaining) : null
    if (modeNote) {
      reply = `${modeNote}\n\n${reply}`
      extra = { ...extra, coordinationNoteApplied: true }
    }
    const mealDraft = extra.mealDraft ?? null
    const stillActive = extra.deactivate ? null : (mealDraft ?? draft)
    // Follow-up context moves with the conversation: a new draft is the new referent; a new topic drops the old one.
    const defaultPatch = (): StatePatch => {
      if (extra.deactivate || intent === "RESET_CONTEXT") return { reset: true }
      if (newTopicFlag) return { referent: null, candidateReferents: [], pendingProposal: null, presentedOptions: null }
      if (mealDraft) return { upsertMeals: [mealFromDraft(mealDraft)], referent: draftReferent(mealDraft), newReferent: extra.draftTarget === "NEW", candidateReferents: [], pendingProposal: null }
      if (extra.topic && extra.topic.type !== "MEAL") return { referent: null, candidateReferents: [] }
      return {}
    }
    // COMMIT ORDER (P2R): whatever is stored as selectable is derived from the reply that is actually being returned, never from the
    // candidate the route built before the reply was finalised. A hidden engine choice that is not on screen does not survive.
    const committed = commitEmitted({
      reply,
      blocks: extra.blocks ?? [],
      patch: extra.followUp ?? defaultPatch(),
      prevFollowUp: state.followUp,
      prior: priorSnapshot,
      invalidated: Boolean(extra.deactivate) || intent === "RESET_CONTEXT" || newTopicFlag || Boolean(extra.safetyBlocked) || Boolean(extra.followUp?.reset),
      now,
    })
    const followUp = committed.followUp
    recordFollowUpEvent({
      followUpDetected: Boolean(meta.resolution),
      resolvedIntent: meta.resolution?.intent,
      referentType: (followUp?.referent ?? meta.resolution?.referent)?.type,
      candidateCount: followUp?.candidateReferents.length ?? 0,
      responseMode: newTopicFlag ? "NEW_TOPIC" : meta.resolution?.responseMode,
      resolutionConfidence: meta.resolution?.confidence,
      usedModel: meta.viaModel,
      newTopic: newTopicFlag,
      genericFallback: extra.genericFallback,
      safetyBlocked: extra.safetyBlocked,
      clarified: extra.clarified,
    })
    const payload: NutritionAgentResponse = {
      ok: true,
      coachMode: "nutrition",
      reply,
      intent,
      route,
      topic: extra.topic,
      action: { type: extra.action ?? "NONE", ...(extra.label ? { label: extra.label } : {}) },
      draftTarget: { mode: extra.draftTarget ?? "NONE", ...(extra.draftTarget === "ACTIVE" && (mealDraft ?? draft) ? { draftId: (mealDraft ?? draft)!.id } : {}), ...(extra.draftTarget === "NEW" && mealDraft ? { draftId: mealDraft.id } : {}) },
      mealDraft,
      preferenceSignals: extra.signals ?? [],
      toolCalls: extra.toolCalls ?? [],
      conversation: {
        lastIntent: intent,
        currentTopic: extra.deactivate ? null : (extra.topic ?? state.currentTopic ?? null),
        pendingMealBuild: extra.pendingMealBuild ?? null,
        handoff: detectDraftEditOffer(reply, Boolean(stillActive)) ?? null,
        signals: [...priorSignals, ...(extra.signals ?? [])].slice(-10),
        deactivateDraft: Boolean(extra.deactivate),
        followUp,
        // A fresh meal request, a topic switch or a reset starts the user's constraints over; anything else carries them.
        // The engine producing a meal (or a topic switch / reset) hands the focus back to the engine.
        focus: extra.focus !== undefined ? extra.focus : mealDraft || newTopicFlag || extra.deactivate || intent === "RESET_CONTEXT" ? null : priorFocus,
        constraints: extra.constraints ?? (newTopicFlag || extra.deactivate || intent === "RESET_CONTEXT" || intent === "NEW_MEAL_REQUEST" || intent === "NEW_CRAVING_REQUEST" ? [] : priorConstraints),
        presented: committed.snapshot,
        pending: extra.pending ?? null,
        // A newly resolved food replaces the reference; a new meal, topic switch, reset or safety stop ends it; anything else carries it.
        foodReference: extra.foodReference ?? (mealDraft || newTopicFlag || extra.deactivate || extra.safetyBlocked || intent === "RESET_CONTEXT" ? null : (state.foodReference ?? null)),
        loggedRows: todayRows ?? state.loggedRows ?? null,
        pendingLog: extra.pendingLog !== undefined ? extra.pendingLog : carriedPendingLog(mealDraft, Boolean(extra.deactivate) || intent === "RESET_CONTEXT"),
      },
      logAction: extra.logAction ?? null,
      foodLogChanged: extra.foodLogChanged === true,
      structuredBlocks: committed.blocks,
      referent: followUp?.referent ?? null,
      presentedOptions: followUp?.presentedOptions ?? null,
      followUpHints: (extra.hints ?? []).slice(0, 3),
      modificationProposal: extra.modificationProposal ?? null,
      followUp: meta.resolution ? { intent: meta.resolution.intent, responseMode: newTopicFlag ? "NEW_TOPIC" : meta.resolution.responseMode, confidence: meta.resolution.confidence, viaModel: meta.viaModel } : newTopicFlag ? { responseMode: "NEW_TOPIC", confidence: "HIGH", viaModel: meta.viaModel } : null,
      orchestration: extra.orchestration ?? null,
      coordination: coordination.signalLoaded ? coordinationDiagnostics(coordination, extra.coordinationNoteApplied === true) : null,
      draft: mealDraft,
      proposal: extra.proposal ?? null,
      warnings: extra.warnings ?? [],
      alternatives: extra.alternatives ?? [],
      quickActions: QUICK_ACTIONS,
      runtime: gemmaRuntime(turnBudget),
    }
    return Response.json(payload)
  }

  // A disclosure told to Gemma (allergy, dangerously low intake) — or its retraction — reaches Dante and the meal surfaces
  // (coach_signals), before any safety/scope exit: the turns that stop here are exactly the ones Dante must know about.
  // Bounded and best effort; the reply never depends on it.
  const disclosurePrior = (state.priorUserTurns?.length ? state.priorUserTurns : recent.filter((turn) => turn.role === "user").map((turn) => turn.text)).filter((text, index, all) => !(index === all.length - 1 && text.trim() === message.trim()))
  await boundedDependency(turnBudget, "disclosure_write", () => syncDisclosureSignals({ userId, source: "GEMMA", context: buildContextWorkingSet({ priorUserMessages: disclosurePrior, message }), message, now, getClient: createSupabaseAdminClient }))

  // Safety and scope are decided before any data load or model call. They don't depend on the draft.
  // ICH-1: a self-harm statement belongs to the shared hard-safety layer on either coach surface (it was silently unhandled here).
  const crisis = checkSafety(message, { recentMessages: disclosurePrior.slice(-3) })
  // S0 D-15: so does a dangerous caffeine dose — it was deferred to Dante as "a training question" or met with a soft caution.
  const caffeineOverdose = crisis.category === "dangerous_substance" && Boolean(crisis.matchedPhrase?.startsWith("caffeine"))
  if (crisis.triggered && (crisis.category === "self_harm_crisis" || caffeineOverdose) && crisis.responseOverride) {
    return respond("GENERAL_NUTRITION_QUESTION", caffeineOverdose ? "safety_caffeine_overdose" : "safety_self_harm", crisis.responseOverride, {
      safetyBlocked: true,
      followUp: { referent: null, candidateReferents: [], pendingProposal: null, presentedOptions: null },
      focus: null,
    })
  }

  const early = parseCoachMessage(message, { hasDraft: false })
  if (early.kind === "safety") return respond("GENERAL_NUTRITION_QUESTION", "safety", early.reply)
  if (early.kind === "redirect_training" && !screenSafety(message, { recent })) return respond("GENERAL_NUTRITION_QUESTION", "redirect_training", early.reply)

  // N1.6.4 Phase 2: additive planner-level safety screen. Only ever MORE conservative than the pre-gate above; it ends
  // normal coaching for this turn (no continuation, no macro fitting, no tools) and clears any pending referent.
  const screened = screenSafety(message, { recent })
  const safetyResponse = (screen: NonNullable<typeof screened>) =>
    respond("GENERAL_NUTRITION_QUESTION", `safety_${screen.kind}`, safetyReply(screen, message), {
      safetyBlocked: true,
      followUp: { referent: null, candidateReferents: [], pendingProposal: null, presentedOptions: null },
      focus: null, // a safety stop ends any conversational continuation, including a picked option
    })
  if (screened) return safetyResponse(screened)

  // H0 cluster B: a hormonal/drug-product use-optimisation ask (diet on cycle, support stack, PCT…) gets the same targeted
  // refusal Dante gives, before any meal or macro reasoning. Its continuation keeps the safe help (healthy eating for the goal).
  const pedPrior = (state.priorUserTurns?.length ? state.priorUserTurns : recent.filter((turn) => turn.role === "user").map((turn) => turn.text)).filter((text, index, all) => !(index === all.length - 1 && text.trim() === message.trim()))
  const pedRefusal = restrictedSubstanceReply(message, buildIntelligenceBrief({ message, coach: "GEMMA", priorUserMessages: pedPrior }), /[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũỳýỵỷỹ]/i.test(message) ? "vi" : "en")
  if (pedRefusal) {
    return respond("GENERAL_NUTRITION_QUESTION", "safety_substance", pedRefusal, {
      safetyBlocked: true,
      followUp: { referent: null, candidateReferents: [], pendingProposal: null, presentedOptions: null },
      focus: null,
    })
  }

  // Shared query understanding: whether to train or rest is Dante's decision, not nutrition's. Decided from the frame (phrase-aware,
  // Vietnamese + English), after safety and before any data load or model call, so Gemma can never improvise gym advice.
  const earlyFrame = buildGemmaFrame(message, recent).frame
  if (earlyFrame.deferToDante) return respond("GENERAL_NUTRITION_QUESTION", "defer_to_dante", buildDanteDeferralReply(earlyFrame))

  // H0: bounded like Dante's early reads. A read that times out, fails or is cancelled is a dependency failure (503), never
  // "complete your profile" (422, user-fixable) and never an empty context to coach from.
  const contextRead = await boundedDependency(turnBudget, "nutrition_context", () => loadCoachContext(supabase, userId, now), GEMMA_CONTEXT_LOAD_MS)
  const loaded = contextRead.status === "OK" ? contextRead.value : { ok: false as const, code: contextRead.status === "FAILED" ? ("NUTRITION_CONTEXT_UNAVAILABLE" as const) : ("NUTRITION_CONTEXT_TIMEOUT" as const), message: "I couldn't load your nutrition profile right now, so I won't guess. Please try again in a moment." }
  if (!loaded.ok) {
    const dependencyFailure = loaded.code === "NUTRITION_CONTEXT_UNAVAILABLE" || loaded.code === "NUTRITION_CONTEXT_TIMEOUT"
    // A loader that returned a failed read finished its call ("OK") but did not deliver the context.
    if (dependencyFailure && turnBudget.dependencies.nutrition_context === "OK") turnBudget.dependencies.nutrition_context = "FAILED"
    return Response.json({ ok: false, code: loaded.code, error: loaded.message, runtime: gemmaRuntime(turnBudget, dependencyFailure) }, { status: dependencyFailure ? 503 : 422 })
  }
  // AI-R1E.2 integration point: after auth + rate limit (route) + safety + nutrition context load, before any meal/nutrition reasoning.
  // Read-only; failure degrades to the pre-R1E.2 behaviour.
  coordination = await loadGemmaCoordination(supabase, userId, now)
  // ICH-1: the shared Performance Intelligence brief — the same knowledge, evidence, need policy, safety posture and conversation
  // control Dante consumes, read through the nutrition lens. Pure and deterministic; the canonical goal comes from the snapshot.
  const priorUserMessages = (state.priorUserTurns?.length ? state.priorUserTurns : recent.filter((turn) => turn.role === "user").map((turn) => turn.text)).filter((text, index, all) => !(index === all.length - 1 && text.trim() === message.trim()))
  // Disclosures from either coach (allergy, low intake) join this turn's working set, so the shared policy and output
  // integrity treat them like something said in this chat — e.g. no fish oil for a fish allergy told to Dante.
  const disclosedRead = await boundedDependency(turnBudget, "disclosure_read", () => loadActiveCoachSignalsForDomain(supabase, { userId, targetDomain: "NUTRITION", clearance: GEMMA_CLEARANCE, now }))
  const disclosed = disclosedRead.status === "OK" ? (disclosedRead.value ?? []) : []
  const brief = buildIntelligenceBrief({
    message,
    coach: "GEMMA",
    priorUserMessages,
    // S0 D-01: the stored profile allergies are facts of this answer too, so output integrity enforces them on every reply path.
    context: withStoredAllergies(withDisclosedFacts(buildContextWorkingSet({ priorUserMessages, message }), disclosed, "GEMMA"), loaded.ctx.guards.allergies),
    previousReply: [...recent].reverse().find((turn) => turn.role === "coach")?.text ?? null,
    athlete: { goal: loaded.ctx.snapshot.goal },
    canRetrieve: false,
  })
  const intelligence = { brief, numbers: (brief.promptBlock.match(/\d+(?:\.\d+)?/g) ?? []).map(Number) }
  intelligenceRef.current = intelligence
  // H0 cluster D: an allergy the user disclosed — to Dante (coordination directive) or earlier in THIS chat (working set) —
  // is a hard exclusion for the meal engine, exactly like a stored allergy. Never only a prompt hint.
  const disclosedAllergens = [
    ...coordination.directives.flatMap((directive) => (ALLERGEN_GUARD[directive] ? [ALLERGEN_GUARD[directive]!] : [])),
    ...activeFacts(brief.context).filter((fact) => fact.kind === "ALLERGY" && fact.temporal === "CURRENT").flatMap((fact) => WORKING_SET_ALLERGEN[fact.key] ?? []),
  ]
  const guards = disclosedAllergens.length ? { ...loaded.ctx.guards, allergies: [...new Set([...loaded.ctx.guards.allergies, ...disclosedAllergens])] } : loaded.ctx.guards
  const ctx: CoachContext = { ...loaded.ctx, guards, ...(coordination.signalLoaded ? { coordination } : {}), intelligence }
  caloriesRemaining = ctx.snapshot.caloriesRemaining
  todayRows = ctx.todayMeals ? ctx.todayMeals.flatMap((meal) => meal.rows.map(({ id, food }) => ({ id, meal: meal.meal, food }))).slice(0, 60) : null
  canonicalTarget = { calories: Math.round(ctx.snapshot.caloriesTarget), protein: Math.round(ctx.snapshot.proteinTarget) }
  const targetUtterance = classifyTargetUtterance(message)
  if (targetUtterance.kind !== "NONE") {
    return respond("GENERAL_NUTRITION_QUESTION", "target_truth", targetTruthReply(targetUtterance, canonicalTarget))
  }
  // "What is my daily calorie target?" is answered from the snapshot, never by the model: with both the target and the remaining
  // budget in its context, the model voiced the remaining 1600 kcal as the "daily target" (live, 2026-11-02).
  if (isTargetQuestion(message)) {
    return respond("GENERAL_NUTRITION_QUESTION", "target_truth", targetQuestionReply(ctx.snapshot, /[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũỳýỵỷỹ]/i.test(message) ? "vi" : "en"))
  }
  const planningCtx = withSessionDislikes(ctx, priorSignals)

  draft = activeDraft ? rehydrateDraft(activeDraft, ctx) : null

  // N1.6.4 focus ownership: the newest coach turn is the truth about what the user can see. If the coach wrote its own
  // option list (not the engine's), the engine's stale draft / referent / pending choice must not capture "option 2" or
  // "make it cheaper" — those belong to the conversation (orchestration), which resolves them against the displayed list.
  const conversationOwnsFocus = priorFocus !== null || priorSnapshot?.owner === "CONVERSATION"
  if (conversationOwnsFocus) draft = null

  // 1. Reference resolution — before ANY meal-edit logic.
  const draftReference = resolveDraftReference(message, draft, state.handoff)
  const mealTopic = (d: ActiveMealDraft): NutritionTopic => ({ type: "MEAL", food: d.name })

  // The engine list the user can see right now (the only list "option 3" / "more options" may refer to).
  const liveFollowUp = isFollowUpLive(state.followUp ?? null, now) ? state.followUp! : null
  // A list the coach wrote itself (conversation owns the focus) is not this list: the engine's would be stale there.
  const liveOptions = !conversationOwnsFocus && liveFollowUp?.presentedOptions && Date.parse(liveFollowUp.presentedOptions.expiresAt) > now.getTime() ? liveFollowUp.presentedOptions : null
  const shownMeals = liveOptions ? liveOptions.options.map((option) => liveFollowUp!.meals.find((meal) => meal.id === option.id)).filter((meal): meal is MealResultState => Boolean(meal)) : []
  // "make the second one lower in calories": an ordinal counts over the list ON SCREEN, decided here — never by the model, which
  // saw the meals re-ordered (last referent first, older lists mixed in) and picked option 1 for "second" (live, 2026-11-02).
  const optionRef = shownMeals.length ? message.match(OPTION_REF) : null
  const pinnedIndex = optionRef ? Number(optionRef[2]) || ORDINAL_INDEX[(optionRef[1] ?? "").toLowerCase()] || Number.parseInt(optionRef[1] ?? "", 10) || 0 : 0
  const pinned = pinnedIndex ? { index: pinnedIndex, meal: shownMeals[pinnedIndex - 1] ?? null } : null

  /**
   * Meal discovery — one path for "build me a meal", "give me 5 meals with lean beef" and "more options":
   * criteria (include / exclude, carried as durable `with:` / `without:` constraints) → engine candidates → distinct by
   * ingredient set → N rendered. Discovery always creates a NEW draft: the active one is never edited, saved or logged here.
   */
  const discover = async (input: { foodIds: string[]; unresolvedFoods: string[]; overrides: ConstraintOverrides; proteinPriority: boolean; count: number | null; more: boolean }) => {
    // Exclusions: this turn's ("besides tuna") + the ones still in force from earlier turns, minus any food the user now asks FOR.
    const asked = new Set(input.foodIds)
    const carried = priorConstraints.filter((c) => c.startsWith("without:")).map((c) => c.slice("without:".length))
    const exclusionTerms = [...new Set([...excludedFoodsIn(message).terms, ...carried])].filter((term) => !resolveFoods([term]).ids.some((id) => asked.has(id)))
    const excludedIds = resolveFoods(exclusionTerms).ids
    // Inclusions: what this turn names; "more options" with no food named continues the last discovery's foods.
    const carriedInclude = priorConstraints.filter((c) => c.startsWith("with:")).map((c) => c.slice("with:".length))
    const include = (input.more && input.foodIds.length === 0 ? carriedInclude : input.foodIds).filter((id) => !excludedIds.includes(id) && getIngredient(id))
    const buildCtx = exclusionTerms.length ? { ...planningCtx, guards: { ...planningCtx.guards, excludedFoods: [...planningCtx.guards.excludedFoods, ...exclusionTerms] } } : planningCtx
    // "lots of protein" / "protein-heavy" is a modifier: raise the protein target unless the user gave an explicit number.
    // Still one meal's worth: a quarter above the per-meal share, never half the day's protein in one sitting.
    const overrides = input.proteinPriority && input.overrides.proteinTarget === undefined ? { ...input.overrides, proteinTarget: Math.min(60, Math.round(oneMealBudget(ctx.snapshot).protein * 1.25)) } : input.overrides
    const count = input.count ?? (input.more ? 5 : null)
    // "More" avoids every meal this discovery has shown — all its lists, not only the last one (live: "another five" re-showed list 1).
    const priorShown = input.more ? [...(liveFollowUp?.shownKeys ?? []), ...shownMeals.map((meal) => compositionKey(meal.items))] : []
    const avoidKeys = input.more ? new Set(priorShown) : undefined
    // A singular request keeps the original single-meal ranking (recommendation + 2 alternatives); discovery asks for N distinct.
    const slotPreference = /\bbreakfast\b|(?<![\p{L}])(?:bữa sáng|ăn sáng)(?![\p{L}])/iu.test(message) ? { preferFamily: "yogurt_bowl" } : {}
    const discovery = count !== null || input.more ? { alternatives: Math.max(4, (count ?? 3) - 1), avoidKeys, ...slotPreference } : slotPreference
    // A multi-meal request never anchors on a stale food selection: it uses only the foods named now (or carried by "more").
    const legacySelection = count === null && !input.more ? (input.foodIds.length > 0 ? input.foodIds : (selectedFoods ?? [])).filter((id) => !excludedIds.includes(id)) : []
    let result =
      include.length > 0 && (count !== null || input.more)
        ? buildNextMeal(buildCtx, "BALANCED", overrides, "conversation", { ...discovery, requireIds: include })
        : legacySelection.length > 0
          ? chooseMyFood(buildCtx, legacySelection, "BALANCED", overrides, "conversation")
          : buildNextMeal(buildCtx, "BALANCED", overrides, "conversation", discovery)
    // A named food no meal template uses (e.g. salmon): fall back to building from that food alone rather than refusing.
    if (!result.ok && result.code === "NO_CANDIDATE" && include.length > 0 && !input.more) result = chooseMyFood(buildCtx, include, "BALANCED", overrides, "conversation")
    const constraints = [...exclusionTerms.map((term) => `without:${term}`), ...include.map((id) => `with:${id}`)]
    const skipped = input.unresolvedFoods.length > 0 ? ` I don't have verified nutrition data for ${input.unresolvedFoods.join(", ")}, so I left ${input.unresolvedFoods.length > 1 ? "them" : "it"} out.` : ""
    const toolCalls: ToolCallSummary[] = [{ name: "meal_optimizer", ok: result.ok }]
    if (!result.ok) return respond("NEW_MEAL_REQUEST", "build", `${result.message}${skipped}`, { mealDraft: result.closest ?? null, draftTarget: result.closest ? "NEW" : "NONE", action: result.closest ? "CREATE_MEAL_DRAFT" : "NONE", toolCalls, constraints })
    const presented = presentOptions(result.draft, result.alternatives, now, count ?? 3)
    const rendered = presented?.choice.options.length ?? 1
    const withText = include.length ? ` with ${include.map((id) => getIngredient(id)!.shortName.toLowerCase()).join(" and ")}` : ""
    const withoutText = exclusionTerms.length ? ` and no ${exclusionTerms.join(" or ")}` : ""
    const vi = VI_TEXT.test(message)
    const intro =
      (count !== null || input.more) && vi
        ? `Đây là ${rendered} món khác nhau${input.more ? " bạn chưa xem" : ""}. Món 1 đã mở thành bản nháp mới${draft ? "; bản nháp trước của bạn không bị thay đổi" : ""}. `
        : count !== null || input.more
        ? `Here ${rendered === 1 ? "is 1 meal" : `are ${rendered} distinct meals`}${withText}${withoutText}${input.more ? " you haven't seen yet" : ""} — each one's portions and macros are computed from its ingredients. Option 1 is open as a new draft${draft ? "; your earlier draft wasn't changed" : ""}. `
        : ""
    const shortfall = count !== null && rendered < count ? ` You asked for ${count}; these are all the distinct meals the verified foods allow${withText}${withoutText} right now, so I didn't pad the list.` : ""
    // Vietnamese request → Vietnamese engine copy (live: "gợi ý cho mình 3 món…" got an English reply). Numbers are the draft's own.
    const viCeiling = result.draft.constraints.calorieCeiling
    const engineReply = vi
      ? `${result.draft.name}: khoảng ${Math.round(result.draft.nutrition.calories)} kcal và ${Math.round(result.draft.nutrition.protein)} g protein${viCeiling !== null && result.draft.constraints.calorieCeilingSource === "context" && ctx.snapshot.caloriesRemaining > viCeiling + 50 ? ` — tính cho một bữa (tối đa ${Math.round(viCeiling)} kcal), không phải toàn bộ ${Math.round(ctx.snapshot.caloriesRemaining)} kcal còn lại trong ngày` : ""}. Khẩu phần và macro được tính từ nguyên liệu, không do AI đoán.`
      : `${result.message}${whyLines(result.draft, ctx)}`
    // The engine owns ingredients and numbers; a named cuisine/texture only shapes how the draft is presented.
    const buildNeed = decideMealBuildKnowledgeNeed(message)
    const modelReply = buildNeed.needed
      ? await converse(message, ctx, result.draft, { budget: turnBudget, intent: "NEW_MEAL_REQUEST", recent, signals: priorSignals, built: { need: buildNeed } }, engineReply)
      : engineReply
    // FINAL-RESPONSE VALIDATION (before anything is committed): the model may re-voice the engine's meal, but a list of its OWN options
    // would put a second, different set of choices on screen beside the engine's. The engine owns this turn's options: such a reply is replaced.
    const written = parseOptions(modelReply)
    const reply = written.length >= 2 && !listMatchesEngine(written, presented?.choice.options.map((option) => option.label) ?? []) ? engineReply : modelReply
    // AI-R1E.2: deterministic, number-free-of-invention note; the canonical remaining budget outranks any signal.
    const note = coordinationNote(coordination, ctx.snapshot.caloriesRemaining)
    // The count, criteria and any shortfall are engine facts: they frame whatever wording presents option 1.
    return respond("NEW_MEAL_REQUEST", "build", `${intro}${reply}${shortfall}${skipped}${note ? ` ${note}` : ""}`, {
      coordinationNoteApplied: Boolean(note),
      action: "CREATE_MEAL_DRAFT",
      draftTarget: "NEW",
      mealDraft: result.draft,
      alternatives: result.alternatives,
      topic: mealTopic(result.draft),
      toolCalls,
      constraints,
      followUp: {
        upsertMeals: presented?.meals ?? [mealFromDraft(result.draft)], referent: draftReferent(result.draft), newReferent: true, candidateReferents: [], presentedOptions: presented?.choice ?? null, pendingProposal: null, lastResolved: null,
        shownKeys: [...new Set([...(presented?.meals ?? [mealFromDraft(result.draft)]).map((meal) => compositionKey(meal.items)), ...priorShown])],
      },
      blocks: presented ? [presented.block] : [],
      hints: ["ingredients?", "more options", "log option 1"],
    })
  }

  // "log option 3 for lunch" / "log the second one": the candidate comes from the list on screen, then the normal P0 lifecycle.
  const logOption = conversationOwnsFocus ? null : message.match(LOG_OPTION)
  let candidate: ActiveMealDraft | null = null
  if (logOption) {
    const index = Number(logOption[1] ?? logOption[2]) || ORDINAL_INDEX[(logOption[3] ?? "").toLowerCase()] || 0
    const meal = shownMeals[index - 1]
    if (!meal) {
      const reply = shownMeals.length
        ? `There's no option ${index} in the list I just showed (1–${shownMeals.length}), so nothing was saved. Which one did you mean?`
        : "I don't have a current list of options to pick from, so nothing was saved. Ask me for some meals first, or say “log this” for the meal on screen."
      return respond("LOG_MEAL", "log_action", reply, { pendingLog: null, draftTarget: draft ? "ACTIVE" : "NONE" })
    }
    candidate = draftForMeal(meal, ctx, null, { fresh: true })
  }
  // "Log it" right after talking about another option ("make the second one lighter"): "it" is that option — the conversation's
  // last referent — not the draft left open earlier (live: option 3 was logged). Never while a log is already waiting.
  const referentMeal = !logOption && !conversationOwnsFocus && liveFollowUp?.referent?.type === "MEAL_RESULT" && liveFollowUp.referent.id !== draft?.id && LOG_REQUEST.test(message) && !isLive(state.pendingLog, now)
    ? liveFollowUp.meals.find((meal) => meal.id === (liveFollowUp.referent as { id: string }).id)
    : undefined
  const unappliedChange = Boolean(referentMeal && liveFollowUp?.pendingProposal?.sourceMealResultId === referentMeal.id)
  if (referentMeal) candidate = draftForMeal(referentMeal, ctx, null, { fresh: true })

  // P0 chat-driven meal log: a live pending log (or a new "log this") is resolved before any follow-up / model path, so a
  // typed "lunch" or "confirm" can never fall through to a re-voiced recommendation. Writes only via the pending-action CAS.
  const competingProposal = !conversationOwnsFocus && Boolean(state.followUp?.pendingProposal) && isFollowUpLive(state.followUp ?? null, now)
  const logTurn = await handleLogTurn({ supabase, userId, message, now, budget: turnBudget, ctx, draft, pending: state.pendingLog, competingProposal, candidate })
  if (logTurn) {
    const note = unappliedChange && logTurn.pendingLog?.stage !== "VERIFIED" ? "The change I proposed for it wasn't applied, so this is the meal as shown. " : ""
    return respond("LOG_MEAL", "log_action", `${note}${logTurn.reply}`, {
      pendingLog: logTurn.pendingLog,
      logAction: { stage: logTurn.trace.at(-1) ?? null, trace: logTurn.trace, foodLogId: logTurn.foodLogId ?? null },
      foodLogChanged: logTurn.foodLogChanged,
      action: logTurn.pendingLog?.stage === "READY_FOR_CONFIRMATION" || logTurn.pendingLog?.stage === "AWAITING_REQUIRED_INPUT" ? "PROPOSE_LOG" : "NONE",
      ...(logTurn.draft ? { mealDraft: logTurn.draft, draftTarget: "NEW" as const, topic: mealTopic(logTurn.draft) } : { draftTarget: draft ? ("ACTIVE" as const) : ("NONE" as const), ...(draft ? { topic: mealTopic(draft) } : {}) }),
    })
  }

  // "more options" / "give me lots of choice" / "another high protein meals": continue the LAST discovery with new, unseen
  // meals — never re-voice the one meal in the draft. Only when a discovery is actually in play (a live engine list or its criteria).
  if (MORE_OPTIONS.test(message) && (liveOptions || priorConstraints.some((c) => c.startsWith("with:")))) {
    const excluded = excludedFoodsIn(message).ids
    return discover({ foodIds: foodsNamedIn(message).filter((id) => !excluded.includes(id)), unresolvedFoods: [], overrides: {}, proteinPriority: true, count: requestedOptionCount(message), more: true })
  }
  // An explicit multi-meal request ("give me some meals with tuna", "suggest 3 high protein meals") is a NEW discovery: it
  // goes straight to the engine, so a list or draft still on screen can't route it to a follow-up / model answer instead.
  const discoveryCount = requestedOptionCount(message)
  if (discoveryCount !== null && (DISCOVERY_VERB.test(message) || DISCOVERY_VERB_VI.test(message)) && dayLevelCalorieProposal(message) === null) {
    const parsed = parseCoachMessage(message, { hasDraft: false })
    if (parsed.kind === "build") return discover({ foodIds: parsed.foodIds, unresolvedFoods: parsed.unresolvedFoods, overrides: parsed.overrides, proteinPriority: parsed.proteinPriority || PROTEIN_PRIORITY_VI.test(message), count: discoveryCount, more: false })
    // "cho mình 3 món tối nhiều đạm": the English parser can't read it as a build, but the count + request verb already say it is one
    // (live: it fell to the open model, which listed number-free dishes). Same engine, no foods named.
    if (parsed.kind === "chat" && DISCOVERY_VERB_VI.test(message)) return discover({ foodIds: foodsNamedIn(message), unresolvedFoods: [], overrides: {}, proteinPriority: PROTEIN_PRIORITY_VI.test(message), count: discoveryCount, more: false })
  }

  // 1b. N1.5.6 follow-up continuity: proposal answer -> explicit new topic -> clarification answer -> short follow-up.
  // The legacy deterministic draft editor keeps every message it already handled ("make this bowl under 400 calories").
  // The engine's pending choice is selectable only while it IS the displayed snapshot: a hidden candidate list is invisible to the resolver.
  const followState = conversationOwnsFocus || !state.followUp ? null : { ...state.followUp, presentedOptions: priorSnapshot?.owner === "ENGINE" ? state.followUp.presentedOptions : null }
  const execInput = { ctx: planningCtx, activeDraft: draft, state: followState, now }
  const legacyHandles = draftReference.bound && parseCoachMessage(message, { hasDraft: true }).kind !== "chat"
  // "make the fifth one lower in fat" with three options on screen: ask, never fall back to another meal (the option-aimed
  // modifier is resolved by the fast path below, so this guard must come first).
  if (pinned && !pinned.meal) {
    return respond("GENERAL_NUTRITION_QUESTION", "followup_clarify", `There's no option ${pinned.index} in the list I just showed (1–${shownMeals.length}). Which one did you mean?`, { clarified: true })
  }
  const resolvedTurn = resolveTurn({ message, state: followState, activeDraft: draft ? mealFromDraft(draft) : null, topicType: state.currentTopic?.type ?? null, now, legacyHandles })
  // While the conversation owns the focus there is no engine meal to follow up on ("what goes in it?" is about the option the
  // user picked): engine follow-up intents step aside; an explicit new topic still applies.
  // Shared query understanding: "what about 200g?" / "give me the macro" ask ABOUT a food the conversation already named. The
  // keyword layers read "what about X" as a new craving topic and "give me ... macro" as a meal-build request; the frame (which
  // resolves the food from history) routes both to orchestration + the shared food resolver instead.
  const asksFoodInformation = FOOD_INFORMATION_INTENTS.has(earlyFrame.intent)
  const turn: TurnResolution = (conversationOwnsFocus && resolvedTurn.kind === "follow_up") || (asksFoodInformation && resolvedTurn.kind === "new_topic") ? { kind: "none" } : resolvedTurn

  // "The other one" against the engine's displayed list is answered from that snapshot only. A guess is still a guess, so every
  // remaining displayed alternative is named and the user picks (the pick then goes through the normal clarification answer).
  if (!conversationOwnsFocus && priorSnapshot?.owner === "ENGINE" && OTHER_REF.test(message) && turn.kind !== "proposal_decision") {
    const referent = followState?.referent
    const activeId = draft?.id ?? (referent && "id" in referent ? referent.id : null)
    const others = priorSnapshot.options.filter((option) => option.entityId !== activeId)
    if (others.length > 0) {
      const names = others.map((option) => option.label)
      const question = names.length === 1 ? `Do you mean ${names[0]}?` : `Which one do you mean: ${names.length === 2 ? names.join(" or ") : `${names.slice(0, -1).join(", ")}, or ${names[names.length - 1]}`}?`
      const candidates = others.map((option) => ({ type: "MEAL_RESULT", id: option.entityId, name: option.label }) as const)
      return respond("GENERAL_NUTRITION_QUESTION", "clarify_other", question, {
        clarified: true,
        blocks: [{ type: "CLARIFICATION", question, options: names }],
        followUp: {
          candidateReferents: [...candidates],
          clarification: { question, candidateReferents: [...candidates], expectedResponseType: "OPTION_SELECTION", expiresAt: new Date(now.getTime() + PROPOSAL_TTL_MS).toISOString(), pendingIntent: { intent: "SELECT_PREVIOUS_OPTION", args: {} } },
        },
      })
    }
  }

  const respondExec = (exec: FollowUpExec, resolved: TurnResolution, viaModel = false): Response => {
    const ingredientBlock = exec.blocks.find((block) => block.type === "INGREDIENT_LIST")
    if (exec.route === "followup_ingredients" && ingredientBlock?.type === "INGREDIENT_LIST" && VI_TEXT.test(message)) {
      const basis: Record<string, string> = { raw: "sống", cooked: "đã nấu", "as eaten": "khi ăn" }
      exec = { ...exec, reply: `${ingredientBlock.mealName} — ${ingredientBlock.items.map((item) => `${item.name} ${item.grams} g${item.basis ? ` (${basis[item.basis] ?? item.basis})` : ""}`).join(", ")}. Mỗi khối lượng là theo trạng thái mà số liệu được tính (sống, đã nấu hoặc khi ăn), nên hãy cân đúng trạng thái đó.` }
    }
    if (exec.route === "followup_select" && exec.mealDraft && VI_TEXT.test(message)) {
      const n = exec.mealDraft.nutrition
      exec = { ...exec, reply: `Chọn ${exec.mealDraft.name} — khoảng ${Math.round(n.calories)} kcal, ${Math.round(n.protein)} g protein, ${Math.round(n.carbs)} g carb và ${Math.round(n.fat)} g chất béo. Bạn muốn xem nguyên liệu hay chỉnh gì không?` }
    }
    meta.resolution = resolved.kind === "follow_up" ? resolved.resolution : meta.resolution
    meta.viaModel = viaModel
    const referent = exec.patch.referent ?? (resolved.kind === "follow_up" ? resolved.resolution.referent : null)
    const topic: NutritionTopic | undefined = exec.mealDraft ? mealTopic(exec.mealDraft) : referent && (referent.type === "MEAL_DRAFT" || referent.type === "MEAL_RESULT") ? { type: "MEAL", food: referent.name } : undefined
    return respond(exec.envelopeIntent, exec.route, exec.reply, {
      action: exec.action,
      draftTarget: exec.draftTarget,
      mealDraft: exec.mealDraft,
      proposal: exec.proposal,
      warnings: exec.warnings,
      toolCalls: exec.toolCalls,
      topic,
      followUp: exec.patch,
      blocks: exec.blocks,
      hints: exec.hints,
      modificationProposal: exec.modificationProposal,
      safetyBlocked: exec.safetyBlocked,
      clarified: exec.clarified,
    })
  }

  if (turn.kind === "proposal_decision") return respondExec(decideProposal(turn, execInput), turn)
  if (turn.kind === "follow_up") return respondExec(executeFollowUp(turn, execInput), turn)
  const newTopic: NewTopic | null = turn.kind === "new_topic" ? turn.topic : null
  newTopicFlag = Boolean(newTopic)
  // NEW TOPIC != OLD REFERENT BINDING: a stated topic switch never binds the old draft.
  const reference = newTopic ? { ...draftReference, bound: false } : draftReference

  const edit = async (op: DraftOp, route: string): Promise<Response> => {
    if (!draft) return respond("EDIT_ACTIVE_DRAFT", route, "There's no active meal draft yet. Want me to build one around your remaining macros?", { action: "ASK_BEFORE_BUILD" })
    const result = applyDraftOp(ctx, draft, op)
    // A sensory edit ("make this meal crunchier") is engine-owned; the technique advice comes from retrieved guidance (Texture Hacks > Crunch).
    // The engine's numbers stay final and the model only presents them.
    const sensoryNeed = result.applied && op.type === "add" ? decideMealBuildKnowledgeNeed(message) : null
    const reply = sensoryNeed?.needed ? await converse(message, ctx, result.draft, { budget: turnBudget, intent: "EDIT_ACTIVE_DRAFT", recent, signals: priorSignals, built: { need: sensoryNeed } }, result.message) : result.message
    return respond("EDIT_ACTIVE_DRAFT", route, reply, {
      action: result.applied ? "UPDATE_MEAL_DRAFT" : "NONE",
      draftTarget: "ACTIVE",
      mealDraft: result.draft,
      proposal: result.proposal,
      warnings: result.warnings,
      topic: mealTopic(result.draft),
      toolCalls: [{ name: "draft_editor", ok: result.applied }],
    })
  }

  // 2. One-turn handoff: "Want me to make this cheaper?" -> "Yes."
  const accepted = draft ? acceptedOffer(message, state.handoff) : null
  if (accepted) return edit(accepted, accepted.type)
  if (draft && state.handoff && isAffirmation(message)) {
    return respond("EDIT_ACTIVE_DRAFT", "handoff_ask", "Sure — what would you like to change: a swap, the portions, the calories, or the flavor?", { draftTarget: "ACTIVE", topic: mealTopic(draft) })
  }

  // 3. Conversation intent (craving, preference, log, reset, macro question, substitution question).
  // "how much protein is in 150 g of that?" names no food of its own: the legacy calculator would look up a food called "that".
  // When the frame read the turn as pointing back at an earlier food (resolved or not), orchestration owns it.
  const classified = classifyConversation(message, { reference, state })
  const macroUnresolved = classified?.intent === "MACRO_CALCULATION" && !classified.ingredientId
  const conv = macroUnresolved ? null : classified
  if (conv) {
    switch (conv.intent) {
      case "RESET_CONTEXT":
        return respond("RESET_CONTEXT", "reset", draft ? `No problem — I've set “${draft.name}” aside. Nothing was logged and your food log is untouched. What would you like to work on instead?` : "No problem — starting fresh. What would you like to work on?", { deactivate: Boolean(draft) })

      case "LOG_MEAL":
        // With a draft in view the log turn above answered (meal type → confirm → write). Here there is nothing to log.
        return respond("LOG_MEAL", "log", "There's no active meal draft to log yet. Want me to build one first?", { action: "ASK_BEFORE_BUILD" })

      case "PREFERENCE_UPDATE": {
        const [signal] = conv.signals
        const text =
          signal.kind === "DISLIKE" ? `Got it — no ${signal.value} for me to suggest in this chat. (Allergies and exclusions are managed in your profile.)`
          : signal.kind === "CRAVING_PATTERN" ? `Good to know — ${signal.value}${signal.context ? ` tends to show up in the ${signal.context}` : " is a recurring one"}. We can plan a spot for it in your day instead of fighting it.`
          : signal.kind === "PREFERRED_TEXTURE" ? `Noted — I'll lean toward ${signal.value} foods in this chat.`
          : `Noted — you like ${signal.value}. I'll keep that in mind in this chat.`
        return respond("PREFERENCE_UPDATE", "preference", text, { signals: conv.signals })
      }

      case "MACRO_CALCULATION": {
        const ingredient = conv.ingredientId ? getIngredient(conv.ingredientId) : undefined
        if (!ingredient) return respond("MACRO_CALCULATION", "macro_calc", `I don't have verified nutrition data for ${conv.food}, so I won't guess its numbers.`)
        const t = totalsFor([{ ingredientId: ingredient.id, grams: conv.grams }])
        const note = ingredient.source === "VERIFIED" ? "" : " (a curated estimate — real products vary)"
        return respond("MACRO_CALCULATION", "macro_calc", `${conv.grams} g ${ingredient.name}: about ${Math.round(t.calories)} kcal, ${Math.round(t.protein)}g protein, ${Math.round(t.carbs)}g carbs, ${Math.round(t.fat)}g fat${note}.`, { topic: { type: "FOOD", food: ingredient.name }, toolCalls: [{ name: "macro_calculator", ok: true }] })
      }

      case "FOOD_SUBSTITUTION":
        return respond("FOOD_SUBSTITUTION", "substitution", await converse(message, ctx, draft, { budget: turnBudget, intent: "FOOD_SUBSTITUTION", topic: conv.topic, recent, signals: priorSignals, withholdDraft: true }, lastResortReply(ctx)), { topic: conv.topic })

      case "NEW_CRAVING_REQUEST": {
        const food = conv.topic.food
        if (!conv.build) {
          // Acknowledge first. No optimizer, no draft; the old draft stays untouched.
          const buildable = Boolean(food && detectCravingKey(food))
          const fallback = fallbackCravingReply(conv.topic, ctx, buildable)
          const reply = await converse(message, ctx, draft, { budget: turnBudget, intent: "NEW_CRAVING_REQUEST", topic: conv.topic, recent, signals: priorSignals, craving: true }, fallback)
          return respond("NEW_CRAVING_REQUEST", "craving_ask", reply, {
            action: food && !buildable ? "NONE" : "ASK_BEFORE_BUILD",
            topic: conv.topic,
            pendingMealBuild: food && buildable ? { topic: food } : null,
          })
        }
        if (!conv.key) return respond("NEW_CRAVING_REQUEST", "craving_build", `I don't have verified nutrition data for ${food}, so I can't build exact numbers around it yet.`, { topic: conv.topic })
        const built = buildCravingDraft(planningCtx, conv.key, "conversation")
        if (built.status === "BLOCKED") return respond("NEW_CRAVING_REQUEST", "craving_build", built.reason, { topic: conv.topic })
        const comparison = built.draft.craving?.comparison[0] ?? ""
        return respond("NEW_CRAVING_REQUEST", "craving_build", `${summarize(built.draft)} ${comparison} Want me to adjust anything — the portion, the sweetness, or the protein?`.replace(/\s+/g, " "), {
          action: "CREATE_MEAL_DRAFT",
          draftTarget: "NEW",
          mealDraft: built.draft,
          topic: conv.topic,
          toolCalls: [{ name: "cravings_engine", ok: true }],
        })
      }
    }
  }

  // 3b. An explicit switch to a concrete food ("actually I want pizza") is a fresh craving topic: acknowledge, never anchor on the old meal.
  if (newTopic?.food) {
    const topic: NutritionTopic = { type: "CRAVING", food: newTopic.food, sensoryTargets: sensoryTargetsFor(message, newTopic.food) }
    const buildable = Boolean(detectCravingKey(newTopic.food))
    const reply = await converse(message, ctx, draft, { budget: turnBudget, intent: "NEW_CRAVING_REQUEST", topic, recent, signals: priorSignals, craving: true }, fallbackCravingReply(topic, ctx, buildable))
    return respond("NEW_CRAVING_REQUEST", "craving_ask", reply, { action: buildable ? "ASK_BEFORE_BUILD" : "NONE", topic, pendingMealBuild: buildable ? { topic: newTopic.food } : null })
  }

  // 4. Deterministic parser. The draft is a candidate target ONLY when reference resolution bound it.
  const parsedIntent = parseCoachMessage(message, { hasDraft: reference.bound })
  // "give me the recipe" / "how do I make it" refers to the option the coach just showed, not a request for a NEW engine meal:
  // when the conversation owns the focus, a definite-reference build request goes to orchestration (which holds the pick and
  // the active constraints) instead of the engine builder (which would invent an unrelated meal).
  const editsOtherOption = Boolean(pinned) && pinned!.meal?.id !== draft?.id && ACTIVE_DRAFT_EDITS.has(parsedIntent.kind)
  const intent: typeof parsedIntent = editsOtherOption || (asksFoodInformation && parsedIntent.kind === "build") || (conversationOwnsFocus && parsedIntent.kind === "build" && parsedIntent.foodIds.length === 0 && parsedIntent.unresolvedFoods.length === 0 && DEFINITE_REFERENCE_REQUEST.test(message)) ? { kind: "chat" } : parsedIntent

  // Only an edit needs a draft: "was that meal suitable for my goal?" asks about a meal (often a logged one) and goes on.
  if (intent.kind === "chat" && reference.explicit && !draft && parseCoachMessage(message, { hasDraft: true }).kind !== "chat") {
    return respond("NEW_MEAL_REQUEST", "no_draft", "There's no active meal draft yet. Want me to build one around your remaining macros?", { action: "ASK_BEFORE_BUILD" })
  }

  switch (intent.kind) {
    case "safety":
    case "redirect_training":
      return respond("GENERAL_NUTRITION_QUESTION", intent.kind, intent.reply)

    case "build": {
      const proposedDay = dayLevelCalorieProposal(message)
      const canonicalCalories = Math.round(ctx.snapshot.caloriesTarget)
      const canonicalProtein = Math.round(ctx.snapshot.proteinTarget)
      if (proposedDay !== null && canonicalCalories > 0 && proposedDay !== canonicalCalories) {
        return respond(
          "NEW_MEAL_REQUEST",
          "build",
          `Your current target stays ${canonicalCalories} kcal and ${canonicalProtein} g protein. I won't build a day around ${proposedDay} kcal, and another person's number doesn't change it.`,
        )
      }
      return discover({ foodIds: intent.foodIds, unresolvedFoods: intent.unresolvedFoods, overrides: intent.overrides, proteinPriority: intent.proteinPriority, count: requestedOptionCount(message), more: false })
    }

    case "craving": {
      // Reached only if the conversation layer declined; treat as a conversational craving, never an automatic draft.
      const topic: NutritionTopic = { type: "CRAVING" }
      return respond("NEW_CRAVING_REQUEST", "craving_ask", await converse(message, ctx, draft, { budget: turnBudget, intent: "NEW_CRAVING_REQUEST", topic, recent, signals: priorSignals, craving: true }, fallbackCravingReply(topic, ctx, false)), { action: "ASK_BEFORE_BUILD", topic })
    }

    case "swap": {
      const from = resolveFoods([intent.fromText]).ids[0]
      const to = resolveFoods([intent.toText]).ids[0]
      if (!from || !to) return respond("EDIT_ACTIVE_DRAFT", "swap", `I don't have verified nutrition data for ${!from ? intent.fromText : intent.toText}, so I can't swap it without guessing.`, { draftTarget: "ACTIVE" })
      return edit({ type: "swap", from, to }, "swap")
    }

    case "swap_missing_target":
      return respond("EDIT_ACTIVE_DRAFT", "swap_missing_target", `What should replace the ${intent.text}? Tell me a food and I'll recalculate exactly.`, { draftTarget: "ACTIVE" })

    case "remove": {
      const id = resolveFoods([intent.text]).ids[0]
      if (!id || !draft?.ingredients.some((i) => i.ingredientId === id)) return respond("EDIT_ACTIVE_DRAFT", "remove", "That isn't in this meal, so nothing changes.", { draftTarget: "ACTIVE" })
      return edit({ type: "remove", ingredientId: id }, "remove")
    }

    case "portion": {
      const id = resolveFoods([intent.text]).ids[0]
      const item = draft?.ingredients.find((i) => i.ingredientId === id)
      if (!id || !item) return respond("EDIT_ACTIVE_DRAFT", "portion", "That isn't in this meal, so nothing changes.", { draftTarget: "ACTIVE" })
      return edit({ type: "set_grams", ingredientId: id, grams: Math.max(1, Math.round(item.grams * intent.factor)) }, "portion")
    }

    case "remove_missing": {
      const id = resolveFoods([intent.text]).ids[0]
      if (!id || !draft?.ingredients.some((i) => i.ingredientId === id)) return respond("EDIT_ACTIVE_DRAFT", "remove_missing", "Noted — it isn't in this meal, so nothing changes.", { draftTarget: "ACTIVE" })
      const name = getIngredient(id)?.shortName ?? "that"
      const result = applyDraftOp(ctx, draft, { type: "remove", ingredientId: id })
      return respond("EDIT_ACTIVE_DRAFT", "remove_missing", `${result.message} Removed ${name} — the meal still works, though the texture may change slightly.`, { action: result.applied ? "UPDATE_MEAL_DRAFT" : "NONE", draftTarget: "ACTIVE", mealDraft: result.draft, proposal: result.proposal, warnings: result.warnings, topic: mealTopic(result.draft), toolCalls: [{ name: "draft_editor", ok: result.applied }] })
    }

    case "need_foods":
      return respond("NEW_MEAL_REQUEST", "need_foods", "Tell me what you have — e.g. “use only what I have: chicken, rice, eggs” — or pick the foods in Choose My Food.")

    case "op":
      return edit(intent.op, intent.op.type)

    case "chat": {
      // Bounded model follow-up resolution: only for SHORT messages with a meal genuinely in view, and never when the
      // user explicitly changed topic. It labels the turn; the deterministic executor does everything else.
      const live = isFollowUpLive(followState, now) ? followState : null
      const lastRef = live?.referent && (live.referent.type === "MEAL_DRAFT" || live.referent.type === "MEAL_RESULT") ? live.referent : null
      const meals = knownMeals(live, draft ? mealFromDraft(draft) : null)
      const ordered = lastRef ? [...meals.filter((m) => m.id === lastRef.id), ...meals.filter((m) => m.id !== lastRef.id)] : meals
      const lastMealName = newTopic ? undefined : ordered[0]?.name
      if (pinned && !pinned.meal) {
        return respond("GENERAL_NUTRITION_QUESTION", "followup_clarify", `There's no option ${pinned.index} in the list I just showed (1–${shownMeals.length}). Which one did you mean?`, { clarified: true })
      }
      if (!newTopic && ordered.length > 0 && message.trim().split(/\s+/).length <= 14) {
        const model = await resolveFollowUpWithModel(message, ordered, recent, turnBudget)
        if (model?.isNewTopic && model.confidence !== "LOW") {
          newTopicFlag = true
          meta.viaModel = true
        } else if (model?.isFollowUp && model.intent && model.intent !== "CONTINUE_CURRENT_TOPIC") {
          // The model labels the intent; WHICH meal "the second one" is comes from the list on screen.
          // The model labels the intent; it never moves the turn off the last referent to a meal the message doesn't name
          // (live, 2026-11-03: "what are the ingredients…, raw or cooked?" right after picking option 2 answered for option 1).
          const modelPick = model.candidate !== null ? ordered[model.candidate] : undefined
          const lastMeal = lastRef ? meals.find((meal) => meal.id === lastRef.id) : undefined
          const chosen = pinned?.meal ?? (lastMeal && modelPick && modelPick.id !== lastMeal.id && !mentionsMeal(message, modelPick) ? lastMeal : modelPick)
          const args: FollowUpArgs = {
            ...(model.modifier ? { modifier: model.modifier } : {}),
            ...(model.foodText ? { foodText: model.foodText } : {}),
            ...(model.toText ? { toText: model.toText } : {}),
            ...(model.factor ? { factor: model.factor } : {}),
          }
          const confidence = pinned?.meal ? "HIGH" : model.confidence
          const target = chosen && confidence !== "LOW"
            ? ({ kind: "meal", meal: chosen, referent: referentFor(chosen, draft?.id), confidence, via: pinned?.meal ? "option" : "explicit" } as const)
            : ({ kind: "clarify", candidates: chosen ? [chosen] : ordered.slice(0, 3), reason: "ambiguous" } as const)
          const resolved: Extract<TurnResolution, { kind: "follow_up" }> = {
            kind: "follow_up",
            resolution: { isFollowUp: true, referent: target.kind === "meal" ? target.referent : null, intent: model.intent, responseMode: target.kind === "clarify" ? "CLARIFY" : MODE_BY_INTENT[model.intent], confidence: target.kind === "meal" ? confidence : "LOW" },
            intent: model.intent,
            args,
            target,
            viaClarification: false,
          }
          return respondExec(executeFollowUp(resolved, execInput), resolved, true)
        }
      }
      // A question about a logged meal is answered against today's CURRENT rows before any model sees the chat: the history may
      // name the meal, but its numbers may have been edited or deleted since (live P1: deleted lunch re-voiced as "62 g").
      // Only "how does it fit my goal?" about a meal that still exists goes on to the composer, held to current numbers.
      const loggedMeal = loggedMealReply(message, ctx, recent, state.loggedRows ?? null)
      // "It" still means the entry that is gone, not the rows logged since (live: a historical follow-up got the re-added row).
      if (loggedMeal?.gone) todayRows = state.loggedRows ?? null
      if (loggedMeal && !loggedMeal.judge) return respond("GENERAL_NUTRITION_QUESTION", "food_log", loggedMeal.reply, { clarified: loggedMeal.reply.startsWith("Which meal") })
      const currentFactsOnly = Boolean(loggedMeal) || isLoggedIntakeQuestion(message)
      // N1.6.4: context-aware understanding + plan. Any failure leaves the existing path below exactly as it was.
      // Plain greetings/small talk need no planning: the existing single-call path answers them.
      const skipOrchestration = GREETING.test(message) && message.trim().split(/\s+/).length <= 8
      const orchestrated = skipOrchestration
        ? null
        : await orchestrateTurn({ message, recent, ctx: planningCtx, call: isOpenAiConfigured() ? orchestrationModelCall : null,
          currentTopicFood: newTopic || conversationOwnsFocus ? null : state.currentTopic?.food,
          extras: {
            hasActiveDraft: Boolean(draft),
            activeDraftName: draft?.name ?? null,
            priorConstraints,
            priorActiveItem: priorFocus?.item ?? null,
            pendingAction: followState?.pendingProposal ? { kind: "MODIFICATION_PROPOSAL", name: followState.pendingProposal.sourceMealResultId } : null,
            newTopic: Boolean(newTopic),
            nowMs: now.getTime(),
            followUpExpiredByServerTime: Boolean(followState) && !isFollowUpLive(followState, now),
            snapshot: priorSnapshot,
            pendingClarification: priorPending,
            activeDraftItems: draft ? draft.ingredients.map(({ ingredientId, grams }) => ({ ingredientId, grams })) : null,
            foodReference: state.foodReference ?? null,
            loggedMealReferent: Boolean(loggedMeal),
          },
        })
      let orchestration: OrchestrationDiagnostics | undefined
      if (orchestrated?.kind === "plan") {
        const { plan, context, results, startedAt } = orchestrated
        // Retrieval only when the plan asks for it; the existing Layer-1/Layer-2 need gate and R3-H run unchanged (same call shape as the old open-chat path).
        const knowledge = plan.toolNeed.needKnowledgeRetrieval ? await knowledgeFor(message, ctx, turnBudget, { semantic: true, ...(!newTopic && state.currentTopic?.type === "CRAVING" ? { topic: state.currentTopic } : {}) }) : null
        const knowledgeText = knowledge ? renderKnowledgeContext(knowledge) : null
        const budget = buildContextBudget(plan, context, planningCtx, results, [...priorSignals.map((s) => ({ kind: s.kind, value: s.value })), ...(ctx.coordination?.promptContext ?? [])], knowledgeText, undefined, { pendingAction: followState?.pendingProposal ? { kind: "MODIFICATION_PROPOSAL", name: followState.pendingProposal.sourceMealResultId } : null })
        const diag = { retrievalUsed: Boolean(budget.knowledgeText), budget, plannerCalls: orchestrated.plannerCalls, plannerLatencyMs: orchestrated.plannerLatencyMs, fallbackStage: orchestrated.fallbackStage, fallbackReason: orchestrated.fallbackReason }
        // Required context that cannot fit is never silently truncated: report it and take the existing safe path.
        const draftReply = budget.exceeded ? null : await composeReply({ message, plan, context, ctx: planningCtx, results, budget, knowledgeText: budget.knowledgeText, call: orchestrationModelCall, currentFactsOnly })
        // Intake answers may name only foods in today's log: a deleted meal re-voiced from the chat never leaves (the log answers instead).
        const composed = draftReply && currentFactsOnly && claimsUnloggedFood(draftReply.reply, ctx) ? null : draftReply
        if (composed) {
          orchestration = planDiagnostics(plan, startedAt, diag)
          recordOrchestrationEvent(orchestration)
          const craving = !newTopic && state.currentTopic?.type === "CRAVING"
          const topic: NutritionTopic = craving ? state.currentTopic! : { type: "GENERAL_NUTRITION" }
          // Conversation-owned focus: the engine's old choice must not outlive the list the coach actually showed.
          const supersede: StatePatch | undefined = conversationOwnsFocus ? { referent: null, candidateReferents: [], presentedOptions: null, pendingProposal: null } : undefined
          // A blocking question keeps WHY it was asked: its answer resumes this request instead of starting a new one.
          const pending = composed.source === "question" && plan.clarification ? pendingFromPlan(plan.clarification, message, context, now) : null
          return respond(craving ? "NEW_CRAVING_REQUEST" : "GENERAL_NUTRITION_QUESTION", "orchestrated", composed.reply, { topic, orchestration, pending, foodReference: orchestrated.foodReference ?? undefined, clarified: plan.toolNeed.needClarification, followUp: supersede, constraints: durableConstraints(context.activeConstraints), focus: conversationOwnsFocus ? { owner: "CONVERSATION", item: plan.activeEntity?.label ?? priorFocus?.item ?? null } : null })
        }
        orchestration = budget.exceeded ? fallbackDiagnostics("context_budget_exceeded", startedAt, orchestrated.plannerCalls, Date.now, { contextBudgetExceeded: true }) : fallbackDiagnostics("model_failed", startedAt, orchestrated.plannerCalls)
      } else if (orchestrated) {
        orchestration = orchestrated.diagnostics
      }
      if (orchestration) recordOrchestrationEvent(orchestration)

      if (loggedMeal) return respond("GENERAL_NUTRITION_QUESTION", "food_log", loggedMeal.reply, { orchestration })
      // Planner failed on "what did I eat?": the food log answers it verbatim (lastResortReply), never a free model reply.
      const ambiguous = ctx.todayMeals && isLoggedIntakeQuestion(message) ? null : await resolveAmbiguousTurn(message, ctx, recent, priorSignals, newTopicFlag ? undefined : lastMealName, turnBudget)
      const topic: NutritionTopic = ambiguous?.topic ?? { type: "GENERAL_NUTRITION" }
      if (topic.type === "CRAVING") {
        const buildable = Boolean(topic.food && detectCravingKey(topic.food))
        return respond(
          "NEW_CRAVING_REQUEST",
          ambiguous ? "agent_topic" : "chat",
          ambiguous?.reply ?? fallbackCravingReply(topic, ctx, buildable),
          {
            action: topic.food && buildable ? "ASK_BEFORE_BUILD" : "NONE",
            topic,
            pendingMealBuild: topic.food && buildable ? { topic: topic.food } : null,
            orchestration,
          },
        )
      }
      return respond(
        "GENERAL_NUTRITION_QUESTION",
        ambiguous ? "agent_topic" : "chat",
        ambiguous?.reply ?? lastResortReply(ctx, { message, lastMealName }),
        { topic, genericFallback: !ambiguous, orchestration },
      )
    }
  }
}
