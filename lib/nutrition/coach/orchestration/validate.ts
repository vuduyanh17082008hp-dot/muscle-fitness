import { z } from "zod"

import { CLARIFICATION_AFFECTS, RESPONSE_DEPTHS, RESPONSE_MODES, type ConversationContext, type PlannerOutput } from "./types"

/**
 * Structured-output validation for the planner call.
 *
 * Rejects (=> safe fallback to the existing Nutrition Coach path): malformed JSON, missing required
 * fields, unknown response modes. Normalizes (=> still usable): unsupported references, an offer
 * "accepted" when none was made, an action without confirmation, impossible tool combinations,
 * multi-question clarifications.
 */

const short = (max: number) => z.string().trim().max(max)
const list = (max: number, itemMax = 80) => z.array(short(itemMax)).max(max).default([])
const confidence = z.enum(["LOW", "MEDIUM", "HIGH"])

export const plannerSchema = z.object({
  understanding: z.object({
    userGoal: short(160).nullable().default(null),
    explicitRequests: list(6, 120),
    implicitNeeds: list(6, 120),
    referencedEntities: list(8, 60),
    constraints: list(8, 80),
    uncertainties: list(6, 120),
    continuationOfPreviousTurn: z.boolean(),
    referencedPriorOffer: z.boolean(),
    referencedOption: z.number().int().min(1).max(5).nullable().default(null),
    proposedResponseStrategy: short(160).nullable().default(null),
  }),
  need: z.object({
    primaryNeed: short(80).min(1),
    secondaryNeeds: list(6, 80),
    needExactCalculation: z.boolean(),
    needFoodLookup: z.boolean(),
    needKnowledgeRetrieval: z.boolean(),
    needAthleteState: z.boolean(),
    needClarification: z.boolean(),
    needActionConfirmation: z.boolean(),
    confidence,
  }),
  strategy: z.object({
    mode: z.string().trim().toUpperCase(),
    primaryObjective: short(160).min(1),
    supportingObjectives: list(5, 120),
    requiresConfirmation: z.boolean().default(false),
    responseDepth: z.string().trim().toUpperCase().optional(),
  }),
  clarification: z.object({ question: short(240).min(1), affects: z.string().trim().toLowerCase() }).nullable().default(null),
  foods: z.array(z.object({ text: short(40).min(1), grams: z.number().positive().max(2000).nullable().default(null) })).max(6).default([]),
})

/** Pulls the first JSON object out of a model reply (tolerates ```json fences and prose around it). */
export function extractJson(text: string): unknown | null {
  const unfenced = text.replace(/```(?:json)?/gi, "")
  const object = unfenced.match(/\{[\s\S]*\}/)?.[0]
  if (!object) return null
  try {
    return JSON.parse(object)
  } catch {
    return null
  }
}

export type ValidationResult = { ok: true; value: PlannerOutput } | { ok: false; reason: "malformed" | "invalid_plan" }

/** Keep only the first question sentence: ONE focused question, never an interview. */
function singleQuestion(question: string): string {
  const firstMark = question.indexOf("?")
  return firstMark === -1 ? question : question.slice(0, firstMark + 1).trim()
}

export function validatePlannerOutput(raw: unknown, context: ConversationContext): ValidationResult {
  if (raw === null || typeof raw !== "object") return { ok: false, reason: "malformed" }
  const parsed = plannerSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, reason: "malformed" }
  const data = parsed.data

  const mode = RESPONSE_MODES.find((candidate) => candidate === data.strategy.mode)
  if (!mode) return { ok: false, reason: "invalid_plan" }

  const depth = RESPONSE_DEPTHS.find((candidate) => candidate === data.strategy.responseDepth)
  const understanding = { ...data.understanding }
  // Unsupported references: an option that was never presented, or an offer nobody made.
  if (understanding.referencedOption !== null && understanding.referencedOption > context.presentedOptions.length) understanding.referencedOption = null
  if (understanding.referencedPriorOffer && !context.lastAssistantOffer) understanding.referencedPriorOffer = false

  let clarification =
    data.clarification && (CLARIFICATION_AFFECTS as readonly string[]).includes(data.clarification.affects)
      ? { question: singleQuestion(data.clarification.question), affects: data.clarification.affects as (typeof CLARIFICATION_AFFECTS)[number] }
      : null

  const need = { ...data.need }
  const strategy = { mode, primaryObjective: data.strategy.primaryObjective, supportingObjectives: data.strategy.supportingObjectives, requiresConfirmation: data.strategy.requiresConfirmation, ...(depth ? { responseDepth: depth } : {}) }

  // An action request is never authorized by understanding: it must carry confirmation.
  if (need.needActionConfirmation) strategy.requiresConfirmation = true

  // Asking needs a question; a question needs to be asked.
  if ((mode === "ASK_ONE_QUESTION" || mode === "CLARIFY") && !clarification) strategy.mode = "ANSWER"
  if (clarification) need.needClarification = true
  if (!clarification) need.needClarification = false

  // Impossible combinations: refusing, redirecting or escalating computes and looks up nothing.
  if (strategy.mode === "REFUSE_POLICY" || strategy.mode === "SAFE_REDIRECT" || strategy.mode === "ESCALATE") {
    need.needExactCalculation = false
    need.needFoodLookup = false
    need.needKnowledgeRetrieval = false
    need.needAthleteState = false
    clarification = null
    need.needClarification = false
  }

  return { ok: true, value: { understanding, need, strategy, clarification, foods: data.foods } }
}
