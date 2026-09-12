import "server-only";

import { searchFood } from "@/lib/nutrition/food-data";
import type { NormalizedFoodMacros } from "@/lib/nutrition/food-data/types";
import { matchComponentTemplate } from "@/lib/hawkerlens/component-matching";
import type { DishTemplate } from "@/lib/hawkerlens/dishes";
import type { ComponentNutrition, ComponentPortion, DetectedComponent } from "@/lib/hawkerlens/types";

/**
 * Nutrition-provider architecture (spec Part A §10).
 *
 * Component-level lookup, in priority order:
 *   1. The dish's own curated component template (dishes.ts) — used
 *      when the detected component clearly matches one of the dish's
 *      known parts (e.g. "chicken" -> "Poached chicken with skin" for
 *      chicken_rice). This is the MOST relevant data for a
 *      hawker-style preparation, which generic databases don't model
 *      (e.g. plain USDA chicken breast is NOT the same food as
 *      hawker poached chicken with skin and oil).
 *   2. The existing generic searchFood() cascade (USDA -> Open Food
 *      Facts -> local fallback, lib/nutrition/food-data/index.ts) —
 *      used when no dish-template match exists (e.g. a garnish the
 *      model named that isn't in the template).
 *
 * Provider selection logic lives HERE, not in any UI component (spec
 * §10's explicit requirement).
 */

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function scaleRange(
  per100g: NormalizedFoodMacros,
  portion: ComponentPortion,
  key: keyof Pick<NormalizedFoodMacros, "calories" | "protein" | "carbs" | "fat">,
) {
  const perGram = per100g[key] / 100;

  return {
    estimate: round(perGram * portion.estimatedGrams),
    lower: round(perGram * portion.gramsLower),
    upper: round(perGram * portion.gramsUpper),
  };
}

export async function lookupComponentNutrition(
  detected: DetectedComponent,
  portion: ComponentPortion,
  dishTemplate: DishTemplate,
): Promise<ComponentNutrition> {
  const templateMatch = matchComponentTemplate(detected.name, dishTemplate.components);

  let per100g: NormalizedFoodMacros;
  let sourceLabel: string;
  let nutritionConfidence: number;

  if (templateMatch) {
    per100g = templateMatch.per100g;
    sourceLabel = `Locally curated — ${dishTemplate.displayName} (Singapore hawker estimate)`;
    nutritionConfidence = 0.6; // see dishes.ts — internally estimated, not lab-verified
  } else {
    const searchResult = await searchFood(detected.name, "any");
    const bestMatch = searchResult.foods[0] ?? null;

    if (bestMatch) {
      per100g = bestMatch.per100g;
      sourceLabel = bestMatch.sourceLabel;
      nutritionConfidence =
        bestMatch.confidence === "high" ? 0.85 : bestMatch.confidence === "medium" ? 0.6 : 0.4;
    } else {
      // Never fabricate a made-up macro profile — an unmatched
      // component with no database hit contributes zero and is
      // flagged so the UI/limitations can say so, rather than
      // silently guessing numbers.
      per100g = { calories: 0, protein: 0, carbs: 0, fat: 0 };
      sourceLabel = "No nutrition match found";
      nutritionConfidence = 0;
    }
  }

  return {
    name: detected.name,
    estimatedGrams: portion.estimatedGrams,
    confidence: round(portion.portionConfidence * nutritionConfidence, 2),
    portionConfidence: portion.portionConfidence,
    nutritionSourceConfidence: nutritionConfidence,
    calories: scaleRange(per100g, portion, "calories"),
    protein: scaleRange(per100g, portion, "protein"),
    carbs: scaleRange(per100g, portion, "carbs"),
    fat: scaleRange(per100g, portion, "fat"),
    sourceLabel,
    isEstimated: true,
  };
}
