import type { ProfileGuards } from "../types"

import { chooseDepth, clarificationMode, effectiveConfidence, isMaterial, referentQuestion, resolveContinuation } from "./continuation"
import { decideNeeds } from "./needs"
import { deriveActiveEntity, groundEntities, hasProvenance } from "./provenance"
import { buildToolPlan } from "./toolplan"
import type { Clarification, ContextInvalidation, ConversationContext, OrchestrationPlan, OrchestrationTool, PlanningExtras, PlannerOutput } from "./types"

/**
 * Policy layer: turns a validated planner output into the plan the response follows.
 *
 * The model proposes; this file decides. It owns the hard boundaries:
 *  - a CONTINUE is real only with a continuation target resolved from validated context (never from the model);
 *  - clarification only when missing info materially changes safety / calculation / option / action
 *    AND the answer is not already in the conversation, state, or tool output;
 *  - CLARIFY (ambiguous referent/intent) and ASK_ONE_QUESTION (one missing fact) are distinct and never combined;
 *  - tool/context needs come from needs.ts (one owner); the ToolExecutionPlan makes execution order explicit;
 *  - nothing here can authorize an action (needActionTool only ever means "needs the user's confirmation").
 */

/** The canonical daily calorie/protein target is in the snapshot whenever state is available: never ask the user for it again. */
const KNOWN_TARGET = /\b(?:protein|calorie|calories|kcal|macro|macros)\b[^?]{0,30}\b(?:goal|target)\b|\b(?:goal|target)\b[^?]{0,30}\b(?:protein|calorie|calories|kcal|macro|macros)\b|mục tiêu (?:protein|đạm|calo)/i
const KNOWN_REMAINING =/\b(?:remaining|left (?:today|over)|calories? left|macros? left|how much (?:do )?i (?:have|got) left)\b|còn lại|còn bao nhiêu/i
const KNOWN_SLOT = /\b(?:which|what) meal\b|\bbreakfast, lunch\b|bữa nào/i

/** "make it bigger" with several equally plausible referents and no selection => ask, don't guess. */
export function isAmbiguousReferent(context: ConversationContext): boolean {
  return (context.pronounEdit || context.otherReference) && context.referentCandidates.length >= 2
}

// A pick or a tweak revises a proposal in conversation; only an explicit log/save/apply is a state change worth confirming.
const MUTATION_CUE = /(?<![\p{L}\p{N}])(?:log|save|confirm|apply|track|record|add (?:it |this |that )?to (?:my )?(?:log|diary|day)|ghi lại|lưu|thêm vào nhật ký)(?![\p{L}\p{N}])/iu
const NON_MUTATING_TARGETS = new Set(["PENDING_CHOICE", "ACTIVE_MODIFICATION", "PENDING_CLARIFICATION"])

/** The user retracted a "remaining" figure and nothing trusted can replace it: ask the one thing that does, never guess. */
const budgetCorrectionQuestion = (context: ConversationContext): string => {
  const eaten = context.statedBudget.consumedCalories
  return context.language === "en"
    ? `Got it${eaten ? ` — ${eaten} calories is what you've already eaten, not what's left` : ""}. What's your calorie target for today, so I can work out what remains?`
    : `Mình hiểu rồi${eaten ? ` — ${eaten} calo là phần bạn đã ăn, không phải phần còn lại` : ""}. Mục tiêu calo hôm nay của bạn là bao nhiêu để mình tính phần còn lại?`
}

function gateClarification(proposed: Clarification | null, message: string, context: ConversationContext, hasState: boolean): Clarification | null {
  let clarification = proposed
  if (clarification) {
    if (!isMaterial(clarification, message, context)) clarification = null
    // Do not ask for what state / the conversation already holds.
    else if (hasState && (KNOWN_REMAINING.test(clarification.question) || KNOWN_TARGET.test(clarification.question))) clarification = null
    else if (context.mealSlot && KNOWN_SLOT.test(clarification.question)) clarification = null
  }
  if (!clarification && isAmbiguousReferent(context)) return { question: referentQuestion(context), affects: "option" }
  return clarification
}

export function buildHardConstraints(guards: Pick<ProfileGuards, "allergies" | "excludedFoods">, context: ConversationContext): string[] {
  // Priority: safety/allergy > explicit exclusions > exact state constraints > goal > need > preferences > convenience.
  const ordered = [
    ...guards.allergies.map((item) => `allergy:${item}`),
    ...guards.excludedFoods.map((item) => `exclude:${item}`),
    ...context.activeConstraints.filter((c) => c.startsWith("without:") || c.startsWith("diet:")),
    ...context.activeConstraints.filter((c) => c.startsWith("max_kcal:")),
    ...context.activeConstraints.filter((c) => c.startsWith("min_protein:")),
    ...context.activeConstraints.filter((c) => c === "low_prep"),
    ...context.activeConstraints.filter((c) => c.startsWith("meal:")),
    ...context.activeConstraints.filter((c) => c.startsWith("taste:")),
  ]
  return [...new Set(ordered)]
}

export type PlanOptions = {
  athleteStateAvailable: boolean
  /** The current user message (enables material-question, depth and personal-state policy). Phase 1 callers may omit it. */
  message?: string
  extras?: PlanningExtras
  invalidations?: ContextInvalidation[]
  fallbackUsed?: boolean
  plannerFailureReason?: string
}

export function buildPlan(output: PlannerOutput, context: ConversationContext, guards: Pick<ProfileGuards, "allergies" | "excludedFoods">, options: PlanOptions): OrchestrationPlan {
  const message = options.message
  const extras = options.extras ?? {}
  const need = { ...output.need }
  const strategy = { ...output.strategy }
  const understanding = { ...output.understanding }
  const terminal = strategy.mode === "REFUSE_POLICY" || strategy.mode === "SAFE_REDIRECT" || strategy.mode === "ESCALATE"

  // A bare "yes"/"no"/option pick is a continuation of the previous turn by definition.
  if ((context.isAffirmation || context.isNegation || context.selectedOption) && context.isShortFollowUp) understanding.continuationOfPreviousTurn = true
  if (context.isAffirmation && context.lastAssistantOffer) understanding.referencedPriorOffer = true
  // An explicit correction overrides the previous inference.
  if (context.correction) understanding.continuationOfPreviousTurn = true

  // Entities the planner names must be supported by the conversation or an offered option; invented ones are dropped.
  // (Phase 1 callers that pass no message have nothing to ground against and keep the planner's output as-is.)
  const groundedEntities = message === undefined ? { kept: understanding.referencedEntities, rejected: [] as string[] } : groundEntities(understanding.referencedEntities, message, context)
  understanding.referencedEntities = groundedEntities.kept
  const groundedFoods = message === undefined ? output.foods : output.foods.filter((food) => groundEntities([food.text], message, context, { lenient: true }).kept.length > 0)
  const rejectedEntities = [...groundedEntities.rejected, ...output.foods.filter((food) => !groundedFoods.includes(food)).map((food) => food.text)]

  let clarification = gateClarification(output.clarification, message ?? "", context, options.athleteStateAvailable)
  // Explicit correction beats prior state: a retracted "remaining" figure is never reused. With trusted state the remaining
  // amount is recomputed deterministically (needs.ts); without it we ask for the one input that unlocks it.
  const budgetCorrected = context.correction !== null && context.statedBudget.invalidatedRemaining !== null
  if (budgetCorrected && !options.athleteStateAvailable && !clarification && !terminal) clarification = { question: budgetCorrectionQuestion(context), affects: "calculation" }
  let mode = strategy.mode
  let target: OrchestrationPlan["strategy"]["continuationTarget"]
  let unresolvedContinuation = false

  // NO ACTIVE ENTITY WITHOUT VALID PROVENANCE: the entity must re-resolve against the real conversation / server state.
  const candidateEntity = deriveActiveEntity(message ?? "", context, extras)
  const activeEntity = candidateEntity && hasProvenance(candidateEntity, message ?? "", context, extras) ? candidateEntity : null

  if (!terminal) {
    const modelContinues = understanding.continuationOfPreviousTurn || mode === "CONTINUE"
    const resolved = clarification ? null : resolveContinuation(message ?? "", context, extras, modelContinues)
    // A modification of "it" needs an "it" with provenance; without one the continuation is unresolved (clarify / answer standalone).
    const continuation = resolved && (resolved.target === "ACTIVE_MODIFICATION" || resolved.target === "ACTIVE_DRAFT") && !activeEntity ? null : resolved
    if (clarification) {
      mode = clarificationMode(clarification)
    } else if (continuation) {
      mode = "CONTINUE"
      target = continuation.target
      understanding.continuationOfPreviousTurn = true
      if (continuation.target === "PENDING_CHOICE" && context.selectedOption) understanding.referencedOption = context.selectedOption.index
    } else if (mode === "CONTINUE" || (modelContinues && (context.pronounEdit || context.isShortFollowUp) && need.confidence === "LOW")) {
      // CONTINUE needs a resolvable target. Without one: ask (the message leans on context we cannot resolve) or answer standalone.
      if (context.isShortFollowUp || context.pronounEdit) {
        unresolvedContinuation = true
        clarification = { question: referentQuestion(context), affects: "option" }
        mode = "CLARIFY"
      } else {
        mode = "ANSWER"
      }
    } else if (mode === "ASK_ONE_QUESTION" || mode === "CLARIFY") {
      mode = "ANSWER"
    }
    // LOW confidence never guesses a soft referent.
    if (!clarification && mode === "CONTINUE" && need.confidence === "LOW" && continuation?.evidence === "soft") {
      unresolvedContinuation = true
      clarification = { question: referentQuestion(context), affects: "option" }
      mode = "CLARIFY"
      target = undefined
    }
  }
  // The answer to the previous blocking question: bind it to the field that was asked and resume the interrupted request.
  const pending = extras.pendingClarification
  const resume: OrchestrationPlan["resume"] = mode === "CONTINUE" && target === "PENDING_CLARIFICATION" && pending
    ? { field: pending.requestedField, question: pending.question, answer: (message ?? "").slice(0, 160), request: pending.resumeIntent, taskRef: pending.resumeTaskRef, statedConsumed: context.statedBudget.consumedCalories }
    : null
  const asking = clarification !== null && !terminal
  if (terminal) clarification = null

  // Selecting an option / tweaking the current proposal is not a state mutation: never ask to "confirm the choice".
  if (mode === "CONTINUE" && target !== undefined && NON_MUTATING_TARGETS.has(target) && !MUTATION_CUE.test(message ?? "")) {
    need.needActionConfirmation = false
    strategy.requiresConfirmation = false
  }

  const { toolNeed, contextNeed, foods } = decideNeeds({ message, output: { ...output, need, foods: groundedFoods }, context, mode, target, asking, terminal, extras, nutritionStateAvailable: options.athleteStateAvailable })

  const useTools: OrchestrationTool[] = [
    ...(toolNeed.needFoodLookup ? (["food_lookup"] as const) : []),
    ...(toolNeed.needMacroCalculation ? (["macro_calculator"] as const) : []),
    ...(toolNeed.needKnowledgeRetrieval ? (["knowledge_retrieval"] as const) : []),
    ...(toolNeed.needAthleteState ? (["athlete_state"] as const) : []),
  ]

  const plannerConfidence = effectiveConfidence(need.confidence, { ambiguousReferent: asking && mode === "CLARIFY", unresolvedContinuation })

  return {
    understanding,
    need: { ...need, needExactCalculation: toolNeed.needMacroCalculation, needFoodLookup: toolNeed.needFoodLookup, needAthleteState: toolNeed.needAthleteState, needKnowledgeRetrieval: toolNeed.needKnowledgeRetrieval, needClarification: asking },
    toolNeed,
    strategy: {
      mode,
      ...(mode === "CONTINUE" && target ? { continuationTarget: target } : {}),
      primaryObjective: strategy.primaryObjective,
      supportingObjectives: strategy.supportingObjectives,
      responseDepth: chooseDepth({ mode, message: message ?? "", context, proposed: strategy.responseDepth }),
      useTools,
      requiresConfirmation: strategy.requiresConfirmation || toolNeed.needActionTool,
      unresolvedUnknowns: [...understanding.uncertainties.slice(0, 3), ...(clarification ? [clarification.affects] : [])].slice(0, 4),
    },
    clarification: asking ? clarification : null,
    foods,
    hardConstraints: buildHardConstraints(guards, context),
    contextNeed,
    toolPlan: buildToolPlan(toolNeed),
    selectedContextRefs: [],
    droppedContextRefs: [],
    contextInvalidations: options.invalidations ?? [],
    plannerConfidence,
    ...(options.plannerFailureReason ? { plannerFailureReason: options.plannerFailureReason } : {}),
    fallbackUsed: options.fallbackUsed ?? false,
    resume,
    activeEntity,
    rejectedEntities,
  }
}
