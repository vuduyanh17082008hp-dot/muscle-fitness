import { buildCravingDraft } from "./craving"
import { COACH_INGREDIENTS, isIngredientBlocked } from "./ingredients"
import { applyDraftOp, assembleDraft, contextConstraints, type OpOutcome } from "./draft"
import { buildFromSelection, buildMeal, type BuildResult, type ScoredCandidate } from "./optimizer"
import { rehydrateDraft, type ConstraintOverrides, type CoachRequest } from "./schema"
import type { ActiveMealDraft, CoachContext, MealConstraints, MealDraftSource, OptimizerMode } from "./types"

/**
 * Pure orchestration shared by the HTTP route and the chat handler. Takes a
 * loaded CoachContext (derived from the same Athlete State inputs Dante uses)
 * and returns drafts. No Supabase, no LLM.
 */

export function resolveConstraints(ctx: CoachContext, overrides?: ConstraintOverrides): MealConstraints | null {
  const base = contextConstraints(ctx.snapshot)
  // With an explicit ceiling the user doesn't need remaining calories to exist.
  if (!base && !overrides?.calorieCeiling) return null
  const constraints: MealConstraints = base ?? {
    calorieCeiling: null,
    calorieCeilingStrict: false,
    calorieCeilingSource: "context",
    proteinTarget: Math.round(Math.min(60, Math.max(20, ctx.snapshot.proteinRemaining))),
    proteinTargetSource: "context",
    maxPriceSgd: null,
    maxCookMinutes: null,
    availableIds: null,
  }
  if (!overrides) return constraints
  if (overrides.calorieCeiling !== undefined) {
    constraints.calorieCeiling = overrides.calorieCeiling
    constraints.calorieCeilingSource = "user"
    constraints.calorieCeilingStrict = overrides.strict ?? false
  }
  if (overrides.proteinTarget !== undefined) {
    constraints.proteinTarget = overrides.proteinTarget
    constraints.proteinTargetSource = "user"
  }
  if (overrides.maxPriceSgd !== undefined) constraints.maxPriceSgd = overrides.maxPriceSgd
  if (overrides.maxCookMinutes !== undefined) constraints.maxCookMinutes = overrides.maxCookMinutes
  return constraints
}

export type DraftResponse =
  | { ok: true; draft: ActiveMealDraft; alternatives: ActiveMealDraft[]; message: string; relaxed: string[] }
  | { ok: false; code: "NO_BUDGET" | "NO_CANDIDATE" | "INFEASIBLE"; message: string; closest?: ActiveMealDraft }

function toDraft(ctx: CoachContext, candidate: ScoredCandidate, constraints: MealConstraints, mode: OptimizerMode, source: MealDraftSource): ActiveMealDraft {
  return assembleDraft({ ctx, family: candidate.family, source, items: candidate.items, constraints, mode })
}

function fromBuild(ctx: CoachContext, result: BuildResult, constraints: MealConstraints, mode: OptimizerMode, source: MealDraftSource): DraftResponse {
  if (result.status === "NO_CANDIDATE") return { ok: false, code: "NO_CANDIDATE", message: result.reason }
  if (result.status === "INFEASIBLE_HARD") return { ok: false, code: "INFEASIBLE", message: result.reason, closest: toDraft(ctx, result.closest, constraints, mode, source) }
  const draft = toDraft(ctx, result.best, constraints, mode, source)
  const relaxed = result.relaxed.map((v) => v.message)
  const message =
    relaxed.length > 0
      ? `I couldn't satisfy every constraint simultaneously. ${relaxed.join(" ")}`
      : `${draft.name}: about ${Math.round(draft.nutrition.calories)} kcal and ${Math.round(draft.nutrition.protein)}g protein — built from your remaining ${Math.round(ctx.snapshot.caloriesRemaining)} kcal and ${Math.round(ctx.snapshot.proteinRemaining)}g protein.`
  return { ok: true, draft, alternatives: result.alternatives.map((c) => toDraft(ctx, c, constraints, mode, source)), message, relaxed }
}

const NO_BUDGET: DraftResponse = {
  ok: false,
  code: "NO_BUDGET",
  message: "You have very little calorie budget left today. Tell me a calorie limit to work with, or try a Craving Makeover for a small portion.",
}

export function buildNextMeal(ctx: CoachContext, mode: OptimizerMode = "BALANCED", overrides?: ConstraintOverrides, source: MealDraftSource = "build_next_meal"): DraftResponse {
  const constraints = resolveConstraints(ctx, overrides)
  if (!constraints) return NO_BUDGET
  return fromBuild(ctx, buildMeal(ctx, constraints, mode), constraints, mode, source)
}

export function chooseMyFood(ctx: CoachContext, ingredientIds: string[], mode: OptimizerMode = "BALANCED", overrides?: ConstraintOverrides, source: MealDraftSource = "choose_food"): DraftResponse {
  const constraints = resolveConstraints(ctx, overrides)
  if (!constraints) return NO_BUDGET
  return fromBuild(ctx, buildFromSelection(ctx, constraints, ingredientIds, mode), constraints, mode, source)
}

/** SUGGESTED FOR YOU — up to 3 distinct, fully editable meals. */
export function suggestForYou(ctx: CoachContext): { ok: true; drafts: ActiveMealDraft[] } | { ok: false; message: string } {
  const first = buildNextMeal(ctx, "BALANCED", undefined, "suggested_for_you")
  if (!first.ok) return { ok: false, message: first.message }
  return { ok: true, drafts: [first.draft, ...first.alternatives].slice(0, 3) }
}

export type CoachActionResult =
  | { ok: true; context: CoachContext["snapshot"]; blockedIngredientIds: string[] }
  | (DraftResponse & { kind: "draft" })
  | { ok: true; kind: "suggestions"; drafts: ActiveMealDraft[] }
  | { ok: false; kind: "suggestions"; message: string }
  | { ok: true; kind: "edit"; draft: ActiveMealDraft; outcome: OpOutcome }
  | { ok: true; kind: "craving"; draft: ActiveMealDraft }
  | { ok: false; kind: "craving"; message: string }

export function runCoachAction(ctx: CoachContext, request: CoachRequest): CoachActionResult {
  switch (request.action) {
    case "context":
      // Ingredients the user must not be offered as picks or swaps (stored + chat-disclosed allergies, exclusions).
      return { ok: true, context: ctx.snapshot, blockedIngredientIds: COACH_INGREDIENTS.filter((item) => isIngredientBlocked(item, [...ctx.guards.allergies, ...ctx.guards.excludedFoods])).map((item) => item.id) }
    case "build":
      return { kind: "draft", ...buildNextMeal(ctx, request.mode, request.overrides) }
    case "choose":
      return { kind: "draft", ...chooseMyFood(ctx, request.ingredientIds, request.mode, request.overrides) }
    case "suggest": {
      const result = suggestForYou(ctx)
      return result.ok ? { ok: true, kind: "suggestions", drafts: result.drafts } : { ok: false, kind: "suggestions", message: result.message }
    }
    case "craving": {
      const result = buildCravingDraft(ctx, request.key)
      return result.status === "OK" ? { ok: true, kind: "craving", draft: result.draft } : { ok: false, kind: "craving", message: result.reason }
    }
    case "edit": {
      const draft = rehydrateDraft(request.draft, ctx)
      const { draft: next, ...outcome } = applyDraftOp(ctx, draft, request.op)
      return { ok: true, kind: "edit", draft: next, outcome }
    }
  }
}
