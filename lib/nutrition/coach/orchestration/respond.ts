import { checkOutputIntegrity, integrityCorrectionBrief } from "@/lib/intelligence/performance-core"
import { hasUngroundedMacros } from "../conversation"
import { isUnsafeCoachReply, SAFETY_REPLY } from "../intent"
import type { CoachContext } from "../types"

import type { ContextBudget } from "./budget"
import { isPersonalStateQuestion } from "./needs"
import { driftsFromActiveEntity } from "./provenance"
import { supplementEducationReply } from "./safety"
import type { ModelCall } from "./understand"
import type { ToolResults } from "./tools"
import type { ConversationContext, OrchestrationPlan } from "./types"

/**
 * RESPONSE layer. Layered prompt: SYSTEM (identity, safety, hard boundaries) / CONTEXT (budgeted) /
 * PLAN (compact operational fields only) / RESPONSE. The plan is described to the model but never to the user.
 */

export { buildContextBudget, DEFAULT_CONTEXT_LIMITS, type ContextBudget } from "./budget"

function planView(plan: OrchestrationPlan, context: ConversationContext) {
  return {
    mode: plan.strategy.mode,
    ...(plan.strategy.continuationTarget ? { continuing: plan.strategy.continuationTarget } : {}),
    depth: plan.strategy.responseDepth,
    objective: plan.strategy.primaryObjective,
    alsoCover: plan.strategy.supportingObjectives,
    userGoal: plan.understanding.userGoal,
    isCorrection: Boolean(context.correction),
    foodsInPlay: context.referencedFoods,
    ...(plan.activeEntity && plan.strategy.mode === "CONTINUE" ? { activeItem: plan.activeEntity.label } : {}),
    ...(plan.resume ? { resuming: plan.resume.request } : {}),
    requiresConfirmation: plan.strategy.requiresConfirmation,
  }
}

const MODE_RULES: Record<OrchestrationPlan["strategy"]["mode"], string> = {
  ANSWER: "Answer directly and naturally.",
  CONTINUE: "Continue the task named in PLAN.continuing: the user's agreement, pick or tweak applies to it (see CONTEXT.priorOffer / presentedOptions / chosenOption / activeReferent). Do not restart, re-introduce the topic, or repeat earlier options. A pick or a tweak is a conversation step, not a state change: never ask the user to confirm a choice unless PLAN.requiresConfirmation is true. Apply the user's change to PLAN.activeItem / CONTEXT.activeItem ONLY; never introduce a dish that is not in CONTEXT, RECENT CONVERSATION or the user's message. If CONTEXT.resume is present the user just answered your question: apply that answer and finish the original request (resume.resumeRequest); do not ask again and do not treat the answer as a new topic.",
  PROPOSE: "Offer 2-3 strong options, not more unless the user asks. Propose a concrete option. Make clear nothing is logged or changed until the user confirms it in the Active Meal Draft panel.",
  ASK_ONE_QUESTION: "Ask exactly the one question in PLAN.question and nothing else.",
  CLARIFY: "Briefly restate what you understood, then ask exactly the one question in PLAN.question.",
  ESCALATE: "Say this is outside nutrition coaching and suggest the appropriate professional or resource, kindly and briefly.",
  REFUSE_POLICY: "Decline the specific request briefly and kindly, and say what you can do instead.",
  SAFE_REDIRECT: "Redirect gently to a safe, useful nutrition topic without judging.",
}

const DEPTH_LIMIT = { SHORT: "under 60 words", NORMAL: "under 120 words", DETAILED: "under 220 words" } as const

/** `_knowledgeText` is accepted for compatibility but ignored: only the budgeted knowledge (budget.knowledgeText) may reach the prompt. */
export function buildResponsePrompt(message: string, plan: OrchestrationPlan, context: ConversationContext, budget: ContextBudget, _knowledgeText?: string | null, intelligenceBlock = ""): string {
  const knowledgeText = budget.knowledgeText
  const history = budget.turns
    .map((turn) => `${turn.role === "user" ? "USER" : "COACH"}: ${turn.text}`)
    .join("\n")
  const languageRule = context.language === "en" ? "Reply in English." : context.language === "vi" ? "Reply in Vietnamese." : "Reply in the same mixed Vietnamese/English style the user used."
  const view = { ...planView(plan, context), ...(plan.clarification ? { question: plan.clarification.question } : {}) }
  return `You are the Muscle Fitness Nutrition Coach, a nutrition specialist inside the Nutrition page. Dante is the separate cross-domain assistant.
SYSTEM RULES:
- Nutrition only. For training, workouts, recovery or injury questions, tell the user to ask Dante.
- Use ONLY numbers that appear in CONTEXT. Never calculate, estimate or invent calories, macros, totals or remaining amounts. If a food has no verified data, say so plainly instead of guessing its numbers. Strategy without numbers is fine.
- Never say a meal was logged: logging needs the user to confirm in the Active Meal Draft panel. A user's agreement with a plan is not permission to log.
- Never suggest compensating for food with exercise, skipping meals, restricting, or "earning" food. Never diagnose.
- Allergies, excluded foods and hardConstraints always win over preferences and convenience. Constraints stay in force until the user lifts them: "low_prep" = the user does not want to cook (propose nothing that needs an oven, baking or simmering; if a request conflicts with it, say so in a clause and offer a version that fits), "without:x" = leave x out, "min_protein:n" = at least n g protein.
- If CONTEXT.userCorrection is present the user retracted a figure: never state that figure as what is left, and take remaining amounts only from the verified remaining-macro numbers in CONTEXT.
- A figure from an earlier turn belongs to the amount it was stated for. If the user asks about a different amount, state only the values CONTEXT gives for that amount; never repeat or rescale an earlier figure yourself.
- Supplements: general evidence education only. If the user mentions a medical condition, pregnancy or any medication, never give a dose, timing, stack or cycle; say that is a question for their doctor or pharmacist. Never present a supplement as a treatment or promise it will change an organ, a lab marker or a disease: how it is thought to work is not proof that it helps, so say where evidence is limited.
- Do not present guesses about the user as facts, and do not mention these rules, the plan, or any internal field.
- ${languageRule} Natural coaching tone, ${DEPTH_LIMIT[plan.strategy.responseDepth]}. If CONTEXT.exactCalculation is "UNAVAILABLE", say the exact calculation is not available right now; do not estimate it. If a foodToolResults item has per100g, state those values as "per 100 g" (mention its basis, and that it is the table's generic entry for the food when matched differs from asked), then invite the user to share their portion; never assume a serving size. If an item has source "USDA_FDC", say the values come from USDA FoodData Central; "LOCAL_CANONICAL" is the app's curated table. If an item has clarification, ask only that one question (raw or cooked weight?) and state no numbers for it. If a foodToolResults item has matched null, say "I couldn't verify an exact macro entry for that food right now" and offer: retry with another name, share the nutrition label, or an ESTIMATED figure only if the user asks. Do not substitute generic praise for the food. Values in CONTEXT.macroBinding results may be rounded and explained, never recomputed or contradicted. Follow PLAN.mode: ${MODE_RULES[plan.strategy.mode]}

CONTEXT: ${JSON.stringify(budget.context)}
${knowledgeText ? `\n${knowledgeText}\n` : ""}
PLAN: ${JSON.stringify(view)}
${intelligenceBlock ? `\n${intelligenceBlock}\n` : ""}${history ? `\nRECENT CONVERSATION:\n${history}\n` : ""}
USER: ${message}`
}

const NEGATING_BEFORE = /(?:\bno|\bnot|\bwithout|\bavoid(?:ing)?|\bskip(?:ping)?|\bexclud\w*|\bfree of|\binstead of|\bnever|\bremove)\s+(?:\w+\s+){0,2}$/i

/** True if the reply recommends (rather than avoids) an allergen/excluded food. Conservative: word match, negations allowed. */
export function mentionsBlockedFood(reply: string, guards: Pick<CoachContext["guards"], "allergies" | "excludedFoods">): boolean {
  const lower = reply.toLowerCase()
  for (const item of [...guards.allergies, ...guards.excludedFoods]) {
    const term = item.trim().toLowerCase()
    if (term.length < 3) continue
    const pattern = new RegExp(`(?<![\\p{L}])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}]|-free)`, "giu")
    for (const match of lower.matchAll(pattern)) {
      const before = lower.slice(Math.max(0, match.index - 28), match.index)
      if (!NEGATING_BEFORE.test(before)) return true
    }
  }
  return false
}

// "<n> kcal ... left" / "left ... <n> kcal" (and the protein equivalents): the numbers a reply attaches to remaining amounts.
const LEFT_PATTERNS = [
  /(\d[\d,]*)\s*(?:kcal|calories|cal)\b[^.\n\d]{0,25}?(?:left|remaining|còn)/gi,
  /(?:left|remaining|còn)[^.\n\d]{0,20}(\d[\d,]*)\s*(?:kcal|calories|cal)\b/gi,
  /(\d[\d,]*)\s*g\s*(?:of\s+)?protein\b[^.\n\d]{0,25}?(?:left|remaining|còn)/gi,
  /(?:left|remaining|còn)[^.\n\d]{0,20}(\d[\d,]*)\s*g\s*(?:of\s+)?protein\b/gi,
]

/** True if the reply attaches a number to "left/remaining" that no deterministic result (or the user) supplied. */
export function contradictsBinding(reply: string, results: ToolResults, userNumbers: number[] = [], retractedRemaining: number | null = null): boolean {
  // A figure the user retracted ("I meant 620 is what I've eaten") must not come back as what is left, binding or not.
  if (retractedRemaining !== null) {
    const retracted = Math.round(retractedRemaining)
    const trusted = new Set(results.numbers.map((n) => Math.round(Math.abs(n))))
    if (!trusted.has(retracted) && LEFT_PATTERNS.some((pattern) => [...reply.matchAll(pattern)].some((match) => Math.round(Number(match[1].replace(/,/g, ""))) === retracted))) return true
  }
  if (!results.binding) return false
  const allowed = new Set([...results.numbers, ...userNumbers].map((n) => Math.round(Math.abs(n))))
  return LEFT_PATTERNS.some((pattern) => [...reply.matchAll(pattern)].some((match) => !allowed.has(Math.round(Number(match[1].replace(/,/g, ""))))))
}

const SUPPLEMENT_EDUCATION_ONLY = "Supplement education only: say what it is, how it is thought to work, what it has been studied for and how uncertain the evidence is. Remove every statement that it treats, improves, protects, repairs, supports, detoxes or lowers anything in the body (an organ, a disease, a lab marker), and do not predict a benefit for the user."

const COOKING_STEPS =/(?<![\p{L}\p{N}])(?:bak(?:e|ed|es|ing)|oven|preheat\w*|simmer\w*|saut[eé]\w*|roast\w*|boil\w*)(?![\p{L}\p{N}])/iu
const ACKNOWLEDGES_NO_COOK = /no[- ]cook|without cooking|(?:don'?t|do not) (?:want|have) to cook|skip (?:the )?(?:oven|cooking)|if you (?:do )?want to cook|since you (?:don'?t|do not) want to cook|không cần nấu|không nấu|nếu bạn muốn nấu/iu
const CONFIRM_THE_CHOICE = /(?:confirm|lock in|finali[sz]e)\s+(?:this|that|your|the)\s+(?:choice|selection|pick|option)|(?:choice|selection|pick|option)[^.?!]{0,20}\bconfirm/i

/** Deterministic checks on the model's reply against the plan's contract. Empty = the reply honours it. */
export function replyViolations(reply: string, plan: OrchestrationPlan, context: ConversationContext, message: string, results?: ToolResults): string[] {
  const violations: string[] = []
  const retracted = context.correction ? context.statedBudget.invalidatedRemaining : null
  if (retracted !== null && results && contradictsBinding(reply, { ...results, binding: undefined }, [], retracted)) violations.push(`The user retracted ${retracted} as what is left (it is what they already ate). Do not state it as remaining; use only the verified remaining numbers in CONTEXT.`)
  if (plan.hardConstraints.includes("low_prep") && COOKING_STEPS.test(reply) && !ACKNOWLEDGES_NO_COOK.test(reply)) violations.push("The user said they don't want to cook (low_prep). Offer a no-cook / minimal-prep version, or say plainly that this needs cooking and ask if that is OK.")
  const picking = plan.strategy.mode === "CONTINUE" && (plan.strategy.continuationTarget === "PENDING_CHOICE" || plan.strategy.continuationTarget === "ACTIVE_MODIFICATION")
  if (picking && !plan.strategy.requiresConfirmation && CONFIRM_THE_CHOICE.test(reply)) violations.push("Choosing an option is not a state change. Do not ask the user to confirm the choice; just continue with it.")
  if (picking && driftsFromActiveEntity(reply, plan.activeEntity, context, message)) violations.push(`Stay on the chosen item only (${plan.activeEntity?.label}); do not switch to another option or dish.`)
  return violations
}

// The user named an amount of their own ("150 g", "6 oz"): figures stated for an earlier amount are stale for this one.
const STATES_AMOUNT = /\d\s*(?:g|gr|gam|grams?|kg|oz|ounces?|lbs?)(?![\p{L}\p{N}])/iu

const ASKS_FIT = /(?<![\p{L}\p{N}])(?:fit|fits|fitting|vừa|nhét)(?![\p{L}\p{N}])/iu

export type ComposedReply = { reply: string; source: "model" | "question" | "resume" | "lookup" }

const SOURCE_LABEL = { LOCAL_CANONICAL: { en: "the app's curated table", vi: "bảng dữ liệu của app" }, USDA_FDC: { en: "USDA FoodData Central", vi: "USDA FoodData Central" } } as const

/**
 * Deterministic reply for a plain food-macro lookup, built only from the verified tool results. Used when the composer model
 * is unavailable or its reply is rejected, so "macros for X" never degrades to an ungrounded chat answer. Null unless every
 * food has exact numbers (or the one raw/cooked question).
 */
export function foodLookupReply(results: ToolResults, language: ConversationContext["language"]): string | null {
  const foods = results.foods
  if (!foods?.length) return null
  const vi = language === "vi"
  const lines: string[] = []
  for (const food of foods) {
    if (food.clarification) {
      lines.push(vi ? `Khối lượng ${food.asked} là lúc còn sống hay đã nấu chín? Hai con số này khác nhau đáng kể.` : `Is the weight of the ${food.asked} raw or cooked? The two differ a lot in calories and protein.`)
      continue
    }
    const src = food.source ? SOURCE_LABEL[food.source][vi ? "vi" : "en"] : null
    const from = src ? (vi ? ` (nguồn: ${src})` : ` (source: ${src})`) : ""
    if (food.macros && food.grams !== null) {
      const m = food.macros
      const state = food.basis === "RAW" || food.basis === "COOKED" ? ` (${food.basis.toLowerCase()})` : ""
      lines.push(vi ? `${food.grams} g ${food.matched}${state}: ${m.calories} kcal, ${m.protein} g protein, ${m.carbs} g carb, ${m.fat} g béo${from}.` : `${food.grams} g ${food.matched}${state}: ${m.calories} kcal, ${m.protein} g protein, ${m.carbs} g carbs, ${m.fat} g fat${from}.`)
    } else if (food.per100g) {
      const p = food.per100g
      const basis = p.basis === "UNKNOWN" || p.basis === "AS_SERVED" ? "" : ` (${p.basis.toLowerCase()})`
      const est = p.status === "VERIFIED" ? "" : vi ? " Đây là ước tính." : " This is an estimate."
      lines.push(vi ? `${food.matched}${basis}, mỗi 100 g: ${p.calories} kcal, ${p.protein} g protein, ${p.carbs} g carb, ${p.fat} g béo${from}.${est} Cho mình biết khẩu phần của bạn để mình tính nhé.` : `${food.matched}${basis}, per 100 g: ${p.calories} kcal, ${p.protein} g protein, ${p.carbs} g carbs, ${p.fat} g fat${from}.${est} Tell me your portion and I'll calculate it.`)
    } else return null
  }
  return lines.join("\n")
}

/** Exact numbers bound to an entity are only valid for THAT entity: a binding whose entityRef is not the active entity is rejected. */
export const bindingMatchesEntity = (results: ToolResults, plan: OrchestrationPlan): boolean => !results.binding?.entityRef || results.binding.entityRef === plan.activeEntity?.entityId

/** The finished interrupted task: remaining calories from the user's own target + consumed. Deterministic text, no model. */
function budgetResumeReply(budget: NonNullable<ToolResults["budgetResume"]>, language: ConversationContext["language"]): string {
  const left = budget.remaining
  const source = budget.consumedSource === "food_log" ? " (from your food log)" : ""
  if (language === "vi") {
    return `Với mục tiêu ${budget.target} kcal và ${budget.consumed} kcal đã ăn, ${left >= 0 ? `bạn còn khoảng ${left} kcal cho hôm nay` : `bạn đã vượt khoảng ${-left} kcal hôm nay`}. Mình gợi ý món theo mức này nhé?`
  }
  return `With a ${budget.target} kcal target and ${budget.consumed} kcal already eaten${source}, ${left >= 0 ? `you have about ${left} kcal left today` : `you're about ${-left} kcal over today`}. Want me to build options around that?`
}

/**
 * Produces the final reply, or null when the model fails (caller keeps the existing path).
 * Output validation: unsafe/compensation language -> SAFETY_REPLY; ungrounded numbers or a blocked food -> null.
 */
export async function composeReply(params: {
  message: string
  plan: OrchestrationPlan
  context: ConversationContext
  ctx: CoachContext
  results: ToolResults
  budget: ContextBudget
  knowledgeText: string | null
  call: ModelCall
}): Promise<ComposedReply | null> {
  const { message, plan, ctx, results, budget, knowledgeText, call } = params
  // ICH-1 conversation control: an explicit language request outranks the language the message happens to be written in.
  const brief = ctx.intelligence?.brief ?? null
  const context: ConversationContext = brief && brief.control.responseLanguage !== "MATCH_USER" ? { ...params.context, language: brief.control.responseLanguage === "EN" ? "en" : "vi" } : params.context

  // A bare clarification needs no second model call: the planner already wrote the one question.
  if ((plan.strategy.mode === "ASK_ONE_QUESTION" || plan.strategy.mode === "CLARIFY") && plan.clarification) {
    const question = plan.clarification.question
    return isUnsafeCoachReply(question) ? { reply: SAFETY_REPLY, source: "question" } : { reply: question, source: "question" }
  }

  // The interrupted remaining-calories task, finished from the user's answer by plain arithmetic (see tools.ts).
  if (plan.resume?.field === "calorieTarget" && results.budgetResume) return { reply: budgetResumeReply(results.budgetResume, context.language), source: "resume" }
  if (!bindingMatchesEntity(results, plan)) return null

  const lookup = (): ComposedReply | null => {
    // Only a plain food lookup: a fit/entity/budget answer depends on the user's state, which the template cannot explain.
    if (!plan.toolNeed.needFoodLookup || isPersonalStateQuestion(message) || ASKS_FIT.test(message) || results.entity || results.budgetResume || results.exactUnavailable) return null
    const reply = foodLookupReply(results, context.language)
    return reply ? { reply, source: "lookup" } : null
  }
  const prompt = buildResponsePrompt(message, plan, context, budget, knowledgeText, brief?.promptBlock ?? "")
  let raw = await call(prompt)
  if (!raw) return plan.clarification ? { reply: plan.clarification.question, source: "question" } : lookup()
  if (isUnsafeCoachReply(raw)) return { reply: SAFETY_REPLY, source: "model" }

  // ONE bounded repair when the reply breaks the plan's contract (a dropped constraint, a switched dish, a needless
  // "confirm your choice"). A second failure means the existing path answers instead; nothing is patched in by hand.
  const violations = replyViolations(raw, plan, context, message, results)
  // Supplement education that drifted into a clinical claim gets the same one repair. It never abandons the reply: whatever
  // survives the repair is filtered deterministically where the reply is emitted (chat.ts `respond`).
  const claims = supplementEducationReply(raw, message, context.turns).removed > 0 ? [SUPPLEMENT_EDUCATION_ONLY] : []
  // ICH-1 output integrity (language control, low-value picks, necessity/certainty beyond the evidence, dosing under a no-dosing posture) shares the same one repair.
  const integrity = brief ? checkOutputIntegrity({ reply: raw, brief }) : []
  if (violations.length + claims.length + integrity.length > 0) {
    const revised = await call(`${prompt}\n\nREVISE: your previous reply was rejected. ${[...violations, ...claims].join(" ")}${integrity.length ? `\n${integrityCorrectionBrief(integrity)}` : ""} Rewrite the reply so it follows every rule above.`)
    const accepted = Boolean(revised) && !isUnsafeCoachReply(revised!) && replyViolations(revised!, plan, context, message, results).length === 0
    if (!accepted && violations.length > 0) return lookup()
    if (accepted) raw = revised!
  }

  // An exact calculation was asked for: the only numbers allowed are the deterministic results (and the user's own). Figures from
  // earlier turns may belong to a different (or since-edited) meal, so they cannot pass as the answer.
  // The same holds when the user names a NEW amount and no tool ran for it: an earlier turn's "23 g protein" described a different
  // quantity, so it may not be re-attached to this one (live defect: 100 g = 23 g protein, then "150 g = about 23 g").
  const fromTurns = plan.toolNeed.needMacroCalculation || STATES_AMOUNT.test(message) ? [] : context.turns.flatMap((turn) => (turn.text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number))
  const allowed = [...results.numbers, ...(message.match(/\d+(?:\.\d+)?/g) ?? []).map(Number), ...fromTurns, ...(ctx.intelligence?.numbers ?? [])]
  if (hasUngroundedMacros(raw, allowed)) return lookup()
  if (mentionsBlockedFood(raw, ctx.guards)) return null
  if (contradictsBinding(raw, results, [...(message.match(/\d+(?:\.\d+)?/g) ?? []).map(Number)], context.correction ? context.statedBudget.invalidatedRemaining : null)) return lookup()
  return { reply: raw, source: "model" }
}
