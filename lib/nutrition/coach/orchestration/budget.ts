import type { CoachContext } from "../types"

import type { ToolResults } from "./tools"
import type { ContextBudgetLimits, ConversationContext, OrchestrationPlan, PlanningExtras } from "./types"

/**
 * Context budget. The response prompt receives only what THIS turn needs, selected by priority:
 *   P0 safety, hard constraints, current user turn   (never dropped, never truncated)
 *   P1 unresolved prior offer / pending choice / active referent / pending action / relevant nutrition state
 *   P2 goal context, preferences
 *   P3 retrieval output, optional tool output
 *   P4 older recent turns
 * REQUIRED items (minimum required context) are placed before any optional item. If the required set cannot fit,
 * nothing is silently truncated: contextBudgetExceeded is raised, the missing required items are named, and the
 * caller falls back to the existing safe path. Unused capacity is never filled for its own sake.
 *
 * Limits are conservative and tied to existing runtime sizes, NOT tuned against any benchmark:
 *  - recent turns: the existing prompt already sent 4 turns of <=300 chars (TURN_TEXT_LIMIT in context.ts);
 *  - retrieval: the frozen R3-H builder already caps at 6 chunks / 5500 chars (knowledge/context.ts);
 *  - state: nutrition + goal (2 sections); tool results are a few short numeric objects (<=1500 chars is >10x observed);
 *  - total: 5500 retrieval + ~2500 for everything else.
 */
export const DEFAULT_CONTEXT_LIMITS: ContextBudgetLimits = {
  maxRecentTurns: 4,
  maxRecentTurnChars: 300,
  maxStateSections: 2,
  maxRetrievalChunks: 6,
  maxRetrievalChars: 5500,
  maxToolResultChars: 1500,
  maxTotalContextChars: 8000,
  truncationPolicy: "drop_lowest_priority_first_never_required",
}

export type DroppedRef = { ref: string; reason: "over_budget" | "not_needed" | "invalidated" | "turn_limit" | "state_section_limit" | "retrieval_limit" }

export type ContextMetrics = {
  recentTurnsIncluded: number
  stateSectionsIncluded: number
  retrievalChunksIncluded: number
  retrievalChars: number
  toolResultChars: number
  totalContextChars: number
  droppedContextCount: number
  droppedReasons: Record<string, number>
  contextBudgetExceeded: boolean
}

export type ContextBudget = {
  /** Selected context refs (Phase 1 name kept; see selectedRefs). */
  included: string[]
  context: Record<string, unknown>
  turns: Array<{ role: "user" | "coach"; text: string }>
  knowledgeText: string | null
  selectedRefs: string[]
  droppedRefs: DroppedRef[]
  /** Required context that could not fit. Non-empty implies exceeded. */
  requiredMissing: string[]
  exceeded: boolean
  metrics: ContextMetrics
}

type Candidate = { ref: string; priority: 0 | 1 | 2 | 3 | 4; required: boolean; chars: number; apply: () => void }

const size = (value: unknown) => (typeof value === "string" ? value.length : JSON.stringify(value).length)

export function buildContextBudget(
  plan: OrchestrationPlan,
  context: ConversationContext,
  ctx: CoachContext,
  results: ToolResults,
  sessionPreferences: Array<{ kind: string; value: string }>,
  knowledgeText: string | null,
  limits: ContextBudgetLimits = DEFAULT_CONTEXT_LIMITS,
  extras: PlanningExtras = {},
): ContextBudget {
  const body: Record<string, unknown> = {}
  const turns: ContextBudget["turns"] = []
  let knowledge = null as string | null
  const selected: string[] = []
  const dropped: DroppedRef[] = []
  const candidates: Candidate[] = []
  const continuing = plan.strategy.mode === "CONTINUE"
  const macroExact = plan.toolNeed.needMacroCalculation

  const add = (ref: string, priority: Candidate["priority"], required: boolean, value: unknown, apply: () => void) => candidates.push({ ref, priority, required, chars: size(value), apply })

  // P0 — always.
  const hard = { allergies: ctx.guards.allergies, excludedFoods: ctx.guards.excludedFoods, hardConstraints: plan.hardConstraints }
  add("hardConstraints", 0, true, hard, () => Object.assign(body, hard))

  // P1 — minimum required context when relevant to this turn.
  if (context.lastAssistantOffer && (plan.strategy.continuationTarget === "PRIOR_OFFER" || plan.understanding.referencedPriorOffer)) add("priorOffer", 1, true, context.lastAssistantOffer, () => (body.priorOffer = context.lastAssistantOffer))
  if (context.presentedOptions.length > 0 && (plan.strategy.continuationTarget === "PENDING_CHOICE" || (continuing && !context.selectedOption))) {
    const options = context.presentedOptions.map((option) => ({ n: option.index, label: option.label, text: option.text }))
    add("pendingChoice", 1, true, options, () => (body.presentedOptions = options))
  }
  if (context.selectedOption) {
    const chosen = { label: context.selectedOption.label, text: context.selectedOption.text }
    add("chosenOption", 1, continuing, chosen, () => (body.chosenOption = chosen))
  }
  if (continuing && context.referencedFoods.length > 0 && !context.selectedOption) add("activeReferent", 1, true, context.referencedFoods, () => (body.activeReferent = context.referencedFoods))
  // The one item this turn applies to (provenance-checked in plan.ts). The reply must change/discuss this item and no other.
  if (continuing && plan.activeEntity) add("activeItem", 1, true, plan.activeEntity.label, () => (body.activeItem = plan.activeEntity!.label))
  // Explicit correction beats prior state: name the retracted assumption so it cannot be reused from older turns.
  if (context.correction && context.statedBudget.invalidatedRemaining !== null) {
    const correction = {
      retracted: `remainingCalories=${context.statedBudget.invalidatedRemaining}`,
      recorded: context.statedBudget.consumedCalories !== null ? `consumedCalories=${context.statedBudget.consumedCalories}` : null,
      rule: "Never state the retracted figure as what is left. Remaining amounts come only from athleteState.",
    }
    add("userCorrection", 1, true, correction, () => (body.userCorrection = correction))
  }
  // The question this message answers and the request it resumes: the reply completes THAT request, it does not start a new one.
  if (plan.resume) {
    const resume = { answeredQuestion: plan.resume.question, answer: plan.resume.answer, resumeRequest: plan.resume.request }
    add("resume", 1, true, resume, () => (body.resume = resume))
  }
  if (plan.toolNeed.needPendingAction && extras.pendingAction) add("pendingAction", 1, true, extras.pendingAction, () => (body.pendingAction = extras.pendingAction))

  // Nutrition state (+ goal section) — required when it feeds an exact calculation, otherwise P1 optional.
  if (results.athleteState) {
    const overLimit = (results.athleteState.goal ? 2 : 1) > limits.maxStateSections
    const state = overLimit ? { ...results.athleteState, goal: null } : results.athleteState
    if (overLimit) dropped.push({ ref: "athleteState.goal", reason: "state_section_limit" })
    add("athleteState", 1, macroExact, state, () => (body.athleteState = state))
  }

  // Deterministic tool output: required whenever an exact tool ran (the response must be able to state exact values).
  const toolOutputs: Record<string, unknown> = {}
  if (results.foods) toolOutputs.foodToolResults = results.foods
  if (results.fit) toolOutputs.fit = results.fit
  if (results.entity) toolOutputs.entityMacros = results.entity
  if (results.budgetResume) toolOutputs.budgetResume = results.budgetResume
  if (results.binding) toolOutputs.macroBinding = results.binding
  if (results.exactUnavailable) toolOutputs.exactCalculation = "UNAVAILABLE"
  const toolChars = Object.keys(toolOutputs).length > 0 ? size(toolOutputs) : 0
  if (toolChars > 0) add(Object.keys(toolOutputs).includes("fit") ? "fit" : "foodToolResults", 3, macroExact || Boolean(results.exactUnavailable) || Boolean(results.budgetResume), toolOutputs, () => Object.assign(body, toolOutputs))

  // P2 — optional personalization.
  if (plan.strategy.mode === "PROPOSE" && ctx.guards.preferredFoods.length > 0) add("preferredFoods", 2, false, ctx.guards.preferredFoods, () => (body.preferredFoods = ctx.guards.preferredFoods))
  if (sessionPreferences.length > 0) add("sessionPreferences", 2, false, sessionPreferences, () => (body.sessionPreferences = sessionPreferences))

  // P3 — retrieval, only if planned. Whole or dropped: a half-cut strategy chunk is worse than none.
  const chunkCount = knowledgeText ? (knowledgeText.match(/\[MF Curated \|/g) ?? []).length : 0
  if (knowledgeText) {
    if (!plan.toolNeed.needKnowledgeRetrieval) dropped.push({ ref: "knowledge", reason: "not_needed" })
    else if (knowledgeText.length > limits.maxRetrievalChars || chunkCount > limits.maxRetrievalChunks) dropped.push({ ref: "knowledge", reason: "retrieval_limit" })
    else add("knowledge", 3, false, knowledgeText, () => (knowledge = knowledgeText))
  }

  // P4 — recent turns, newest first. The current message is never in here (it is P0, added by the prompt itself).
  const recent = context.turns.slice(-limits.maxRecentTurns)
  for (const turn of context.turns.slice(0, Math.max(0, context.turns.length - limits.maxRecentTurns))) dropped.push({ ref: `turn:${turn.turnsAgo}`, reason: "turn_limit" })
  for (const turn of [...recent].reverse()) {
    const text = turn.text.slice(0, limits.maxRecentTurnChars)
    add(`turn:${turn.turnsAgo}`, 4, false, text, () => turns.unshift({ role: turn.role, text }))
  }
  for (const invalidation of plan.contextInvalidations) for (const ref of invalidation.invalidatedRefs) dropped.push({ ref, reason: "invalidated" })

  // Required first (by priority), then optional by priority. Required items are never truncated or silently skipped.
  const requiredMissing: string[] = []
  let used = 0
  const place = (candidate: Candidate) => {
    candidate.apply()
    selected.push(candidate.ref)
    used += candidate.chars
  }
  for (const candidate of candidates.filter((c) => c.required).sort((a, b) => a.priority - b.priority)) {
    if (candidate.priority === 0 || used + candidate.chars <= limits.maxTotalContextChars) place(candidate)
    else requiredMissing.push(candidate.ref)
  }
  if (toolChars > limits.maxToolResultChars && !requiredMissing.includes("foodToolResults") && macroExact) requiredMissing.push("toolResults")
  for (const candidate of candidates.filter((c) => !c.required).sort((a, b) => a.priority - b.priority)) {
    if (used + candidate.chars <= limits.maxTotalContextChars) place(candidate)
    else dropped.push({ ref: candidate.ref, reason: "over_budget" })
  }

  const exceeded = requiredMissing.length > 0
  const droppedReasons: Record<string, number> = {}
  for (const drop of dropped) droppedReasons[drop.reason] = (droppedReasons[drop.reason] ?? 0) + 1
  const included = [...new Set(selected.map((ref) => (ref.startsWith("turn:") ? "recentDialogue" : ref)))]
  return {
    included,
    context: body,
    turns,
    knowledgeText: knowledge,
    selectedRefs: selected,
    droppedRefs: dropped,
    requiredMissing,
    exceeded,
    metrics: {
      recentTurnsIncluded: turns.length,
      stateSectionsIncluded: !selected.includes("athleteState") ? 0 : (body.athleteState as { goal: string | null }).goal ? 2 : 1,
      retrievalChunksIncluded: knowledge ? chunkCount : 0,
      retrievalChars: knowledge?.length ?? 0,
      toolResultChars: toolChars,
      totalContextChars: used,
      droppedContextCount: dropped.length,
      droppedReasons,
      contextBudgetExceeded: exceeded,
    },
  }
}
