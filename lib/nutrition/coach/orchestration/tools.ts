import { scalePer100g, type ResolvedFood } from "@/lib/intelligence/food-resolution"

import { resolveFoods } from "../intent"
import { getIngredient } from "../ingredients"
import { totalsFor } from "../macros"
import type { CoachContext } from "../types"

import { calorieAnswer } from "./continuation"
import { stableId } from "./snapshot"
import { REFS, validateToolPlan } from "./toolplan"
import type { MacroResultBinding, OrchestrationPlan, PlanningExtras } from "./types"

/**
 * Deterministic execution of the plan's ToolExecutionPlan. The model never computes a number: remaining
 * macros come from nutrition state (CoachContext.snapshot), food macros from the verified ingredient table x
 * grams, and the "fits?" comparison is plain arithmetic here. Steps run in declared order; a step whose
 * dependency produced nothing is blocked, never guessed. Knowledge retrieval is declared in the plan but run by
 * the chat handler (it owns the retrieval gate); it is skipped here.
 */

export type MacroTotals = { calories: number; protein: number; carbs: number; fat: number }

export type ToolResults = {
  athleteState?: {
    /** Present only when goal/training context was planned as materially useful. */
    goal: string | null
    remaining: { calories: number; protein: number }
    targets: { calories: number; protein: number }
  }
  foods?: Array<{
    asked: string
    /** Verified ingredient name, or null when there is no verified data (the reply must say so, not guess). */
    matched: string | null
    grams: number | null
    macros: MacroTotals | null
    /** Raw/cooked basis of `macros` (the scaled result), so a follow-up never silently swaps it. */
    basis?: string
    /** No quantity given: the verified per-100 g values (with the table's cooked/raw basis). Never a guessed serving. */
    per100g?: MacroTotals & { basis: string; status: "VERIFIED" | "ESTIMATED" | "UNKNOWN" }
    /** Where the numbers came from (shared food resolver provenance). Absent for the legacy local-table path. */
    source?: "LOCAL_CANONICAL" | "USDA_FDC"
    /** The user did not say raw or cooked and the choice moves the answer materially: ask this ONE question instead of stating numbers. */
    clarification?: { field: "preparation"; options: string[] }
  }>
  fit?: { afterCalories: number; afterProtein: number; withinCalories: boolean; withinProtein: boolean }
  /** Exact macros of THE active entity (its own server-held items, recomputed here). entityRef is checked against plan.activeEntity before any number is stated. */
  entity?: { entityRef: string; label: string; macros: MacroTotals }
  /** A pending "what is your daily target?" answered: remaining = target - consumed, plain arithmetic done here, never by the model. */
  budgetResume?: { target: number; consumed: number; remaining: number; consumedSource: "user_stated" | "food_log" }
  /** Present whenever exact numbers were produced: the response may format/round them, never recompute or contradict them. */
  binding?: MacroResultBinding
  /** An exact calculation was required but could not be produced; the reply must say so and invent nothing. */
  exactUnavailable?: boolean
  /** Step ids in the order they actually ran / were blocked (evidence for dependency order). */
  executed: string[]
  blocked: string[]
  /** Every exact number the response may state. Used for the grounding check. */
  numbers: number[]
}

const round = (value: number) => Math.round(value)
/** Grams of protein/carbs/fat keep one decimal: 22.8 g per 100 g must read 34.2 g at 150 g, not "23" then "34". Calories stay whole. */
const gram = (value: number) => Math.round(value * 10) / 10

/** Same inputs => same id (see stableId): a repeated exact question about an unchanged entity states the same numbers. */
const calculationId = (parts: unknown): string => stableId("calc", parts)

/** One verified food, from the shared resolver (local canonical or USDA), scaled deterministically. Never throws. */
function foodFromResolver(asked: string, grams: number | null, resolved: ResolvedFood, numbers: number[]): NonNullable<ToolResults["foods"]>[number] {
  if (resolved.status === "AMBIGUOUS" && resolved.clarification) return { asked, matched: null, grams, macros: null, clarification: resolved.clarification }
  const p = resolved.per100g
  if (resolved.status === "UNRESOLVED" || resolved.source === "NONE" || !p || p.calories === null || p.protein === null || p.carbs === null || p.fat === null) return { asked, matched: null, grams, macros: null }
  const source = resolved.source
  if (grams === null) {
    const per100g = { calories: round(p.calories), protein: gram(p.protein), carbs: gram(p.carbs), fat: gram(p.fat), basis: resolved.basis.toUpperCase(), status: resolved.status === "VERIFIED" ? ("VERIFIED" as const) : ("ESTIMATED" as const) }
    numbers.push(100, per100g.calories, per100g.protein, per100g.carbs, per100g.fat)
    return { asked, matched: resolved.name, grams: null, macros: null, per100g, source }
  }
  // The ONE scaling step: the shared resolver's own arithmetic, from the unrounded source profile (never from a displayed figure).
  const s = scalePer100g(p, grams)
  const macros = { calories: round(s.calories!), protein: s.protein!, carbs: s.carbs!, fat: s.fat! }
  numbers.push(grams, macros.calories, macros.protein, macros.carbs, macros.fat)
  return { asked, matched: resolved.name, grams, macros, basis: resolved.basis.toUpperCase(), source }
}

export function runDeterministicTools(plan: OrchestrationPlan, ctx: CoachContext, extras: Pick<PlanningExtras, "activeDraftItems" | "resolvedFoods"> = {}): ToolResults {
  const results: ToolResults = { numbers: [], executed: [], blocked: [] }
  const { snapshot } = ctx
  const stateKnown = Number.isFinite(snapshot.caloriesRemaining) && Number.isFinite(snapshot.proteinRemaining)

  // RESUME: the user answered "what is your calorie target?". Bind it and finish the interrupted remaining-calories task.
  if (plan.resume?.field === "calorieTarget") {
    const target = calorieAnswer(plan.resume.answer)
    const consumed = plan.resume.statedConsumed ?? (Number.isFinite(snapshot.caloriesConsumed) ? round(snapshot.caloriesConsumed) : null)
    if (target !== null && consumed !== null) {
      results.budgetResume = { target, consumed, remaining: target - consumed, consumedSource: plan.resume.statedConsumed !== null ? "user_stated" : "food_log" }
      results.numbers.push(target, consumed, target - consumed, Math.abs(target - consumed))
      results.binding = { calculationId: calculationId({ target, consumed }), source: "DETERMINISTIC_SERVICE", allowedInResponse: true, mayRound: true, mayRecalculate: false, mayInvent: false }
    }
  }
  if (validateToolPlan(plan.toolPlan).length > 0) {
    results.blocked = plan.toolPlan.steps.map((step) => step.stepId)
    results.exactUnavailable = plan.toolNeed.needMacroCalculation
    return results
  }

  const produced = new Set<string>()
  for (const step of plan.toolPlan.steps) {
    if (step.dependsOnStepIds.some((dep) => !results.executed.includes(dep))) {
      results.blocked.push(step.stepId)
      continue
    }

    if (step.tool === "athlete_state_read") {
      if (!stateKnown) {
        results.blocked.push(step.stepId)
        continue
      }
      results.athleteState = {
        goal: plan.toolNeed.needGoalContext ? snapshot.goal : null,
        remaining: { calories: round(snapshot.caloriesRemaining), protein: round(snapshot.proteinRemaining) },
        targets: { calories: round(snapshot.caloriesTarget), protein: round(snapshot.proteinTarget) },
      }
      results.numbers.push(round(snapshot.caloriesRemaining), round(snapshot.proteinRemaining), round(snapshot.caloriesTarget), round(snapshot.proteinTarget))
    }

    if (step.tool === "food_lookup") {
      results.foods = plan.foods.map((food) => {
        const shared = extras.resolvedFoods?.[food.text]
        if (shared) return foodFromResolver(food.text, food.grams, shared, results.numbers)
        const id = resolveFoods([food.text]).ids[0]
        const ingredient = id ? getIngredient(id) : undefined
        if (!ingredient) return { asked: food.text, matched: null, grams: food.grams, macros: null }
        if (food.grams === null) {
          const base = totalsFor([{ ingredientId: ingredient.id, grams: 100 }])
          const per100g = { calories: round(base.calories), protein: gram(base.protein), carbs: gram(base.carbs), fat: gram(base.fat), basis: ingredient.measurementBasis, status: ingredient.source }
          results.numbers.push(100, per100g.calories, per100g.protein, per100g.carbs, per100g.fat)
          return { asked: food.text, matched: ingredient.name, grams: null, macros: null, per100g }
        }
        const totals = totalsFor([{ ingredientId: ingredient.id, grams: food.grams }])
        const macros = { calories: round(totals.calories), protein: gram(totals.protein), carbs: gram(totals.carbs), fat: gram(totals.fat) }
        results.numbers.push(food.grams, macros.calories, macros.protein, macros.carbs, macros.fat)
        return { asked: food.text, matched: ingredient.name, grams: food.grams, macros, basis: ingredient.measurementBasis }
      })
    }

    if (step.tool === "macro_calculation") {
      const computed = (results.foods ?? []).filter((food) => food.macros)
      const foodsResolved = (results.foods?.length ?? 0) > 0 && computed.length === results.foods!.length
      // A plain "macros for X" lookup: every food matched, so its (per-100 g or scaled) values are the exact answer.
      const lookupAnswered = (results.foods?.length ?? 0) > 0 && results.foods!.every((food) => food.macros || food.per100g)
      // Raw vs cooked changes the answer: the coach asks ONE question; that is not an "exact calculation unavailable" failure.
      const askingPreparation = (results.foods ?? []).some((food) => food.clarification)
      if (results.athleteState && foodsResolved) {
        const calories = computed.reduce((sum, food) => sum + food.macros!.calories, 0)
        const protein = computed.reduce((sum, food) => sum + food.macros!.protein, 0)
        results.fit = {
          afterCalories: round(snapshot.caloriesRemaining) - calories,
          afterProtein: round(snapshot.proteinRemaining) - protein,
          withinCalories: round(snapshot.caloriesRemaining) - calories >= 0,
          withinProtein: round(snapshot.proteinRemaining) - protein >= 0,
        }
        results.numbers.push(calories, protein, results.fit.afterCalories, results.fit.afterProtein, Math.abs(results.fit.afterCalories), Math.abs(results.fit.afterProtein))
      }
      // "How many calories is that?" about the active draft: the numbers are that draft's own items, bound to its entity id.
      const entity = plan.activeEntity
      if (entity?.sourceType === "ACTIVE_DRAFT" && extras.activeDraftItems?.length) {
        const totals = totalsFor(extras.activeDraftItems)
        results.entity = { entityRef: entity.entityId, label: entity.label, macros: { calories: round(totals.calories), protein: round(totals.protein), carbs: round(totals.carbs), fat: round(totals.fat) } }
        results.numbers.push(results.entity.macros.calories, results.entity.macros.protein, results.entity.macros.carbs, results.entity.macros.fat)
      }
      // A pure state question ("how much protein do I have left?") is answered by the state numbers themselves.
      const answered = Boolean(results.fit) || Boolean(results.entity) || lookupAnswered || (results.athleteState !== undefined && !plan.toolNeed.needFoodLookup)
      if (answered) {
        results.binding = {
          calculationId: calculationId({ remaining: results.athleteState?.remaining, foods: results.foods?.map((food) => [food.matched, food.grams]), fit: results.fit, entity: results.entity && [results.entity.entityRef, extras.activeDraftItems?.map((item) => [item.ingredientId, Math.round(item.grams)])] }),
          ...(results.entity ? { entityRef: results.entity.entityRef } : {}),
          source: "DETERMINISTIC_SERVICE",
          allowedInResponse: true,
          mayRound: true,
          mayRecalculate: false,
          mayInvent: false,
        }
      } else if (!askingPreparation) {
        results.exactUnavailable = true
      }
      produced.add(REFS.macroResult)
    }

    if (step.tool !== "knowledge_retrieval") results.executed.push(step.stepId)
    produced.add(step.outputRef)
  }

  // A required calculation whose step never ran (dependency missing) is unavailable, not approximate.
  if (plan.toolNeed.needMacroCalculation && !produced.has(REFS.macroResult)) results.exactUnavailable = true
  return results
}
