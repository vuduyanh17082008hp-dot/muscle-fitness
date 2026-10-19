import type { ResolvedFood } from "@/lib/intelligence/food-resolution"

/**
 * N1.6.4 Adaptive Conversation Orchestration — shared types.
 *
 * Everything here is DESCRIPTIVE. Nothing in these structures authorizes an
 * action, writes state, creates a preference or stores a memory. There is no
 * free-form reasoning field by design (compact operational fields only).
 */

export type Language = "en" | "vi" | "mixed"
export type NeedConfidence = "LOW" | "MEDIUM" | "HIGH"

export const RESPONSE_MODES = ["ANSWER", "PROPOSE", "CONTINUE", "ASK_ONE_QUESTION", "CLARIFY", "ESCALATE", "REFUSE_POLICY", "SAFE_REDIRECT"] as const
export type ResponseMode = (typeof RESPONSE_MODES)[number]

export const CLARIFICATION_AFFECTS = ["safety", "calculation", "option", "action", "none"] as const
export const CONTINUATION_TARGETS = ["PRIOR_OFFER", "ACTIVE_DRAFT", "LAST_ASSISTANT_REFERENT", "PENDING_CHOICE", "ACTIVE_MODIFICATION", "PENDING_CLARIFICATION"] as const
export type ContinuationTarget = (typeof CONTINUATION_TARGETS)[number]

export const RESPONSE_DEPTHS = ["SHORT", "NORMAL", "DETAILED"] as const
export type ResponseDepth = (typeof RESPONSE_DEPTHS)[number]

export type ClarificationAffects = (typeof CLARIFICATION_AFFECTS)[number]

export type PresentedOption = { index: number; label: string; text: string }

/**
 * THE ONE OWNER of "which options did the assistant actually show?". Built from the FINAL emitted response (its text and
 * structured blocks) at the moment it is returned, never from a candidate list. The follow-up resolver may select only from
 * this set; a hidden engine/model candidate that is not in it cannot be picked. It is re-validated against the conversation
 * every turn (the client echoes it, so it is never trusted on its own).
 */
export type PresentedOptionSnapshot = {
  responseId: string
  /** ENGINE: the structured OPTION_LIST block (ids resolve in the follow-up meals). CONVERSATION: the coach's own written list. */
  owner: "ENGINE" | "CONVERSATION"
  options: Array<{ index: number; entityId: string; label: string; sourceRef: string; provenance: "ASSISTANT_DISPLAYED_OPTION" }>
  createdAtServer: string
  expiresAt: string
}

export const CLARIFICATION_FIELDS = ["calorieTarget", "quantity", "referent", "slot", "other"] as const
export type ClarificationField = (typeof CLARIFICATION_FIELDS)[number]

/** WHY a blocking question was asked and WHAT to resume once it is answered. Lives for exactly one answer. */
export type PendingClarification = {
  questionType: ClarificationAffects
  requestedField: ClarificationField
  question: string
  /** The user request the question interrupted (the answer resumes it; the user never has to repeat it). */
  resumeIntent: string
  resumeTaskRef: "remaining_calories" | "request"
  createdAtServer: string
  expiresAt: string
}

/** A pending clarification that THIS message answers: the plan resumes `request` with `answer` bound to `field`. */
export type ResumeTask = {
  field: ClarificationField
  question: string
  answer: string
  request: string
  taskRef: PendingClarification["resumeTaskRef"]
  /** Calories the user said they already ate (their own words, explicit correction applied); null when never stated. */
  statedConsumed: number | null
}

/**
 * NO ACTIVE ENTITY WITHOUT VALID PROVENANCE. The meal/food the turn is about must trace to the current user message,
 * an option the coach actually displayed, the server-held active draft, or a deterministic tool result.
 */
export const ENTITY_SOURCES = ["USER_MESSAGE", "ASSISTANT_DISPLAYED_OPTION", "ASSISTANT_TURN", "ACTIVE_DRAFT", "SERVER_TOPIC", "CONVERSATION_STATE", "TOOL_RESULT"] as const
export type ActiveEntityReference = {
  entityId: string
  label: string
  sourceType: (typeof ENTITY_SOURCES)[number]
  /** `message`, `snapshot:<responseId>#<optionIndex>`, `turn:<turnsAgo>#<optionIndex>` (no snapshot), `turn:<turnsAgo>`, `draft`, `topic`, `state`, or `tool`. */
  sourceRef: string
  /** Turns ago (0 = this message). */
  createdTurn: number
  lastValidatedTurn: number
}

/** Budget numbers the USER stated, with explicit-correction precedence applied. Never inferred, never from the model. */
export type StatedBudget = {
  remainingCalories: number | null
  consumedCalories: number | null
  /** A remaining-calories value the user retracted this turn: it must not be reused or echoed. */
  invalidatedRemaining: number | null
}

/** Bounded view of the recent conversation. Built deterministically, never from the whole history. */
export type ConversationContext = {
  language: Language
  /** Turns considered (newest last), already truncated and limited to the recency window. */
  turns: Array<{ role: "user" | "coach"; text: string; turnsAgo: number }>
  lastUserRequest: string | null
  /** A question/offer the immediately preceding coach turn ended with. Expires after one user turn. */
  lastAssistantOffer: string | null
  unresolvedQuestion: string | null
  presentedOptions: PresentedOption[]
  /** The option the user picked (this turn or an earlier turn since the options were shown). */
  selectedOption: PresentedOption | null
  /** True when the current message is short and leans on context ("yes", "make it higher protein"). */
  isShortFollowUp: boolean
  isAffirmation: boolean
  isNegation: boolean
  /** The user is correcting an earlier inference ("no, I meant dinner"). Explicit correction beats prior inference. */
  correction: { text: string } | null
  /** The message is itself a bare pronoun-edit ("make it bigger") that needs a referent. */
  pronounEdit: boolean
  referencedFoods: string[]
  referencedAmounts: string[]
  /** Hard-ish constraints visible in the window (meal slot, calorie caps...). Current message wins over older turns. */
  activeConstraints: string[]
  mealSlot: string | null
  /** Things "it/that" could equally mean right now (unselected options, or several foods in the last two turns). */
  referentCandidates: string[]
  /** "the other one" / "another one": names something NOT currently selected, so the selection cannot answer it. */
  otherReference: boolean
  statedBudget: StatedBudget
  /** Context items the current message superseded (kept for diagnostics only; never sent to the model). */
  supersededFoods: string[]
}

export type TurnUnderstanding = {
  userGoal: string | null
  explicitRequests: string[]
  implicitNeeds: string[]
  referencedEntities: string[]
  constraints: string[]
  uncertainties: string[]
  continuationOfPreviousTurn: boolean
  referencedPriorOffer: boolean
  /** 1-based index of a presented option the user means, or null. Validated against the real options. */
  referencedOption: number | null
  proposedResponseStrategy: string | null
}

export type ClientNeedModel = {
  primaryNeed: string
  secondaryNeeds: string[]
  needExactCalculation: boolean
  needFoodLookup: boolean
  needKnowledgeRetrieval: boolean
  needAthleteState: boolean
  needClarification: boolean
  needActionConfirmation: boolean
  confidence: NeedConfidence
}

export type ToolNeedDecision = {
  needFoodLookup: boolean
  needMacroCalculation: boolean
  needKnowledgeRetrieval: boolean
  needAthleteState: boolean
  needClarification: boolean
  needActionTool: boolean
  /** Phase 2: remaining/target macros from nutrition state (the numbers). */
  needNutritionState: boolean
  /** Phase 2: goal / training context from Athlete State (only when it improves the answer). */
  needGoalContext: boolean
  /** Phase 2: the turn references a pending draft/proposal/log; understanding it never authorizes it. */
  needPendingAction: boolean
  reason: string
}

/** What information is needed/allowed this turn. Derived from the tool decision + strategy (single owner: needs.ts). */
export type ContextNeedDecision = {
  recentConversation: boolean
  athleteState: boolean
  nutritionState: boolean
  pendingActionState: boolean
  retrievedKnowledge: boolean
  resolvedFoodData: boolean
  hardConstraints: boolean
  reasonCodes: string[]
}

export const TOOL_STEP_KINDS = ["athlete_state_read", "food_lookup", "macro_calculation", "knowledge_retrieval"] as const
export type ToolStepKind = (typeof TOOL_STEP_KINDS)[number]
export type ToolStep = { stepId: string; tool: ToolStepKind; inputRefs: string[]; outputRef: string; dependsOnStepIds: string[] }
export type ToolExecutionPlan = { steps: ToolStep[] }

export type ContextBudgetLimits = {
  maxRecentTurns: number
  maxRecentTurnChars: number
  maxStateSections: number
  maxRetrievalChunks: number
  maxRetrievalChars: number
  maxToolResultChars: number
  maxTotalContextChars: number
  truncationPolicy: "drop_lowest_priority_first_never_required"
}

export const INVALIDATION_TRIGGERS = ["EXPLICIT_NEW_TOPIC", "USER_CLEARS_CONTEXT", "REFERENT_EXPIRED", "TURN_LIMIT_REACHED", "CONTRADICTION_DETECTED"] as const
export type InvalidationTrigger = (typeof INVALIDATION_TRIGGERS)[number]
export type ContextInvalidation = { trigger: InvalidationTrigger; invalidatedRefs: string[]; retainedRefs: string[]; reasonCode: string }

/** Binding for any exact number the response may state: it may be explained and rounded, never recomputed or invented. */
export type MacroResultBinding = {
  calculationId: string
  /** The entity these numbers describe (ActiveEntityReference.entityId). A binding whose entityRef is not the active entity is rejected. */
  entityRef?: string
  source: "DETERMINISTIC_SERVICE"
  allowedInResponse: true
  mayRound: true
  mayRecalculate: false
  mayInvent: false
}

export const ORCHESTRATION_TOOLS = ["food_lookup", "macro_calculator", "knowledge_retrieval", "athlete_state"] as const
export type OrchestrationTool = (typeof ORCHESTRATION_TOOLS)[number]

export type ResponseStrategy = {
  mode: ResponseMode
  /** REQUIRED when mode = CONTINUE. Derived from validated context, never taken from the model. */
  continuationTarget?: ContinuationTarget
  primaryObjective: string
  supportingObjectives: string[]
  responseDepth: ResponseDepth
  useTools: OrchestrationTool[]
  requiresConfirmation: boolean
  unresolvedUnknowns: string[]
}

export type Clarification = { question: string; affects: ClarificationAffects }

/** What the planner call returns (after validation). */
export type PlannerOutput = {
  understanding: TurnUnderstanding
  need: ClientNeedModel
  strategy: Pick<ResponseStrategy, "mode" | "primaryObjective" | "supportingObjectives" | "requiresConfirmation"> & { responseDepth?: ResponseDepth }
  clarification: Clarification | null
  /** Foods the user wants worked with, in the user's words (resolved by deterministic tools, never by the model). */
  foods: Array<{ text: string; grams: number | null }>
}

/** The validated plan the response layer follows. */
export type OrchestrationPlan = {
  understanding: TurnUnderstanding
  need: ClientNeedModel
  toolNeed: ToolNeedDecision
  strategy: ResponseStrategy
  clarification: Clarification | null
  foods: PlannerOutput["foods"]
  /** Hard constraints the response must respect, in priority order (safety/allergy first). */
  hardConstraints: string[]
  // ---- Phase 2 (adaptive planning) ----
  contextNeed: ContextNeedDecision
  toolPlan: ToolExecutionPlan
  /** Context refs the budget selected / dropped (filled by buildContextBudget; empty until then). */
  selectedContextRefs: string[]
  droppedContextRefs: string[]
  contextInvalidations: ContextInvalidation[]
  plannerConfidence: NeedConfidence
  plannerFailureReason?: string
  fallbackUsed: boolean
  /** Set when this message answers a pending clarification: the interrupted request is resumed with the answer bound to its field. */
  resume?: ResumeTask | null
  /** The single entity this turn applies to, only when its provenance validated (null = none / rejected). */
  activeEntity: ActiveEntityReference | null
  /** Planner-named entities dropped because nothing in the conversation or tool output supports them. */
  rejectedEntities: string[]
}

/** Privacy-safe: enums, booleans and counts only. No message text, no foods, no reasoning. */
export type OrchestrationDiagnostics = {
  conversationContinuation: boolean
  referencedPriorOffer: boolean
  responseMode: ResponseMode | null
  toolNeeds: OrchestrationTool[]
  clarificationNeeded: boolean
  retrievalUsed: boolean
  athleteStateUsed: boolean
  confirmationRequired: boolean
  orchestrationLatencyMs: number
  source: "model" | "deterministic" | "fallback"
  fallbackReason?: "not_configured" | "model_failed" | "malformed" | "invalid_plan" | "error" | "context_budget_exceeded"
  plannerCalls: number
  // ---- Phase 2 observability (enums, booleans, counts only) ----
  responseDepth?: ResponseDepth
  continuationTarget?: ContinuationTarget
  selectedContextSources?: string[]
  droppedContextCount?: number
  plannerConfidence?: NeedConfidence
  contextChars?: number
  plannerLatencyMs?: number
  /** 0 none, 1 planner retry, 2 deterministic understanding, 3 existing coach path, 4 safe clarification. */
  fallbackStage?: 0 | 1 | 2 | 3 | 4
  degradedCapabilities?: string[]
  contextBudgetExceeded?: boolean
  invalidationTriggers?: InvalidationTrigger[]
}

/** Server-held facts about the live conversation that the planner may reference (never client-trusted for authorization). */
export type PlanningExtras = {
  currentTopicFood?: string | null
  hasActiveDraft?: boolean
  /** Durable user constraints echoed from earlier turns of this conversation (already shape-validated by durableConstraints). */
  priorConstraints?: string[]
  /** The option the user picked on an earlier turn, echoed in the conversation focus (outlives the 6-message window). */
  priorActiveItem?: string | null
  /** The server-held active draft's name (a valid entity source; never client-asserted authorization). */
  activeDraftName?: string | null
  pendingAction?: { kind: string; name: string } | null
  /** The shared follow-up state said the topic changed (resolveTurn). */
  newTopic?: boolean
  /** Server time + whether the server-stamped follow-up context is past its server-side expiry. */
  nowMs?: number
  followUpExpiredByServerTime?: boolean
  /** The displayed-option snapshot (already validated against the conversation). null = nothing selectable is on screen. */
  snapshot?: PresentedOptionSnapshot | null
  /** The blocking question the previous turn asked, if this message may be its answer. */
  pendingClarification?: PendingClarification | null
  /** Items of the server-held active draft: the only engine data an ACTIVE_DRAFT entity's exact macros may come from. */
  activeDraftItems?: Array<{ ingredientId: string; grams: number }> | null
  /** Shared food resolver results keyed by the planner's food text (local canonical or USDA). Computed before the sync tool run. */
  resolvedFoods?: Record<string, ResolvedFood>
  /** The food the previous turn's tools resolved (echoed state, identity + basis only; numbers are always re-resolved). */
  foodReference?: { canonicalName: string; provider: "LOCAL_CANONICAL" | "USDA_FDC"; sourceId: string; basis: "raw" | "cooked" | "prepared" | "packaged" | "unknown"; base: string } | null
}

export type RecentMessage = { role: "user" | "coach"; text: string }
