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
import type { KnowledgeNeedDecision, NutritionKnowledgeContext } from "@/lib/nutrition/knowledge/types"

import { classifyTargetUtterance, guardCanonicalTargetClaim, targetTruthReply } from "@/lib/nutrition/targets"
import { loadCoachContext } from "./context"
import { buildContextBudget, commitEmitted, composeReply, durableConstraints, fallbackDiagnostics, legacySnapshot, listMatchesEngine, orchestrateTurn, OTHER_REF, parseOptions, pendingFromPlan, planDiagnostics, recordOrchestrationEvent, safetyReply, screenSafety, supplementEducationReply, validateSnapshot, type ModelCall, type OrchestrationDiagnostics, type PendingClarification, type PresentedOptionSnapshot } from "./orchestration"
import { decideProposal, executeFollowUp, presentOptions, type FollowUpExec } from "./followup-actions"
import {
  FOLLOW_UP_INTENTS,
  MODE_BY_INTENT,
  MODIFIERS,
  draftReferent,
  isFollowUpLive,
  knownMeals,
  mealFromDraft,
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
import { applyDraftOp, type DraftOp } from "./draft"
import { ALLERGEN_GUARD, asksForMealSuggestion, coordinationDiagnostics, coordinationNote, EMPTY_COORDINATION, GEMMA_CLEARANCE, loadGemmaCoordination, type GemmaCoordination } from "@/lib/intelligence/gemma-consumer"
import { dayLevelCalorieProposal, isUnsafeCoachReply, parseCoachMessage, resolveFoods, SAFETY_REPLY } from "./intent"
import { buildDanteDeferralReply } from "@/lib/intelligence/query-understanding"
import { activeFacts, buildContextWorkingSet, buildIntelligenceBrief, enforceIntegrity, restrictedSubstanceReply } from "@/lib/intelligence/performance-core"
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
import { buildGemmaFrame, type ResolvedFoodReference } from "./orchestration/shared-query"
import { COACH_INGREDIENT_IDS, getIngredient } from "./ingredients"
import { totalsFor } from "./macros"
import { buildNextMeal, chooseMyFood } from "./service"
import { draftInputSchema, rehydrateDraft } from "./schema"
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
  }
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
  if (constraints.calorieCeiling !== null && nutrition.calories <= constraints.calorieCeiling) lines.push(`fits your ${Math.round(constraints.calorieCeiling)} kcal budget`)
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
  if (options.lastMealName) return `I can show the ingredients or macros for ${options.lastMealName}, suggest a change to it, or we can switch to something else. What would you like?`
  if (ctx && ctx.snapshot.caloriesRemaining > 0) return `You've got about ${left(ctx)} left today. Want a meal that fits that, a craving worked in, or a nutrition question answered?`
  return "What are we solving — a meal, a craving, or a nutrition question?"
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

  const prompt = `You are the Muscle Fitness Nutrition Coach, a nutrition specialist inside the Nutrition page. Dante is the separate cross-domain assistant.
Rules:
- Nutrition only. For training, workouts, recovery or injury questions, tell the user to ask Dante. You cannot change workouts or recovery.
- Use ONLY the numbers in CONTEXT. Never calculate, estimate or invent calories, macros or totals yourself. Strategy without numbers is fine.
- Never say a meal was logged: logging needs the user to confirm in the Active Meal Draft panel.
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
      ...(message.match(/\d+(?:\.\d+)?/g) ?? []).map(Number),
      ...knowledgeNumbers(ctx),
    ]
    const reply = isUnsafeCoachReply(data.reply)
      ? SAFETY_REPLY
      : hasUngroundedMacros(data.reply, allowed)
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
    } = {},
  ): Response => {
    // Final Repair D1: every non-safety reply on a supplement turn leaves as education, whichever path wrote it.
    if (!extra.safetyBlocked && !route.startsWith("safety")) reply = supplementEducationReply(reply, message, recent).reply
    // ICH-1: under a no-dosing posture no dose leaves, and no effect is asserted for a topic with no verified knowledge, whichever path wrote the reply.
    if (intelligenceRef.current && !extra.safetyBlocked && !route.startsWith("safety")) reply = enforceIntegrity(reply, intelligenceRef.current.brief, intelligenceRef.current.brief.control.responseLanguage === "VI" ? "vi" : "en")
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
      },
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
  const crisis = checkSafety(message)
  if (crisis.triggered && crisis.category === "self_harm_crisis" && crisis.responseOverride) {
    return respond("GENERAL_NUTRITION_QUESTION", "safety_self_harm", crisis.responseOverride, {
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
    ...(disclosed.length ? { context: withDisclosedFacts(buildContextWorkingSet({ priorUserMessages, message }), disclosed, "GEMMA") } : {}),
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
  canonicalTarget = { calories: Math.round(ctx.snapshot.caloriesTarget), protein: Math.round(ctx.snapshot.proteinTarget) }
  const targetUtterance = classifyTargetUtterance(message)
  if (targetUtterance.kind !== "NONE") {
    return respond("GENERAL_NUTRITION_QUESTION", "target_truth", targetTruthReply(targetUtterance, canonicalTarget))
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

  // 1b. N1.5.6 follow-up continuity: proposal answer -> explicit new topic -> clarification answer -> short follow-up.
  // The legacy deterministic draft editor keeps every message it already handled ("make this bowl under 400 calories").
  // The engine's pending choice is selectable only while it IS the displayed snapshot: a hidden candidate list is invisible to the resolver.
  const followState = conversationOwnsFocus || !state.followUp ? null : { ...state.followUp, presentedOptions: priorSnapshot?.owner === "ENGINE" ? state.followUp.presentedOptions : null }
  const execInput = { ctx: planningCtx, activeDraft: draft, state: followState, now }
  const legacyHandles = draftReference.bound && parseCoachMessage(message, { hasDraft: true }).kind !== "chat"
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
        return draft
          ? respond("LOG_MEAL", "log", `Ready to log “${draft.name}”. Pick the meal type and press “Log this meal” — nothing is saved until you confirm.`, { action: "PROPOSE_LOG", draftTarget: "ACTIVE", label: "Log this meal", topic: mealTopic(draft) })
          : respond("LOG_MEAL", "log", "There's no active meal draft to log yet. Want me to build one first?", { action: "ASK_BEFORE_BUILD" })

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
  const intent: typeof parsedIntent = (asksFoodInformation && parsedIntent.kind === "build") || (conversationOwnsFocus && parsedIntent.kind === "build" && parsedIntent.foodIds.length === 0 && parsedIntent.unresolvedFoods.length === 0 && DEFINITE_REFERENCE_REQUEST.test(message)) ? { kind: "chat" } : parsedIntent

  if (intent.kind === "chat" && reference.explicit && !draft) {
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
      const chosen = intent.foodIds.length > 0 ? intent.foodIds : (selectedFoods ?? [])
      // "lots of protein" / "protein-heavy" is a modifier: raise the protein target unless the user gave an explicit number.
      const overrides = intent.proteinPriority && intent.overrides.proteinTarget === undefined ? { ...intent.overrides, proteinTarget: Math.round(Math.min(60, Math.max(40, ctx.snapshot.proteinRemaining))) } : intent.overrides
      const result = chosen.length > 0 ? chooseMyFood(planningCtx, chosen, "BALANCED", overrides, "conversation") : buildNextMeal(planningCtx, "BALANCED", overrides, "conversation")
      const skipped = intent.unresolvedFoods.length > 0 ? ` I don't have verified nutrition data for ${intent.unresolvedFoods.join(", ")}, so I left ${intent.unresolvedFoods.length > 1 ? "them" : "it"} out.` : ""
      const toolCalls: ToolCallSummary[] = [{ name: "meal_optimizer", ok: result.ok }]
      if (!result.ok) return respond("NEW_MEAL_REQUEST", "build", `${result.message}${skipped}`, { mealDraft: result.closest ?? null, draftTarget: result.closest ? "NEW" : "NONE", action: result.closest ? "CREATE_MEAL_DRAFT" : "NONE", toolCalls })
      const engineReply = `${result.message}${whyLines(result.draft, ctx)}`
      // The engine owns ingredients and numbers; a named cuisine/texture only shapes how the draft is presented.
      const buildNeed = decideMealBuildKnowledgeNeed(message)
      const modelReply = buildNeed.needed
        ? await converse(message, ctx, result.draft, { budget: turnBudget, intent: "NEW_MEAL_REQUEST", recent, signals: priorSignals, built: { need: buildNeed } }, engineReply)
        : engineReply
      const presented = presentOptions(result.draft, result.alternatives, now)
      // FINAL-RESPONSE VALIDATION (before anything is committed): the model may re-voice the engine's meal, but a list of its OWN options
      // would put a second, different set of choices on screen beside the engine's. The engine owns this turn's options: such a reply is replaced.
      const written = parseOptions(modelReply)
      const reply = written.length >= 2 && !listMatchesEngine(written, presented?.choice.options.map((option) => option.label) ?? []) ? engineReply : modelReply
      // AI-R1E.2: deterministic, number-free-of-invention note; the canonical remaining budget outranks any signal.
      const note = coordinationNote(coordination, ctx.snapshot.caloriesRemaining)
      return respond("NEW_MEAL_REQUEST", "build", `${reply}${skipped}${note ? ` ${note}` : ""}`, {
        coordinationNoteApplied: Boolean(note),
        action: "CREATE_MEAL_DRAFT",
        draftTarget: "NEW",
        mealDraft: result.draft,
        alternatives: result.alternatives,
        topic: mealTopic(result.draft),
        toolCalls,
        followUp: { upsertMeals: presented?.meals ?? [mealFromDraft(result.draft)], referent: draftReferent(result.draft), newReferent: true, candidateReferents: [], presentedOptions: presented?.choice ?? null, pendingProposal: null, lastResolved: null },
        blocks: presented ? [presented.block] : [],
        hints: ["ingredients?", "why this one?", "cheaper?"],
      })
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
      if (!newTopic && ordered.length > 0 && message.trim().split(/\s+/).length <= 14) {
        const model = await resolveFollowUpWithModel(message, ordered, recent, turnBudget)
        if (model?.isNewTopic && model.confidence !== "LOW") {
          newTopicFlag = true
          meta.viaModel = true
        } else if (model?.isFollowUp && model.intent && model.intent !== "CONTINUE_CURRENT_TOPIC") {
          const chosen = model.candidate !== null ? ordered[model.candidate] : undefined
          const args: FollowUpArgs = {
            ...(model.modifier ? { modifier: model.modifier } : {}),
            ...(model.foodText ? { foodText: model.foodText } : {}),
            ...(model.toText ? { toText: model.toText } : {}),
            ...(model.factor ? { factor: model.factor } : {}),
          }
          const target = chosen && model.confidence !== "LOW"
            ? ({ kind: "meal", meal: chosen, referent: referentFor(chosen, draft?.id), confidence: model.confidence, via: "explicit" } as const)
            : ({ kind: "clarify", candidates: chosen ? [chosen] : ordered.slice(0, 3), reason: "ambiguous" } as const)
          const resolved: Extract<TurnResolution, { kind: "follow_up" }> = {
            kind: "follow_up",
            resolution: { isFollowUp: true, referent: target.kind === "meal" ? target.referent : null, intent: model.intent, responseMode: target.kind === "clarify" ? "CLARIFY" : MODE_BY_INTENT[model.intent], confidence: target.kind === "meal" ? model.confidence : "LOW" },
            intent: model.intent,
            args,
            target,
            viaClarification: false,
          }
          return respondExec(executeFollowUp(resolved, execInput), resolved, true)
        }
      }
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
        const composed = budget.exceeded ? null : await composeReply({ message, plan, context, ctx: planningCtx, results, budget, knowledgeText: budget.knowledgeText, call: orchestrationModelCall })
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

      const ambiguous = await resolveAmbiguousTurn(message, ctx, recent, priorSignals, newTopicFlag ? undefined : lastMealName, turnBudget)
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
