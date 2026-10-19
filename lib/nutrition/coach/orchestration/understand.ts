import { extractJson, validatePlannerOutput, type ValidationResult } from "./validate"
import { CLARIFICATION_AFFECTS, RESPONSE_DEPTHS, RESPONSE_MODES, type ConversationContext } from "./types"

/** One bounded model call. Returns the raw reply text, or null on any failure. Injected so the layer stays pure/testable. */
export type ModelCall = (prompt: string) => Promise<string | null>

export const PLANNER_MARKER = "NUTRITION COACH ORCHESTRATION PLANNER"

/**
 * Planner prompt = the PLANNER layer only: it sees the bounded conversation evidence, never database rows,
 * never numbers it could be tempted to reuse. It describes the turn; it decides nothing and authorizes nothing.
 */
export function buildPlannerPrompt(message: string, context: ConversationContext, options: { compact?: boolean } = {}): string {
  const evidence = {
    language: context.language,
    recentTurns: context.turns.slice(options.compact ? -2 : -4).map((turn) => ({ who: turn.role === "user" ? "USER" : "COACH", text: options.compact ? turn.text.slice(0, 160) : turn.text })),
    lastCoachOffer: context.lastAssistantOffer,
    unresolvedQuestion: context.unresolvedQuestion,
    presentedOptions: context.presentedOptions.map((option) => ({ n: option.index, label: option.label, text: option.text })),
    optionAlreadyChosen: context.selectedOption ? context.selectedOption.index : null,
    foodsInPlay: context.referencedFoods,
    amountsInPlay: context.referencedAmounts,
    constraintsInPlay: context.activeConstraints,
    userIsCorrectingEarlierInference: Boolean(context.correction),
    shortFollowUp: context.isShortFollowUp,
    ambiguousReferents: context.referentCandidates,
  }
  return `${PLANNER_MARKER}. Describe what the user needs RIGHT NOW so the coach can respond naturally. Return one JSON object and no prose.
You describe; you do not decide, calculate, log or authorize anything.
{"understanding":{"userGoal":string|null,"explicitRequests":string[],"implicitNeeds":string[],"referencedEntities":string[],"constraints":string[],"uncertainties":string[],"continuationOfPreviousTurn":boolean,"referencedPriorOffer":boolean,"referencedOption":number|null,"proposedResponseStrategy":string|null},
"need":{"primaryNeed":string,"secondaryNeeds":string[],"needExactCalculation":boolean,"needFoodLookup":boolean,"needKnowledgeRetrieval":boolean,"needAthleteState":boolean,"needClarification":boolean,"needActionConfirmation":boolean,"confidence":"LOW"|"MEDIUM"|"HIGH"},
"strategy":{"mode":${RESPONSE_MODES.map((mode) => `"${mode}"`).join("|")},"primaryObjective":string,"supportingObjectives":string[],"requiresConfirmation":boolean,"responseDepth":${RESPONSE_DEPTHS.map((depth) => `"${depth}"`).join("|")}},
"clarification":{"question":string,"affects":${CLARIFICATION_AFFECTS.map((a) => `"${a}"`).join("|")}}|null,
"foods":[{"text":string,"grams":number|null}]}
Rules:
- mode CONTINUE = the user continues an existing task (accepts/rejects the last offer, picks an option, tweaks the current proposal: "same but cheaper", "without milk"). Use it only when such a task exists in the evidence; do not restart it, and do not ask for what the evidence already holds.
- mode ASK_ONE_QUESTION = ONE missing fact; CLARIFY = the referent or intent is ambiguous. Never both.
- Resolve short follow-ups ("yes", "the second one", "make it higher protein", "why?", Vietnamese or mixed) against lastCoachOffer / presentedOptions / recentTurns. "yes" to lastCoachOffer means the user accepted THAT offer: set referencedPriorOffer true.
- A message can carry several needs at once (hunger, remaining calories, taste, protein, convenience). Plan ONE coherent response, not one keyword intent.
- Ask (clarification) ONLY if a missing detail would materially change safety, an exact calculation, the recommended option, or a requested action, and it is not already in recentTurns, foodsInPlay or constraintsInPlay. One question. Otherwise answer with a useful default.
- If the user corrects themselves ("no, I meant dinner"), the correction replaces the earlier inference.
- needExactCalculation / needAthleteState only when exact calories, macros, or remaining-today numbers are needed. needKnowledgeRetrieval only when strategy knowledge (recipes, techniques, cuisine tactics) would help; never for "yes", quantity tweaks, or remaining-macro questions.
- "foods" lists foods to size or fit, in the user's words, with grams only if stated.
- needActionConfirmation is true if the user seems to want a meal logged or a plan changed. Understanding is never consent: an acknowledgement like "that works" is NOT permission to log.
- Do not infer stable preferences, allergies, diagnoses, or goals. Use the user's language for any clarification question.
EVIDENCE: ${JSON.stringify(evidence)}
MESSAGE: ${JSON.stringify(message)}`
}

export async function runPlanner(message: string, context: ConversationContext, call: ModelCall, options: { compact?: boolean } = {}): Promise<ValidationResult | { ok: false; reason: "model_failed" }> {
  const reply = await call(buildPlannerPrompt(message, context, options))
  if (!reply) return { ok: false, reason: "model_failed" }
  return validatePlannerOutput(extractJson(reply), context)
}
