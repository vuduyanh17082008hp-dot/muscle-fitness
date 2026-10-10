import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"

import { callOpenAiWithFallback } from "@/lib/dante-core/openai/client"
import { isOpenAiConfigured } from "@/lib/dante-core/openai/config"

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

import { loadCoachContext } from "./context"
import { decideProposal, executeFollowUp, presentOptions, type FollowUpExec } from "./followup-actions"
import {
  FOLLOW_UP_INTENTS,
  MODE_BY_INTENT,
  MODIFIERS,
  draftReferent,
  isFollowUpLive,
  knownMeals,
  mealFromDraft,
  nextFollowUpState,
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
import { isUnsafeCoachReply, parseCoachMessage, resolveFoods, SAFETY_REPLY } from "./intent"
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
  }
  /** Compact structured results the UI renders instead of re-parsing prose. */
  structuredBlocks: StructuredBlock[]
  referent: FollowUpState["referent"]
  presentedOptions: PendingChoiceContext | null
  followUpHints: string[]
  modificationProposal: MealModificationProposal | null
  /** Debug/telemetry only: how a short follow-up was resolved. */
  followUp: { intent?: NutritionFollowUpIntent; responseMode: FollowUpResolution["responseMode"]; confidence: ResolutionConfidence; viaModel: boolean } | null
  // Compatibility fields used by the panel.
  draft: ActiveMealDraft | null
  proposal: ActiveMealDraft | null
  warnings: Array<{ kind: string; message: string; actions: Array<{ label: string; fit: string }> }>
  alternatives: ActiveMealDraft[]
  quickActions: typeof QUICK_ACTIONS
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

type ConverseOptions = {
  intent: NutritionIntent
  topic?: NutritionTopic
  recent: Array<{ role: "user" | "coach"; text: string }>
  signals: PreferenceSignal[]
  craving?: boolean
  withholdDraft?: boolean
  /** The engine just built `draft` for this message; the reply presents it with the retrieved style guidance. */
  built?: { need: KnowledgeNeedDecision }
}

/**
 * N1.6.2: optional curated strategy knowledge beneath the conversation layer.
 * The N1.5 intent/topic decide whether it is needed; any failure yields null
 * and the turn continues exactly as it did before retrieval existed.
 */
async function knowledgeFor(message: string, ctx: CoachContext, options: { intent?: NutritionIntent; topic?: NutritionTopic; need?: KnowledgeNeedDecision; semantic?: boolean }): Promise<NutritionKnowledgeContext | null> {
  try {
    const layer1 = options.need ?? decideNutritionKnowledgeNeed({ message, intent: options.intent })
    // Layer 2 (one bounded model call) only for an uncertain Layer-1 answer, and only on the open-ended chat path.
    const need = options.semantic ? await resolveUncertainNeed(message, layer1) : layer1
    if (!need.needed) return null
    return await getOptionalNutritionKnowledgeContext({
      need,
      message,
      intent: options.intent,
      topic: options.topic,
      goal: ctx.snapshot.goal,
      timezone: ctx.snapshot.timezone,
    })
  } catch {
    return null
  }
}

const knowledgeBlock = (knowledge: NutritionKnowledgeContext | null) => (knowledge ? `\n${renderKnowledgeContext(knowledge)}\n` : "")

async function converse(message: string, ctx: CoachContext, draft: ActiveMealDraft | null, options: ConverseOptions, fallback: string): Promise<string> {
  if (!isOpenAiConfigured()) return fallback

  const knowledge = await knowledgeFor(message, ctx, { ...options, need: options.built?.need })
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
- The user's CURRENT message decides the topic. activeMealDraft is background context only: talk about it only if the user clearly refers to it, and never repeat it as the answer to a new topic.
- Allergies and excluded foods always win over preferences. Answer naturally in under 110 words.${cravingRules}${builtRules}

CONTEXT: ${JSON.stringify(context)}
${knowledgeBlock(knowledge)}${history ? `\nRECENT CONVERSATION:\n${history}\n` : ""}
USER: ${message}`

  try {
    const result = await callOpenAiWithFallback(prompt)
    if (!result?.reply) return fallback
    if (isUnsafeCoachReply(result.reply)) return SAFETY_REPLY
    const grounded = [
      context.remaining.calories, context.remaining.protein, context.targets.calories, context.targets.protein,
      ...(draft ? [draft.nutrition.calories, draft.nutrition.protein, draft.nutrition.carbs, draft.nutrition.fat] : []),
      ...(message.match(/\d+(?:\.\d+)?/g) ?? []).map(Number),
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
  lastMealName?: string,
): Promise<{ topic: NutritionTopic; reply: string } | null> {
  if (!isOpenAiConfigured()) return null
  const knowledge = await knowledgeFor(message, ctx, { semantic: true })
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
CONTEXT: ${JSON.stringify(context)}
${knowledgeBlock(knowledge)}${history ? `RECENT CONVERSATION:\n${history}\n` : ""}MESSAGE: ${JSON.stringify(message)}`
  try {
    const result = await callOpenAiWithFallback(prompt)
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
export async function resolveFollowUpWithModel(message: string, candidates: MealResultState[], recent: Array<{ role: "user" | "coach"; text: string }>): Promise<ModelResolution | null> {
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
    const result = await callOpenAiWithFallback(prompt)
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

export type NutritionChatInput = { supabase: SupabaseClient; userId: string; body: unknown; now?: Date }

export async function handleNutritionCoachChat({ supabase, userId, body, now = new Date() }: NutritionChatInput): Promise<Response> {
  const parsed = nutritionChatBodySchema.safeParse(body)
  if (!parsed.success) return Response.json({ ok: false, error: "Invalid Nutrition Coach request." }, { status: 400 })

  const { message, activeDraft, selectedFoods } = parsed.data
  const state = parsed.data.conversation ?? {}
  const recent = state.recentMessages ?? []
  const priorSignals: PreferenceSignal[] = state.signals ?? []
  let draft: ActiveMealDraft | null = null
  let newTopicFlag = false
  const meta: { resolution: FollowUpResolution | null; viaModel: boolean } = { resolution: null, viaModel: false }

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
    } = {},
  ): Response => {
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
    const followUp = nextFollowUpState(state.followUp, extra.followUp ?? defaultPatch(), now)
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
      },
      structuredBlocks: extra.blocks ?? [],
      referent: followUp?.referent ?? null,
      presentedOptions: followUp?.presentedOptions ?? null,
      followUpHints: (extra.hints ?? []).slice(0, 3),
      modificationProposal: extra.modificationProposal ?? null,
      followUp: meta.resolution ? { intent: meta.resolution.intent, responseMode: newTopicFlag ? "NEW_TOPIC" : meta.resolution.responseMode, confidence: meta.resolution.confidence, viaModel: meta.viaModel } : newTopicFlag ? { responseMode: "NEW_TOPIC", confidence: "HIGH", viaModel: meta.viaModel } : null,
      draft: mealDraft,
      proposal: extra.proposal ?? null,
      warnings: extra.warnings ?? [],
      alternatives: extra.alternatives ?? [],
      quickActions: QUICK_ACTIONS,
    }
    return Response.json(payload)
  }

  // Safety and scope are decided before any data load or model call. They don't depend on the draft.
  const early = parseCoachMessage(message, { hasDraft: false })
  if (early.kind === "safety") return respond("GENERAL_NUTRITION_QUESTION", "safety", early.reply)
  if (early.kind === "redirect_training") return respond("GENERAL_NUTRITION_QUESTION", "redirect_training", early.reply)

  const loaded = await loadCoachContext(supabase, userId, now)
  if (!loaded.ok) return Response.json({ ok: false, code: loaded.code, error: loaded.message }, { status: 422 })
  const ctx = loaded.ctx
  const planningCtx = withSessionDislikes(ctx, priorSignals)

  draft = activeDraft ? rehydrateDraft(activeDraft, ctx) : null

  // 1. Reference resolution — before ANY meal-edit logic.
  const draftReference = resolveDraftReference(message, draft, state.handoff)
  const mealTopic = (d: ActiveMealDraft): NutritionTopic => ({ type: "MEAL", food: d.name })

  // 1b. N1.5.6 follow-up continuity: proposal answer -> explicit new topic -> clarification answer -> short follow-up.
  // The legacy deterministic draft editor keeps every message it already handled ("make this bowl under 400 calories").
  const followState = state.followUp ?? null
  const execInput = { ctx: planningCtx, activeDraft: draft, state: followState, now }
  const legacyHandles = draftReference.bound && parseCoachMessage(message, { hasDraft: true }).kind !== "chat"
  const turn = resolveTurn({ message, state: followState, activeDraft: draft ? mealFromDraft(draft) : null, topicType: state.currentTopic?.type ?? null, now, legacyHandles })

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
    const reply = sensoryNeed?.needed ? await converse(message, ctx, result.draft, { intent: "EDIT_ACTIVE_DRAFT", recent, signals: priorSignals, built: { need: sensoryNeed } }, result.message) : result.message
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
  const conv = classifyConversation(message, { reference, state })
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
        return respond("FOOD_SUBSTITUTION", "substitution", await converse(message, ctx, draft, { intent: "FOOD_SUBSTITUTION", topic: conv.topic, recent, signals: priorSignals, withholdDraft: true }, lastResortReply(ctx)), { topic: conv.topic })

      case "NEW_CRAVING_REQUEST": {
        const food = conv.topic.food
        if (!conv.build) {
          // Acknowledge first. No optimizer, no draft; the old draft stays untouched.
          const buildable = Boolean(food && detectCravingKey(food))
          const fallback = fallbackCravingReply(conv.topic, ctx, buildable)
          const reply = await converse(message, ctx, draft, { intent: "NEW_CRAVING_REQUEST", topic: conv.topic, recent, signals: priorSignals, craving: true }, fallback)
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
    const reply = await converse(message, ctx, draft, { intent: "NEW_CRAVING_REQUEST", topic, recent, signals: priorSignals, craving: true }, fallbackCravingReply(topic, ctx, buildable))
    return respond("NEW_CRAVING_REQUEST", "craving_ask", reply, { action: buildable ? "ASK_BEFORE_BUILD" : "NONE", topic, pendingMealBuild: buildable ? { topic: newTopic.food } : null })
  }

  // 4. Deterministic parser. The draft is a candidate target ONLY when reference resolution bound it.
  const intent = parseCoachMessage(message, { hasDraft: reference.bound })

  if (intent.kind === "chat" && reference.explicit && !draft) {
    return respond("NEW_MEAL_REQUEST", "no_draft", "There's no active meal draft yet. Want me to build one around your remaining macros?", { action: "ASK_BEFORE_BUILD" })
  }

  switch (intent.kind) {
    case "safety":
    case "redirect_training":
      return respond("GENERAL_NUTRITION_QUESTION", intent.kind, intent.reply)

    case "build": {
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
      const reply = buildNeed.needed
        ? await converse(message, ctx, result.draft, { intent: "NEW_MEAL_REQUEST", recent, signals: priorSignals, built: { need: buildNeed } }, engineReply)
        : engineReply
      const presented = presentOptions(result.draft, result.alternatives, now)
      return respond("NEW_MEAL_REQUEST", "build", `${reply}${skipped}`, {
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
      return respond("NEW_CRAVING_REQUEST", "craving_ask", await converse(message, ctx, draft, { intent: "NEW_CRAVING_REQUEST", topic, recent, signals: priorSignals, craving: true }, fallbackCravingReply(topic, ctx, false)), { action: "ASK_BEFORE_BUILD", topic })
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
        const model = await resolveFollowUpWithModel(message, ordered, recent)
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
      const ambiguous = await resolveAmbiguousTurn(message, ctx, recent, priorSignals, newTopicFlag ? undefined : lastMealName)
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
          },
        )
      }
      return respond(
        "GENERAL_NUTRITION_QUESTION",
        ambiguous ? "agent_topic" : "chat",
        ambiguous?.reply ?? lastResortReply(ctx, { message, lastMealName }),
        { topic, genericFallback: !ambiguous },
      )
    }
  }
}
