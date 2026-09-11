/**
 * Deterministic quantity scaling for the food-log tracker (spec:
 * "DETERMINISTIC QUANTITY CALCULATION"). This is the ONE place a
 * per-100g macro profile gets scaled to a logged quantity — never
 * sent to an LLM, never recomputed ad-hoc in a component.
 */

import type { NormalizedFoodMacros } from "@/lib/nutrition/food-data/types"

export type ScaledMacros = {
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number | null
}

/** Round to 1 decimal place for storage/display — avoids floating-point noise without losing useful precision. */
function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/**
 * Scales a per-100g macro profile to an arbitrary gram quantity.
 *
 * 100g -> exact per100g values. 200g -> exactly 2x. 50g -> exactly 0.5x.
 */
export function scaleMacrosToGrams(
  per100g: NormalizedFoodMacros,
  grams: number,
): ScaledMacros {
  const safeGrams = Number.isFinite(grams) && grams > 0 ? grams : 0
  const factor = safeGrams / 100

  return {
    calories: round1(per100g.calories * factor),
    protein: round1(per100g.protein * factor),
    carbs: round1(per100g.carbs * factor),
    fat: round1(per100g.fat * factor),
    fiber:
      per100g.fiber === null || per100g.fiber === undefined
        ? null
        : round1(per100g.fiber * factor),
  }
}

/**
 * Scales a per-100g profile to a serving count (e.g. "1.5 servings"
 * of a product with a known serving size in grams).
 */
export function scaleMacrosToServings(
  per100g: NormalizedFoodMacros,
  servingGrams: number,
  servings: number,
): ScaledMacros {
  return scaleMacrosToGrams(per100g, servingGrams * servings)
}
