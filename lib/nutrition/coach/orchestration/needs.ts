import type { ContextNeedDecision, ConversationContext, ContinuationTarget, PlanningExtras, PlannerOutput, ResponseMode, ToolNeedDecision } from "./types"

/**
 * Single owner of "what is needed" decisions. ToolNeedDecision is derived first; ContextNeedDecision is then
 * DERIVED from it, so the two can never disagree (checkDecisionConsistency proves it in tests).
 *
 * Principles: context helps the model understand; tools provide exactness; need != permission. Nothing here
 * executes anything. Continuity-only turns ("yes", "the second one", "same but cheaper") need no tools unless an
 * exact number is genuinely required.
 */

// Cues that the user is asking about THEIR day/budget — the only thing that makes nutrition/Athlete State relevant.
const PERSONAL_STATE = /(?<![\p{L}\p{N}])(?:my|mine|left|remaining|today|tonight|so far|how much .{0,30}\bi\b|can i (?:still )?(?:fit|have|eat)|should i eat|what should i eat)(?![\p{L}\p{N}])|còn lại|còn bao nhiêu|hôm nay|của tôi|của mình|nên ăn gì|ăn gì/iu
// Accepting an offer to "fit X into what you have left" is an exact-fit request even though the user only said "yes".
const FIT_OFFER = /(?<![\p{L}\p{N}])fit(?:ting)?\b[^?]{0,60}\b(?:macros?|calories|left|remaining|budget|today)|(?:vừa|nhét|xếp)[^?]{0,40}(?:calo|macro|còn lại)/iu

export const isPersonalStateQuestion = (message: string) => PERSONAL_STATE.test(message)
export const offerAsksForFit = (offer: string | null) => Boolean(offer && FIT_OFFER.test(offer))

const CONTINUITY_TARGETS: ContinuationTarget[] = ["PRIOR_OFFER", "PENDING_CHOICE", "ACTIVE_MODIFICATION", "LAST_ASSISTANT_REFERENT", "ACTIVE_DRAFT", "PENDING_CLARIFICATION"]

export type NeedInput = {
  message: string | undefined
  output: PlannerOutput
  context: ConversationContext
  mode: ResponseMode
  target: ContinuationTarget | undefined
  asking: boolean
  terminal: boolean
  extras: PlanningExtras
  /** The deterministic nutrition snapshot is usable (finite remaining macros). */
  nutritionStateAvailable: boolean
}

export function decideNeeds(input: NeedInput): { toolNeed: ToolNeedDecision; contextNeed: ContextNeedDecision; foods: PlannerOutput["foods"] } {
  const { message, output, context, mode, target, asking, terminal, extras } = input
  const need = output.need
  const idle = asking || terminal
  const continuity = mode === "CONTINUE" && target !== undefined && CONTINUITY_TARGETS.includes(target)
  const personal = message === undefined ? true : isPersonalStateQuestion(message)
  const reasons: string[] = []

  const acceptedFitOffer = continuity && target === "PRIOR_OFFER" && context.isAffirmation && offerAsksForFit(context.lastAssistantOffer)
  // The user retracted a remaining-calories figure: the replacement comes from trusted nutrition state, never from the user's
  // number or the model (when state is unavailable the planner asks instead and `idle` skips this).
  const budgetCorrected = context.correction !== null && context.statedBudget.invalidatedRemaining !== null
  const needMacroCalculation = !idle && (need.needExactCalculation || acceptedFitOffer || budgetCorrected)
  if (acceptedFitOffer) reasons.push("accepted_fit_offer")
  if (budgetCorrected) reasons.push("budget_corrected")
  if (needMacroCalculation) reasons.push("exact_values")

  const foods = output.foods.length > 0 ? output.foods : needMacroCalculation && acceptedFitOffer ? context.referencedFoods.slice(0, 3).map((text) => ({ text, grams: null })) : []

  // Food lookup: only when identity/exact data is needed. A continuity turn looks nothing up unless exactness requires it.
  const needFoodLookup = !idle && (needMacroCalculation ? foods.length > 0 : need.needFoodLookup && !continuity)
  if (continuity && !needMacroCalculation) reasons.push("continuity_no_tools")

  // Nutrition state (remaining/targets): exact calculations always; otherwise only for a personal state question.
  const plannerWantsState = need.needAthleteState && !continuity && personal
  const needNutritionState = !idle && input.nutritionStateAvailable && (needMacroCalculation || plannerWantsState)
  if (need.needAthleteState && !continuity && !personal && !needMacroCalculation) reasons.push("general_question_no_state")
  if (needNutritionState && !needMacroCalculation) reasons.push("personal_state_question")

  // Goal / training context: only a personal recommendation, never a continuity turn or a plain number lookup.
  const needGoalContext = !idle && needNutritionState && mode === "PROPOSE" && !continuity && need.needAthleteState && personal
  if (needGoalContext) reasons.push("goal_specific_recommendation")

  // Retrieval: optional support. Never for continuity, questions/redirects, or a plain exact-state lookup.
  const exactStateOnly = needMacroCalculation && foods.length === 0
  const needKnowledgeRetrieval = !idle && !continuity && !context.isAffirmation && !context.isNegation && !exactStateOnly && need.needKnowledgeRetrieval
  if (needKnowledgeRetrieval) reasons.push("knowledge_adds_value")
  if (need.needKnowledgeRetrieval && !needKnowledgeRetrieval && !idle) reasons.push("retrieval_skipped")

  // Pending action: reading it is allowed when the turn references it; understanding it never authorizes it.
  const referencesAction = need.needActionConfirmation || Boolean(extras.pendingAction && (context.isAffirmation || context.isNegation || /(?<![\p{L}\p{N}])(?:log|save|confirm|apply)(?![\p{L}\p{N}])/iu.test(message ?? "")))
  const needPendingAction = !terminal && referencesAction
  if (needPendingAction) reasons.push("pending_action_referenced")

  const toolNeed: ToolNeedDecision = {
    needFoodLookup,
    needMacroCalculation,
    needKnowledgeRetrieval,
    needAthleteState: needNutritionState || needGoalContext,
    needClarification: asking,
    needActionTool: need.needActionConfirmation,
    needNutritionState,
    needGoalContext,
    needPendingAction,
    reason: asking ? "missing information would change the answer" : reasons.filter((code) => !code.endsWith("_no_state") && code !== "retrieval_skipped").join("; ") || "no tool support needed",
  }

  const contextNeed: ContextNeedDecision = {
    recentConversation: !terminal,
    athleteState: toolNeed.needGoalContext,
    nutritionState: toolNeed.needNutritionState,
    pendingActionState: toolNeed.needPendingAction,
    retrievedKnowledge: toolNeed.needKnowledgeRetrieval,
    resolvedFoodData: toolNeed.needFoodLookup || toolNeed.needMacroCalculation,
    hardConstraints: true,
    reasonCodes: reasons,
  }
  return { toolNeed, contextNeed, foods }
}

/** Decision ownership: returns every way the two decisions disagree (empty = consistent). */
export function checkDecisionConsistency(tool: ToolNeedDecision, context: ContextNeedDecision): string[] {
  const errors: string[] = []
  if (tool.needMacroCalculation && !context.nutritionState && !context.resolvedFoodData) errors.push("macro calculation without exposed deterministic inputs")
  if (tool.needMacroCalculation && tool.needFoodLookup && !context.resolvedFoodData) errors.push("macro calculation needs resolved food data")
  if (tool.needNutritionState !== context.nutritionState) errors.push("nutrition state disagreement")
  if (tool.needGoalContext !== context.athleteState) errors.push("athlete state disagreement")
  if (tool.needKnowledgeRetrieval !== context.retrievedKnowledge) errors.push("retrieved knowledge disagreement")
  if (tool.needPendingAction !== context.pendingActionState) errors.push("pending action disagreement")
  if (!context.hardConstraints) errors.push("hard constraints must always be present")
  return errors
}
