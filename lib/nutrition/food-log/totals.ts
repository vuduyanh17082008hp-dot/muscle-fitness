import type { DailyMacroTotals, FoodLogEntry, MealType } from "./types"
import { MEAL_TYPES, emptyTotals } from "./types"

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * Sums today's logged food into one daily totals object. This is the
 * ONE place "consumed" is derived from — never persisted separately,
 * always recomputed from the actual logged rows so add/edit/delete
 * can never drift from the source of truth.
 */
export function computeDailyTotals(entries: FoodLogEntry[]): DailyMacroTotals {
  const totals = entries.reduce<DailyMacroTotals>(
    (acc, entry) => ({
      calories: acc.calories + entry.calories,
      protein: acc.protein + entry.proteinG,
      carbs: acc.carbs + entry.carbsG,
      fat: acc.fat + entry.fatG,
    }),
    emptyTotals(),
  )

  return {
    calories: Math.round(totals.calories),
    protein: round1(totals.protein),
    carbs: round1(totals.carbs),
    fat: round1(totals.fat),
  }
}

export type MacroComparison = {
  consumed: number
  target: number
  remaining: number
}

export type DailyMacroComparison = {
  calories: MacroComparison
  protein: MacroComparison
  carbs: MacroComparison
  fat: MacroComparison
}

/** Never confuse TARGET with CONSUMED — this is the only place they're compared. */
export function compareToTargets(
  consumed: DailyMacroTotals,
  target: DailyMacroTotals,
): DailyMacroComparison {
  const compare = (c: number, t: number): MacroComparison => ({
    consumed: c,
    target: t,
    remaining: round1(t - c),
  })

  return {
    calories: compare(consumed.calories, target.calories),
    protein: compare(consumed.protein, target.protein),
    carbs: compare(consumed.carbs, target.carbs),
    fat: compare(consumed.fat, target.fat),
  }
}

export function groupByMeal(entries: FoodLogEntry[]): Record<MealType, FoodLogEntry[]> {
  const grouped = {} as Record<MealType, FoodLogEntry[]>

  for (const meal of MEAL_TYPES) {
    grouped[meal] = []
  }

  for (const entry of entries) {
    grouped[entry.mealType].push(entry)
  }

  return grouped
}

/** "Whey Protein (1 scoop / 30 g)" — what was logged, with its portion. */
export function describePortion(entry: FoodLogEntry): string {
  return entry.servingName && entry.servingsConsumed
    ? `${entry.foodName} (${entry.servingsConsumed} ${entry.servingName}${entry.servingsConsumed === 1 ? "" : "s"} / ${entry.quantityGrams} g)`
    : `${entry.foodName} (${entry.quantityGrams} g)`
}

/** `rows[i]` is the log row behind `foods[i]`: its id is the entry's identity (a delete + re-add is a new id). */
export type MealSummary = DailyMacroTotals & { meal: MealType; foods: string[]; rows: Array<{ id: string; food: string; calories: number; protein: number }> }

/**
 * Per-meal totals from each row's own meal_type — the meal the user picked when logging it, the same grouping the
 * Nutrition page shows — never inferred from the clock. Only meals that have rows; a meal absent here has nothing logged.
 * Each food carries its own row's calories/protein, so a per-item figure is the row's, never the meal total pinned on
 * one item (live: "White Rice (400 g): 933 calories" was the whole snack).
 */
export function summarizeMeals(entries: FoodLogEntry[]): MealSummary[] {
  const grouped = groupByMeal(entries)
  return MEAL_TYPES.filter((meal) => grouped[meal].length > 0).map((meal) => ({
    meal,
    ...computeDailyTotals(grouped[meal]),
    foods: grouped[meal].map((entry) => `${describePortion(entry)}: ${Math.round(entry.calories)} kcal, ${round1(entry.proteinG)} g protein`),
    rows: grouped[meal].map((entry) => ({ id: entry.id, food: entry.foodName, calories: entry.calories, protein: entry.proteinG })),
  }))
}
