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
