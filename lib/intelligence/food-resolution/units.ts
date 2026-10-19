import type { FoodNutrients } from "./types";

/** Only deterministic mass conversions. Count/volume units need a verified serving mapping — never invented. */
const GRAMS_PER_UNIT: Record<string, number> = { g: 1, gram: 1, grams: 1, gr: 1, gam: 1, kg: 1000, oz: 28.3495, ounce: 28.3495, ounces: 28.3495, lb: 453.592, lbs: 453.592 };

export type GramsResult = { grams: number } | { grams: null; reason: "needs_serving_weight" | "unsupported_unit" };

export function toGrams(amount: number, unit: string, servingGrams?: number | null): GramsResult {
  const per = GRAMS_PER_UNIT[unit.toLowerCase()];
  if (per !== undefined) return { grams: round(amount * per, 1) };
  if (["serving", "servings", "piece", "pieces", "slice", "slices", "fillet", "fillets", "cup", "cups"].includes(unit.toLowerCase())) {
    return servingGrams && servingGrams > 0 ? { grams: round(amount * servingGrams, 1) } : { grams: null, reason: "needs_serving_weight" };
  }
  return { grams: null, reason: "unsupported_unit" };
}

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

/** per-100 g → absolute amounts for `grams`. Null stays null (missing is not zero). */
export function scalePer100g(per100g: FoodNutrients, grams: number): FoodNutrients {
  const f = grams / 100;
  const s = (v: number | null | undefined) => (v === null || v === undefined ? null : round(v * f, 1));
  return { calories: s(per100g.calories), protein: s(per100g.protein), carbs: s(per100g.carbs), fat: s(per100g.fat), fiber: s(per100g.fiber), sugar: s(per100g.sugar), sodiumMg: s(per100g.sodiumMg) };
}
