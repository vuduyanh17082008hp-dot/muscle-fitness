import { parseOptions, parseSelection, resolveConversationContext } from "./context"
import type { ContextInvalidation, ConversationContext, PlanningExtras } from "./types"

/**
 * Context lifecycle: explicit invalidation > turn-based TTL > server-time TTL.
 *
 * Referents are short-lived conversational pointers, not memory. When one is invalidated it is removed from the
 * context the planner AND the response prompt see, so stale context cannot reach the model. Nothing here is persisted.
 */

/** Turn lifetimes, counted in USER turns after the referent appeared. */
export const REFERENT_TTL = {
  /** Options the user has not picked from yet. */
  pendingChoiceTurns: 2,
  /** A picked option / last assistant referent stays the active referent for this many user turns. */
  selectedReferentTurns: 4,
  /** Server-time ceiling for the follow-up context (secondary to turns; never client-supplied). */
  serverTimeMs: 15 * 60_000,
} as const

const NEW_TOPIC = new RegExp(
  [
    "(?<![\\p{L}\\p{N}])forget\\s+(?:about\\s+)?(?:that|it|this|those|the\\s+([\\p{L}][\\p{L} ]{1,24}?))(?=[,.;!?:]|\\s+(?:and|what|how|can|let|i)\\b|$)",
    "(?<![\\p{L}\\p{N}])(?:never\\s?mind|scrap that|drop (?:that|it)|new topic|change of topic|ignore (?:that|the previous))(?![\\p{L}\\p{N}])",
    "(?<![\\p{L}\\p{N}])let'?s\\s+(?:talk|switch|move)\\s+(?:about|to|on)(?![\\p{L}\\p{N}])",
    "quên\\s+(?:đi|món\\s+đó|chuyện\\s+đó|cái\\s+đó)|thôi\\s+bỏ|bỏ\\s+qua|đổi\\s+(?:chủ\\s+đề|món)|chuyện\\s+khác",
  ].join("|"),
  "iu",
)
const CLEAR = /(?<![\p{L}\p{N}])(?:start over|start again|from scratch|clear (?:it|that|everything|the (?:chat|conversation))|begin again)(?![\p{L}\p{N}])|bắt đầu lại|làm lại từ đầu|xóa hết/iu

const stemOf = (text: string) => text.trim().toLowerCase().replace(/(?:es|s)$/, "")

export type LifecycleResult = { context: ConversationContext; invalidations: ContextInvalidation[] }

const referentsOf = (context: ConversationContext): string[] => [
  ...(context.lastAssistantOffer ? ["priorOffer"] : []),
  ...(context.presentedOptions.length > 0 ? ["pendingChoice"] : []),
  ...(context.selectedOption ? ["selectedOption"] : []),
  ...context.referencedFoods.map((food) => `referent:${food}`),
]

function withoutReferents(context: ConversationContext, keep: Partial<ConversationContext>): ConversationContext {
  return {
    ...context,
    lastAssistantOffer: null,
    unresolvedQuestion: null,
    presentedOptions: [],
    selectedOption: null,
    referentCandidates: [],
    referencedFoods: [],
    referencedAmounts: [],
    supersededFoods: [],
    isShortFollowUp: false,
    isAffirmation: false,
    isNegation: false,
    pronounEdit: false,
    otherReference: false,
    ...keep,
  }
}

export function applyContextLifecycle(message: string, context: ConversationContext, extras: PlanningExtras = {}): LifecycleResult {
  const invalidations: ContextInvalidation[] = []

  // 1. EXPLICIT — wins over everything. The new message stands alone; only its own constraints/foods survive.
  const topic = NEW_TOPIC.exec(message)
  const clear = CLEAR.test(message)
  if (topic || clear || extras.newTopic) {
    const own = resolveConversationContext(message, [])
    const forgotten = topic?.[1] ? stemOf(topic[1]) : null
    const foods = own.referencedFoods.filter((food) => !forgotten || !stemOf(food).includes(forgotten))
    const invalidated = referentsOf(context)
    const next = withoutReferents(context, {
      turns: [],
      lastUserRequest: null,
      referencedFoods: foods,
      activeConstraints: own.activeConstraints,
      mealSlot: own.mealSlot,
      referencedAmounts: [],
      correction: null,
      statedBudget: own.statedBudget,
    })
    invalidations.push({
      trigger: clear ? "USER_CLEARS_CONTEXT" : "EXPLICIT_NEW_TOPIC",
      invalidatedRefs: [...invalidated, ...(context.turns.length > 0 ? ["recentTurns"] : [])],
      retainedRefs: ["hardConstraints", "currentUserTurn", ...(next.activeConstraints.length > 0 ? ["currentConstraints"] : [])],
      reasonCode: clear ? "user_cleared_context" : "explicit_topic_switch",
    })
    return { context: next, invalidations }
  }

  // An explicit correction contradicts the earlier inference; Phase 1 already replaced the inferred slot/foods.
  if (context.correction) {
    invalidations.push({ trigger: "CONTRADICTION_DETECTED", invalidatedRefs: ["inferredMealSlot", "inferredConstraints", ...(context.statedBudget.invalidatedRemaining !== null ? ["remainingCalories"] : [])], retainedRefs: referentsOf(context), reasonCode: "user_corrected_inference" })
  }

  // 2. TURN-BASED TTL for option referents.
  let next = context
  const optionsTurn = [...context.turns].reverse().find((turn) => turn.role === "coach" && parseOptions(turn.text).length >= 2)
  if (optionsTurn && context.presentedOptions.length > 0) {
    const intervening = context.turns.filter((turn) => turn.role === "user" && turn.turnsAgo < optionsTurn.turnsAgo).length
    // A pick made by THIS message resolves a pending choice (short TTL); an earlier pick is the active referent (longer TTL).
    const pickedNow = parseSelection(message, context.presentedOptions) !== null
    const limit = context.selectedOption && !pickedNow ? REFERENT_TTL.selectedReferentTurns : REFERENT_TTL.pendingChoiceTurns
    if (intervening > limit) {
      next = { ...next, presentedOptions: [], selectedOption: null, referentCandidates: [] }
      invalidations.push({ trigger: "TURN_LIMIT_REACHED", invalidatedRefs: [context.selectedOption ? "selectedOption" : "pendingChoice"], retainedRefs: [], reasonCode: "referent_turn_limit" })
    }
  }

  // 3. SERVER-TIME TTL (secondary). The server stamps follow-up context; a client clock is never consulted.
  if (extras.followUpExpiredByServerTime && (next.presentedOptions.length > 0 || next.selectedOption || next.lastAssistantOffer)) {
    next = { ...next, presentedOptions: [], selectedOption: null, referentCandidates: [], lastAssistantOffer: null, unresolvedQuestion: null }
    invalidations.push({ trigger: "REFERENT_EXPIRED", invalidatedRefs: ["pendingChoice", "selectedOption", "priorOffer"], retainedRefs: [], reasonCode: "server_time_ttl" })
  }

  return { context: next, invalidations }
}
