import type { CoachContext } from "../types"

import type { ContextBudget } from "./budget"
import { resolveConversationContext } from "./context"
import { referentQuestion, resolveContinuation } from "./continuation"
import { fallbackDiagnostics } from "./fallback"
import { applyContextLifecycle } from "./lifecycle"
import { buildPlan } from "./plan"
import { validateToolPlan } from "./toolplan"
import type { RetrievalDecision, UserQueryFrame } from "@/lib/intelligence/query-understanding"

import { buildGemmaFrame, foodReferenceFrom, frameLookupOutput, frameReferenceClarification, reconcileFoods, reconcileOutputWithFrame, recordGemmaQueryTelemetry, resolvePlanFoods, type FoodResolveFn, type ResolvedFoodReference } from "./shared-query"
import { runDeterministicTools, type ToolResults } from "./tools"
import type { ConversationContext, OrchestrationDiagnostics, OrchestrationPlan, PlannerOutput, PlanningExtras, RecentMessage } from "./types"
import { runPlanner, type ModelCall } from "./understand"

/**
 * Orchestration entry point (planning half):
 *
 *   recent context -> lifecycle (invalidation / referent TTL) -> ONE structured planner call (one reduced retry on
 *   schema/transient failure) -> validate -> policy (strategy, needs, tool plan) -> deterministic tools
 *
 * Reply composition is respond.ts; the chat handler wires the two together because it owns knowledge retrieval and
 * the response envelope. This function never throws.
 */

export type OrchestrationOutcome =
  | { kind: "plan"; plan: OrchestrationPlan; context: ConversationContext; results: ToolResults; /** The one food this turn's tools verified (structured follow-up state); null when none or several. */ foodReference: ResolvedFoodReference | null; startedAt: number; plannerCalls: number; plannerLatencyMs: number; fallbackStage: 0 | 1 | 2 | 4; fallbackReason?: OrchestrationDiagnostics["fallbackReason"] }
  | { kind: "fallback"; diagnostics: OrchestrationDiagnostics }

const RETRYABLE = new Set(["model_failed", "malformed", "invalid_plan"])

/** Stage 2: understanding from validated context alone (no model). Returns null when the evidence cannot resolve the turn. */
export function deterministicPlannerOutput(message: string, context: ConversationContext, extras: PlanningExtras): PlannerOutput | null {
  const base = {
    understanding: { userGoal: null, explicitRequests: [], implicitNeeds: [], referencedEntities: context.referencedFoods.slice(0, 4), constraints: context.activeConstraints.slice(0, 4), uncertainties: [], continuationOfPreviousTurn: false, referencedPriorOffer: false, referencedOption: null, proposedResponseStrategy: null },
    need: { primaryNeed: "continue the conversation", secondaryNeeds: [], needExactCalculation: false, needFoodLookup: false, needKnowledgeRetrieval: false, needAthleteState: false, needClarification: false, needActionConfirmation: false, confidence: "MEDIUM" as const },
    strategy: { mode: "ANSWER" as const, primaryObjective: "continue the conversation", supportingObjectives: [] as string[], requiresConfirmation: false },
    clarification: null,
    foods: [] as PlannerOutput["foods"],
  }
  const continuation = resolveContinuation(message, context, extras, false)
  if (continuation?.evidence === "hard") {
    return { ...base, understanding: { ...base.understanding, continuationOfPreviousTurn: true, referencedPriorOffer: continuation.target === "PRIOR_OFFER" }, strategy: { ...base.strategy, mode: "CONTINUE" } }
  }
  if (context.pronounEdit && !context.selectedOption && context.referentCandidates.length >= 2) {
    return { ...base, strategy: { ...base.strategy, mode: "CLARIFY" }, clarification: { question: referentQuestion(context), affects: "option" } }
  }
  return null
}

export async function orchestrateTurn(params: {
  message: string
  recent: RecentMessage[]
  ctx: CoachContext
  call: ModelCall | null
  currentTopicFood?: string | null
  extras?: PlanningExtras
  clock?: () => number
  /** Shared food resolver (local canonical -> USDA). Injectable for tests; defaults to the server wiring. */
  resolveFood?: FoodResolveFn
}): Promise<OrchestrationOutcome> {
  const clock = params.clock ?? Date.now
  const startedAt = clock()
  if (!params.call) return { kind: "fallback", diagnostics: fallbackDiagnostics("not_configured", startedAt, 0, clock) }
  const extras: PlanningExtras = { ...params.extras, currentTopicFood: params.extras?.currentTopicFood ?? params.currentTopicFood }
  let plannerCalls = 0
  // Shared deterministic frame, built once per turn (pure; a failure just removes the frame-backed behaviors).
  let query: { frame: UserQueryFrame; retrieval: RetrievalDecision } | null = null
  try {
    query = buildGemmaFrame(params.message, params.recent)
  } catch {
    query = null
  }

  try {
    const resolved = resolveConversationContext(params.message, params.recent, { currentTopicFood: extras.currentTopicFood, priorConstraints: extras.priorConstraints, pendingQuestion: extras.pendingClarification?.requestedField === "referent" ? extras.pendingClarification.question : undefined })
    const { context, invalidations } = applyContextLifecycle(params.message, resolved, extras)
    const athleteStateAvailable = Number.isFinite(params.ctx.snapshot.caloriesRemaining)

    const plannerStart = clock()
    let planned = await runPlanner(params.message, context, params.call)
    plannerCalls = 1
    let fallbackStage: 0 | 1 | 2 | 4 = 0
    // Stage 1: ONE retry with reduced context, only for schema / size / transient planner failures.
    if (!planned.ok && RETRYABLE.has(planned.reason)) {
      planned = await runPlanner(params.message, context, params.call, { compact: true })
      plannerCalls = 2
      if (planned.ok) fallbackStage = 1
    }
    const plannerLatencyMs = Math.max(0, clock() - plannerStart)

    let output: PlannerOutput
    let failure: OrchestrationDiagnostics["fallbackReason"]
    if (planned.ok) {
      output = query ? reconcileOutputWithFrame(planned.value, query.frame, { hasActiveDraft: extras.hasActiveDraft }) : planned.value
    } else {
      // Stage 2/4: deterministic understanding, if the evidence resolves the turn; otherwise stage 3 (existing path).
      failure = planned.reason
      // A confident food lookup (food + optional grams resolved by the frame) outranks the generic "continue" guess, which carries no foods.
      const deterministic = (query && !extras.hasActiveDraft ? (frameLookupOutput(query.frame) ?? frameReferenceClarification(query.frame)) : null) ?? deterministicPlannerOutput(params.message, context, extras)
      if (!deterministic) return { kind: "fallback", diagnostics: fallbackDiagnostics(planned.reason, startedAt, plannerCalls, clock, { plannerLatencyMs }) }
      output = deterministic
      fallbackStage = deterministic.strategy.mode === "CLARIFY" ? 4 : 2
    }

    const plan = buildPlan(output, context, params.ctx.guards, { athleteStateAvailable, message: params.message, extras, invalidations, fallbackUsed: fallbackStage !== 0, plannerFailureReason: failure })
    if (validateToolPlan(plan.toolPlan).length > 0) return { kind: "fallback", diagnostics: fallbackDiagnostics("invalid_plan", startedAt, plannerCalls, clock, { plannerLatencyMs }) }
    // Shared query layer: reconcile planner foods with the deterministic frame, then verify each food once (async) so the
    // tool run below stays synchronous and pure. A failure here degrades to the legacy local-table lookup; it never throws.
    let planned2 = plan
    let resolvedFoods: Record<string, import("@/lib/intelligence/food-resolution").ResolvedFood> = {}
    let foodReference: ResolvedFoodReference | null = null
    try {
      const frame = query?.frame
      if (frame && query && plan.toolNeed.needFoodLookup && plan.foods.length > 0) {
        planned2 = { ...plan, foods: reconcileFoods(plan.foods, frame) }
        const resolve = params.resolveFood ?? (await import("@/lib/intelligence/food-resolution/server")).resolveFood
        resolvedFoods = await resolvePlanFoods(planned2.foods, frame, resolve, extras.foodReference)
        foodReference = foodReferenceFrom(planned2.foods, resolvedFoods)
      }
      if (query) recordGemmaQueryTelemetry(query.frame, query.retrieval, resolvedFoods)
    } catch (error) {
      console.warn("[query-understanding] shared query step failed:", error instanceof Error ? `${error.name}: ${error.message.slice(0, 120)}` : "unknown")
      resolvedFoods = {}
      foodReference = null
    }
    const results = runDeterministicTools(planned2, params.ctx, { activeDraftItems: extras.activeDraftItems, resolvedFoods })
    return { kind: "plan", plan: planned2, context, results, foodReference, startedAt, plannerCalls, plannerLatencyMs, fallbackStage, ...(failure ? { fallbackReason: failure } : {}) }
  } catch {
    return { kind: "fallback", diagnostics: fallbackDiagnostics("error", startedAt, plannerCalls || 1, clock) }
  }
}

export function planDiagnostics(
  plan: OrchestrationPlan,
  startedAt: number,
  extra: { retrievalUsed: boolean; budget?: ContextBudget; plannerCalls?: number; plannerLatencyMs?: number; fallbackStage?: 0 | 1 | 2 | 4; fallbackReason?: OrchestrationDiagnostics["fallbackReason"]; clock?: () => number },
): OrchestrationDiagnostics {
  const stage = extra.fallbackStage ?? 0
  return {
    conversationContinuation: plan.understanding.continuationOfPreviousTurn,
    referencedPriorOffer: plan.understanding.referencedPriorOffer,
    responseMode: plan.strategy.mode,
    toolNeeds: plan.strategy.useTools,
    clarificationNeeded: plan.toolNeed.needClarification,
    retrievalUsed: extra.retrievalUsed,
    athleteStateUsed: plan.toolNeed.needAthleteState,
    confirmationRequired: plan.strategy.requiresConfirmation,
    orchestrationLatencyMs: Math.max(0, (extra.clock ?? Date.now)() - startedAt),
    source: stage >= 2 ? "deterministic" : "model",
    ...(extra.fallbackReason ? { fallbackReason: extra.fallbackReason } : {}),
    plannerCalls: extra.plannerCalls ?? 1,
    responseDepth: plan.strategy.responseDepth,
    ...(plan.strategy.continuationTarget ? { continuationTarget: plan.strategy.continuationTarget } : {}),
    selectedContextSources: extra.budget?.included ?? [],
    droppedContextCount: extra.budget?.metrics.droppedContextCount ?? 0,
    plannerConfidence: plan.plannerConfidence,
    contextChars: extra.budget?.metrics.totalContextChars ?? 0,
    plannerLatencyMs: extra.plannerLatencyMs ?? 0,
    fallbackStage: stage,
    degradedCapabilities: stage > 0 ? ["model_planner"] : [],
    contextBudgetExceeded: extra.budget?.exceeded ?? false,
    invalidationTriggers: plan.contextInvalidations.map((invalidation) => invalidation.trigger),
  }
}
