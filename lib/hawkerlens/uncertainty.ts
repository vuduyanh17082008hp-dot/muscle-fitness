import type {
  ComponentNutrition,
  DishClassification,
  NutrientRange,
} from "@/lib/hawkerlens/types";

/**
 * Uncertainty estimation (spec Part A §8) — mandatory, not optional.
 *
 * Internally distinguishes three different kinds of uncertainty
 * rather than collapsing them into one score too early:
 *   - modelConfidence: how sure the VLM was about WHAT dish this is.
 *   - portionConfidence: how sure the portion estimate is (blended
 *     visual read + typical-serving anchor — see portion.ts).
 *   - nutritionConfidence: how good the per-100g data source is for
 *     each component (curated hawker estimate vs. USDA vs. no match).
 *
 * Only `overallConfidence` combines them, and even then the UI must
 * still show a calorie/macro RANGE, never a bare point estimate (spec:
 * "Avoid: 721.38 kcal. Prefer: 720 kcal, range 660-790").
 */

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function aggregateNutrition(
  components: ComponentNutrition[],
): { calories: NutrientRange; protein: NutrientRange; carbs: NutrientRange; fat: NutrientRange } {
  function sum(key: "calories" | "protein" | "carbs" | "fat"): NutrientRange {
    return {
      estimate: round(components.reduce((s, c) => s + c[key].estimate, 0), 0),
      lower: round(components.reduce((s, c) => s + c[key].lower, 0), 0),
      upper: round(components.reduce((s, c) => s + c[key].upper, 0), 0),
    };
  }

  return {
    calories: sum("calories"),
    protein: sum("protein"),
    carbs: sum("carbs"),
    fat: sum("fat"),
  };
}

export function computeUncertainty(
  dishClassification: DishClassification,
  components: ComponentNutrition[],
): {
  modelConfidence: number;
  portionConfidence: number;
  nutritionConfidence: number;
  overallConfidence: number;
} {
  const modelConfidence = dishClassification.confidence;
  const portionConfidence = average(components.map((c) => c.portionConfidence));
  const nutritionConfidence = average(components.map((c) => c.nutritionSourceConfidence));

  // Weighted toward model+portion since a wrong dish/portion read
  // invalidates everything downstream regardless of how good the
  // nutrition database match is.
  const overallConfidence = round(
    modelConfidence * 0.4 + portionConfidence * 0.35 + nutritionConfidence * 0.25,
  );

  return {
    modelConfidence: round(modelConfidence),
    portionConfidence: round(portionConfidence),
    nutritionConfidence: round(nutritionConfidence),
    overallConfidence,
  };
}
