import { parseSelection } from "./context"
import { optionHead } from "./provenance"
import type { Clarification, ConversationContext, ContinuationTarget, NeedConfidence, PendingClarification, PlanningExtras, ResponseDepth, ResponseMode } from "./types"

/**
 * Continuation, clarification-kind and response-depth policy (pure, deterministic).
 *
 * The planner model describes the turn (it may say "this continues the last turn"); this file decides whether
 * a continuation is REAL by requiring a resolvable target in validated context. The model never supplies the
 * target. CONTINUE without a resolvable target never survives: it becomes CLARIFY (context-leaning message) or
 * ANSWER (a standalone message the model mislabelled).
 */

export type ContinuationResolution = { target: ContinuationTarget; evidence: "hard" | "soft" } | null

const L = "(?<![\\p{L}\\p{N}])"
const R = "(?![\\p{L}\\p{N}])"
const word = (alternatives: string) => new RegExp(`${L}(?:${alternatives})${R}`, "iu")

const DETAIL = word("in detail|detailed|explain|step[- ]by[- ]step|break (?:it )?down|elaborate|why (?:does|do|is|are)|how (?:does|do)|chi tiết|giải thích|tại sao|vì sao")
const QUICK = word("quick|just give me|any idea|whatever|surprise me|something easy|đại đi|gì cũng được|nhanh thôi|bất kỳ")

const SELECTION_PROBE = [1, 2, 3].map((index) => ({ index, label: String.fromCharCode(64 + index), text: "" }))

const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim()

/** Is there something concrete "it" can point at, other than the message's own words? */
const hasActiveReferent = (context: ConversationContext, extras: PlanningExtras) =>
  Boolean(context.selectedOption) || context.referencedFoods.length > 0 || Boolean(extras.hasActiveDraft) || Boolean(extras.currentTopicFood) || Boolean(extras.priorActiveItem)

/** A plausible daily calorie figure in a short reply ("2200", "2,200 kcal", "my target is 2200"); null when there is none or it is ambiguous. */
export function calorieAnswer(message: string): number | null {
  const text = message.replace(/(\d),(\d{3})(?!\d)/g, "$1$2")
  if (text.trim().split(/\s+/).length > 8) return null
  const figures = [...text.matchAll(/(?<![\d.])\d{3,5}(?![\d])/g)].map((match) => Number(match[0])).filter((value) => value >= 800 && value <= 8000)
  return figures.length === 1 ? figures[0] : null
}

/** Does THIS message answer the blocking question the previous turn asked? Field-specific; a question or a long message never does. */
export function answersPending(message: string, pending: PendingClarification, context: ConversationContext): boolean {
  const text = message.trim()
  if (text.split(/\s+/).length > 10 || text.endsWith("?")) return false
  switch (pending.requestedField) {
    case "calorieTarget":
      return calorieAnswer(text) !== null
    case "quantity":
      return /\d/.test(text)
    case "referent":
      return context.selectedOption !== null
    case "slot":
      return context.mealSlot !== null
    default:
      return true
  }
}

const FIELD_PATTERNS: Array<[PendingClarification["requestedField"], RegExp]> = [
  ["calorieTarget", /(?:calor\w*|kcal|calo)\s+(?:target|goal|intake|budget|allowance)|(?:target|goal|daily|total)\s+(?:calor\w*|kcal|calo)|mục tiêu calo/i],
  ["slot", /which meal\b|breakfast, lunch|bữa nào/i],
  ["referent", /which (?:one|option|meal)\b|do you mean|bạn muốn nói đến/i],
  ["quantity", /how (?:many|much)|\bgrams?\b|quantity|portion size|\bamount\b|bao nhiêu/i],
]

/** What the question is asking FOR, from its shape (an option clarification is always a referent question). */
export function fieldOfQuestion(clarification: Clarification): PendingClarification["requestedField"] {
  if (clarification.affects === "option") return "referent"
  return FIELD_PATTERNS.find(([, pattern]) => pattern.test(clarification.question))?.[0] ?? "other"
}

/** The record kept for exactly one answer: WHY the question was asked and what to resume once it is answered. */
export function pendingFromPlan(clarification: Clarification, message: string, context: ConversationContext, now: Date): PendingClarification {
  return {
    questionType: clarification.affects,
    requestedField: fieldOfQuestion(clarification),
    question: clarification.question.slice(0, 300),
    resumeIntent: message.trim().slice(0, 200),
    resumeTaskRef: context.correction && context.statedBudget.invalidatedRemaining !== null ? "remaining_calories" : "request",
    createdAtServer: now.toISOString(),
    expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString(),
  }
}

/**
 * Resolves what a continuing turn continues. Order is by strength of evidence:
 *   PRIOR_OFFER (yes/no to a live offer) > PENDING_CHOICE (the message picks an option) > ACTIVE_MODIFICATION
 *   (modifies a chosen option / food in play) > ACTIVE_DRAFT > LAST_ASSISTANT_REFERENT.
 */
export function resolveContinuation(message: string, context: ConversationContext, extras: PlanningExtras, modelSaysContinuation: boolean): ContinuationResolution {
  // The answer to a blocking question resumes the task that question interrupted: it is never a new, isolated fact.
  if (extras.pendingClarification && answersPending(message, extras.pendingClarification, context)) return { target: "PENDING_CLARIFICATION", evidence: "hard" }
  if ((context.isAffirmation || context.isNegation) && context.lastAssistantOffer) return { target: "PRIOR_OFFER", evidence: "hard" }
  const picksNow = context.turns.length > 0 && parseSelection(message, context.presentedOptions)
  if (picksNow && !context.correction) {
    // "the second one" picks; "the second one but more protein" picks AND modifies — the pick is the resolved target.
    return { target: "PENDING_CHOICE", evidence: "hard" }
  }
  // A pick ("the second one") with no live options is an expired/absent choice: never resolve it to something else.
  if (context.presentedOptions.length === 0 && parseSelection(message, SELECTION_PROBE) !== null) return null
  if (!modelSaysContinuation && !context.pronounEdit) return null
  if (context.turns.length === 0 && !extras.hasActiveDraft) return null
  // "the other one" among several options is genuinely ambiguous: the current pick cannot answer it, and neither can recency.
  if (context.otherReference && context.referentCandidates.length >= 2) return null
  if (context.selectedOption) return { target: "ACTIVE_MODIFICATION", evidence: context.pronounEdit || context.otherReference ? "hard" : "soft" }
  if (context.referentCandidates.length >= 2 && context.pronounEdit) return null // genuinely ambiguous: never guess
  if (hasActiveReferent(context, extras) && !extras.hasActiveDraft) return { target: "ACTIVE_MODIFICATION", evidence: context.pronounEdit ? "hard" : "soft" }
  if (extras.hasActiveDraft) return { target: "ACTIVE_DRAFT", evidence: "soft" }
  const priorCoach = context.turns.find((turn) => turn.role === "coach" && turn.turnsAgo <= 2)
  if (priorCoach && modelSaysContinuation) return { target: "LAST_ASSISTANT_REFERENT", evidence: "soft" }
  return null
}

const genericQuestion = (context: ConversationContext): string =>
  context.language === "en" ? "Just to be sure — which meal or option do you mean?" : "Cho mình hỏi lại cho chắc — bạn đang nói đến món hay lựa chọn nào?"

export function referentQuestion(context: ConversationContext): string {
  const names = context.referentCandidates.slice(0, 3)
  const isOptions = context.presentedOptions.length >= 2 && !context.selectedOption
  if (names.length < 2) return genericQuestion(context)
  if (context.otherReference) {
    // "the other one": name the remaining options by what the user was shown, not by an index.
    const shown = names.map((label) => context.presentedOptions.find((option) => option.label === label)).map((option, i) => (option ? optionHead(option.text) : "") || `Option ${names[i]}`)
    return context.language === "en" ? `Which one do you mean: ${shown.join(" or ")}?` : `Bạn muốn nói đến món nào: ${shown.join(" hay ")}?`
  }
  if (context.language === "en") return isOptions ? `Which one do you want me to change: ${names.map((n) => `Option ${n}`).join(" or ")}?` : `Which one do you mean: ${names.join(" or ")}?`
  return isOptions ? `Bạn muốn chỉnh lựa chọn nào: ${names.map((n) => `Option ${n}`).join(" hay ")}?` : `Bạn muốn chỉnh món nào: ${names.join(" hay ")}?`
}

/**
 * Material question contract: ask only when the missing answer changes safety, a calculation, which option/referent
 * is meant, or a requested action — and the answer is not already known or defaultable. Never to nudge confidence.
 */
export function isMaterial(clarification: Clarification, message: string, context: ConversationContext): boolean {
  if (clarification.affects === "none") return false
  if (QUICK.test(message) && clarification.affects !== "safety" && clarification.affects !== "action") return false
  const asked = normalize(clarification.question)
  // Don't repeat a question the coach already asked in the last two turns.
  if (context.turns.some((turn) => turn.role === "coach" && turn.turnsAgo <= 2 && asked.length > 8 && normalize(turn.text).includes(asked))) return false
  return true
}

/** CLARIFY = the referent/intent is ambiguous; ASK_ONE_QUESTION = one factual input is missing. Distinct by construction. */
export const clarificationMode = (clarification: Clarification): Extract<ResponseMode, "CLARIFY" | "ASK_ONE_QUESTION"> => (clarification.affects === "option" ? "CLARIFY" : "ASK_ONE_QUESTION")

export function chooseDepth(params: { mode: ResponseMode; message: string; context: ConversationContext; proposed?: ResponseDepth }): ResponseDepth {
  const { mode, message, context, proposed } = params
  if (DETAIL.test(message) && mode !== "CONTINUE") return "DETAILED"
  if (mode === "ASK_ONE_QUESTION" || mode === "CLARIFY" || mode === "SAFE_REDIRECT" || mode === "ESCALATE" || mode === "REFUSE_POLICY") return "SHORT"
  if (mode === "CONTINUE" && (context.isShortFollowUp || context.isAffirmation || context.isNegation)) return "SHORT"
  if (DETAIL.test(message)) return "DETAILED"
  // A model may ask for a shorter answer, but it cannot inflate a proposal past NORMAL on its own.
  return proposed === "SHORT" ? "SHORT" : "NORMAL"
}

/** Planner confidence is the model's claim, lowered (never raised) by deterministic evidence. */
export function effectiveConfidence(stated: NeedConfidence, signals: { ambiguousReferent: boolean; unresolvedContinuation: boolean }): NeedConfidence {
  return signals.ambiguousReferent || signals.unresolvedContinuation ? "LOW" : stated
}

export const wantsDetail = (message: string) => DETAIL.test(message)
