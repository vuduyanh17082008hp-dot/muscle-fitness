import { z } from "zod"

import { CRAVING_RECIPES } from "./craving"
import { COACH_INGREDIENT_IDS } from "./ingredients"
import { assembleDraft } from "./draft"
import { buildCravingInfo } from "./craving"
import type { ActiveMealDraft, CoachContext, CravingKey } from "./types"

const ingredientId = z.enum(COACH_INGREDIENT_IDS as [string, ...string[]])
/** Not strict on purpose: a draft round-trips with display fields (e.g. `name`) that are stripped here and recomputed server-side. */
const item = z.object({ ingredientId, grams: z.number().positive().max(2000) })
const scalingMode = z.enum(["AUTO", "PROPORTIONAL", "CARB_ADJUST", "PROTEIN_ADJUST"])
const optimizerMode = z.enum(["BALANCED", "LEANEST", "BUDGET"])
const cravingKey = z.enum(Object.keys(CRAVING_RECIPES) as [CravingKey, ...CravingKey[]])
const nullableNum = z.number().finite().nullable()

export const snapshotSchema = z.object({
  capturedAt: z.string().max(40),
  timezone: z.string().max(64),
  localDate: z.string().max(10),
  goal: z.string().max(40).nullable(),
  caloriesTarget: z.number().finite(),
  caloriesConsumed: z.number().finite(),
  caloriesRemaining: z.number().finite(),
  proteinTarget: z.number().finite(),
  proteinConsumed: z.number().finite(),
  proteinRemaining: z.number().finite(),
  contextVersion: z.string().max(120),
})

const constraintsSchema = z.object({
  calorieCeiling: nullableNum,
  calorieCeilingStrict: z.boolean(),
  calorieCeilingSource: z.enum(["context", "user"]),
  proteinTarget: nullableNum,
  proteinTargetSource: z.enum(["context", "user"]),
  maxPriceSgd: nullableNum,
  maxCookMinutes: nullableNum,
  availableIds: z.array(ingredientId).max(40).nullable(),
})

/**
 * What the client may send back for an existing draft. Totals, price,
 * confidence, suggestions, violations and craving claims are deliberately
 * NOT accepted — `rehydrateDraft` recomputes all of them from
 * ingredient ids + grams.
 */
export const draftInputSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  family: z.string().max(40),
  source: z.enum(["build_next_meal", "choose_food", "suggested_for_you", "craving_makeover", "conversation"]).optional(),
  mode: optimizerMode,
  sessionContextSnapshot: snapshotSchema,
  ingredients: z.array(item).min(1).max(20),
  constraints: constraintsSchema,
  scalingMode,
  history: z.array(z.object({ version: z.number().int().positive(), label: z.string().max(120), ingredients: z.array(item).min(1).max(20) })).min(1).max(60),
  historyIndex: z.number().int().min(0).max(59),
  status: z.enum(["DRAFT", "STALE_CONTEXT", "READY", "CONFIRMED", "LOGGED"]).optional(),
  acknowledgedContextVersion: z.string().max(120).nullable(),
  craving: z.object({ key: cravingKey }).nullable(),
})

export type DraftInput = z.infer<typeof draftInputSchema>

const overrides = z
  .object({
    calorieCeiling: z.number().positive().max(3000).optional(),
    strict: z.boolean().optional(),
    proteinTarget: z.number().positive().max(250).optional(),
    maxPriceSgd: z.number().positive().max(100).optional(),
    maxCookMinutes: z.number().positive().max(240).optional(),
  })
  .strict()

export type ConstraintOverrides = z.infer<typeof overrides>

export const opSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("swap"), from: ingredientId, to: ingredientId, fit: z.enum(["force", "reduce_portion", "increase_portion", "add_protein", "leaner", "other_swap"]).optional() }),
  z.object({ type: z.literal("add"), ingredientId, grams: z.number().positive().max(2000).optional() }),
  z.object({ type: z.literal("remove"), ingredientId }),
  z.object({ type: z.literal("set_grams"), ingredientId, grams: z.number().positive().max(2000) }),
  z.object({ type: z.literal("scale"), mode: scalingMode, targetCalories: z.number().positive().max(3000).optional(), targetProtein: z.number().positive().max(250).optional(), strict: z.boolean().optional() }),
  z.object({ type: z.literal("more_protein") }),
  z.object({ type: z.literal("more_carbs") }),
  z.object({ type: z.literal("lower_calories") }),
  z.object({ type: z.literal("cheaper") }),
  z.object({ type: z.literal("faster") }),
  z.object({ type: z.literal("more_filling") }),
  z.object({ type: z.literal("tastier") }),
  z.object({ type: z.literal("use_available"), ingredientIds: z.array(ingredientId).min(1).max(10) }),
  z.object({
    type: z.literal("set_constraints"),
    calorieCeiling: nullableNum.optional(),
    strict: z.boolean().optional(),
    proteinTarget: nullableNum.optional(),
    maxPriceSgd: nullableNum.optional(),
    maxCookMinutes: nullableNum.optional(),
  }),
  z.object({ type: z.literal("undo") }),
  z.object({ type: z.literal("redo") }),
  z.object({ type: z.literal("restore"), version: z.number().int().positive() }),
  z.object({ type: z.literal("refresh") }),
  z.object({ type: z.literal("keep") }),
])

export const coachRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("context") }),
  z.object({ action: z.literal("build"), mode: optimizerMode.optional(), overrides: overrides.optional() }),
  z.object({ action: z.literal("suggest") }),
  z.object({ action: z.literal("choose"), ingredientIds: z.array(ingredientId).min(1).max(10), mode: optimizerMode.optional(), overrides: overrides.optional() }),
  z.object({ action: z.literal("craving"), key: cravingKey }),
  z.object({ action: z.literal("edit"), draft: draftInputSchema, op: opSchema }),
])

export type CoachRequest = z.infer<typeof coachRequestSchema>

/** Rebuilds a full, internally-consistent draft from a client's minimal draft. */
export function rehydrateDraft(input: DraftInput, ctx: CoachContext): ActiveMealDraft {
  const index = Math.min(input.historyIndex, input.history.length - 1)
  const locked = input.status === "CONFIRMED" || input.status === "LOGGED" ? input.status : null
  return assembleDraft({
    ctx,
    id: input.id,
    name: input.name,
    family: input.family,
    source: input.source,
    mode: input.mode,
    items: input.ingredients,
    constraints: input.constraints,
    scalingMode: input.scalingMode,
    snapshot: input.sessionContextSnapshot,
    history: input.history,
    historyIndex: index,
    acknowledgedContextVersion: input.acknowledgedContextVersion,
    craving: input.craving ? buildCravingInfo(input.craving.key, input.ingredients) : null,
    lockedStatus: locked,
  })
}
