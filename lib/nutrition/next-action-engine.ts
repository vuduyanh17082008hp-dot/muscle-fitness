/**
 * Nutrition Next-Action Engine (spec Part "5. NUTRITION NEXT-ACTION
 * ENGINE").
 *
 * Extends the EXISTING nutrition data flow — it does not recompute
 * targets (lib/nutrition/plan.ts), remaining macros
 * (lib/nutrition/food-log/totals.ts::compareToTargets), or invent a
 * second food database. Candidates come from exactly two places the
 * app already has: the user's own real food history
 * (lib/nutrition/food-log/history.ts) and the HawkerLens dish
 * reference data (lib/hawkerlens/dishes.ts). This module only RANKS
 * and (for hawker dishes) lightly ADJUSTS those candidates against
 * today's remaining macros — all pure, deterministic arithmetic.
 * There is no LLM call anywhere in this file: per spec, "Dante only
 * explains/recommends" — this engine supplies the numbers Dante would
 * explain, it is not Dante itself.
 */

import type { DailyMacroTotals } from "@/lib/nutrition/food-log/types";
import type { FoodHistoryItem } from "@/lib/nutrition/food-log/history";
import { DISH_TEMPLATES, type DishComponentTemplate, type DishTemplate } from "@/lib/hawkerlens/dishes";
import type { HawkerDishId } from "@/lib/hawkerlens/types";
import type { NormalizedFoodMacros } from "@/lib/nutrition/food-data/types";
import type { FoodLogSource } from "@/lib/nutrition/food-log/types";

export type NextMealOptionSource = "recent_food" | "hawker_dish";

export type NextMealOption = {
  id: string;
  name: string;
  source: NextMealOptionSource;
  /** Human-readable adjustments already applied, e.g. ["less rice", "extra chicken"]. Empty for an as-logged recent food or a dish's standard portion. */
  adjustments: string[];
  estimatedNutrition: DailyMacroTotals;
  /** Provenance label matching spec Part "8. PROVENANCE"'s own examples. */
  provenance: string;
  /** Enough to build a ConfirmedFood-shaped log entry (components/types.ts) — the caller still asks the user which meal this is. */
  logPayload: {
    foodName: string;
    /** For a recent food, this is the food's ORIGINAL source (usda/open-food-facts/etc.) preserved unchanged — a HawkerLens dish suggestion always uses "local" (reference data, not measured or scanned). */
    source: FoodLogSource;
    sourceId: string | null;
    barcode: string | null;
    per100g: NormalizedFoodMacros;
    quantityGrams: number;
    isEstimated: boolean;
    estimationReason: string | null;
  };
};

export type NextActionResult = {
  hasRemainingBudget: boolean;
  remaining: DailyMacroTotals;
  options: NextMealOption[];
  message: string;
};

export type NextActionInput = {
  remaining: DailyMacroTotals;
  /** Lowercase-insensitive substring exclusion terms — allergies + explicitly excluded foods (spec Part "6. PERSONAL FOOD CONTEXT": "Avoid recommending foods the user explicitly excludes"). */
  excludedTerms: string[];
  recentFoods: FoodHistoryItem[];
  frequentFoods: FoodHistoryItem[];
};

const CALORIE_OVERAGE_TOLERANCE = 1.1; // allow candidates up to 10% over remaining calories
const MAX_OPTIONS = 3;
const COMPONENT_REDUCE_FACTOR = 0.6; // "less X" -> 60% of typical
const COMPONENT_INCREASE_FACTOR = 1.35; // "extra X" -> 135% of typical

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function isExcluded(name: string, excludedTerms: string[]): boolean {
  const normalized = name.toLowerCase();
  return excludedTerms.some((term) => term.trim().length > 0 && normalized.includes(term.trim().toLowerCase()));
}

function macroKeyDominant(component: DishComponentTemplate, key: "carbs" | "protein"): number {
  return (component.per100g[key] ?? 0) * (component.typicalGrams / 100);
}

/** Sums a set of (component, grams) pairs into one combined macro total. */
function sumComponents(entries: Array<{ component: DishComponentTemplate; grams: number }>): DailyMacroTotals {
  return entries.reduce<DailyMacroTotals>(
    (totals, { component, grams }) => {
      const factor = grams / 100;
      return {
        calories: totals.calories + component.per100g.calories * factor,
        protein: totals.protein + component.per100g.protein * factor,
        carbs: totals.carbs + component.per100g.carbs * factor,
        fat: totals.fat + component.per100g.fat * factor,
      };
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

function roundTotals(totals: DailyMacroTotals): DailyMacroTotals {
  return {
    calories: Math.round(totals.calories),
    protein: round1(totals.protein),
    carbs: round1(totals.carbs),
    fat: round1(totals.fat),
  };
}

function combinedPer100g(entries: Array<{ component: DishComponentTemplate; grams: number }>): {
  per100g: NormalizedFoodMacros;
  totalGrams: number;
} {
  const totalGrams = entries.reduce((sum, e) => sum + e.grams, 0);
  const totals = sumComponents(entries);

  if (totalGrams <= 0) {
    return { per100g: { calories: 0, protein: 0, carbs: 0, fat: 0 }, totalGrams: 0 };
  }

  const factor = 100 / totalGrams;

  return {
    per100g: {
      calories: totals.calories * factor,
      protein: totals.protein * factor,
      carbs: totals.carbs * factor,
      fat: totals.fat * factor,
    },
    totalGrams,
  };
}

/** 0-1. Rewards getting close to (but not over) remaining calories, and covering remaining protein. */
function fitScore(estimated: DailyMacroTotals, remaining: DailyMacroTotals): number {
  const calorieFit =
    remaining.calories > 0
      ? Math.max(0, 1 - Math.abs(remaining.calories - estimated.calories) / remaining.calories)
      : 0;

  const proteinCoverage = remaining.protein > 0 ? Math.min(1, estimated.protein / remaining.protein) : 1;

  return round1(proteinCoverage * 0.6 + calorieFit * 0.4); // keep 1 decimal, still a 0-1 fraction
}

function buildRecentFoodOption(item: FoodHistoryItem): NextMealOption | null {
  if (item.lastQuantityGrams <= 0) return null;

  const factor = 100 / item.lastQuantityGrams;
  const per100g: NormalizedFoodMacros = {
    calories: item.lastMacros.calories * factor,
    protein: item.lastMacros.protein * factor,
    carbs: item.lastMacros.carbs * factor,
    fat: item.lastMacros.fat * factor,
    fiber: item.lastMacros.fiber === null ? null : item.lastMacros.fiber * factor,
  };

  const estimatedNutrition = roundTotals({
    calories: item.lastMacros.calories,
    protein: item.lastMacros.protein,
    carbs: item.lastMacros.carbs,
    fat: item.lastMacros.fat,
  });

  return {
    id: `recent:${item.foodIdentity ?? item.foodName}`,
    name: item.foodName,
    source: "recent_food",
    adjustments: [],
    estimatedNutrition,
    provenance: "Your recent log — same portion as last time",
    logPayload: {
      foodName: item.foodName,
      source: item.source,
      sourceId: item.sourceId,
      barcode: item.barcode,
      per100g,
      quantityGrams: item.lastQuantityGrams,
      isEstimated: item.lastIsEstimated,
      estimationReason: null,
    },
  };
}

function dishDisplayEntries(template: DishTemplate, excludedTerms: string[]): DishComponentTemplate[] | null {
  const usable = template.components.filter((c) => !isExcluded(c.name, excludedTerms));

  const missingRequired = template.components.some(
    (c) => c.usuallyPresent && isExcluded(c.name, excludedTerms),
  );

  if (missingRequired) return null; // can't make this dish comply with an exclusion — skip it entirely
  return usable.filter((c) => c.usuallyPresent);
}

function buildHawkerDishOption(
  dishId: HawkerDishId,
  template: DishTemplate,
  entries: DishComponentTemplate[],
): NextMealOption {
  const standardEntries = entries.map((component) => ({ component, grams: component.typicalGrams }));
  const { per100g, totalGrams } = combinedPer100g(standardEntries);
  const estimatedNutrition = roundTotals(sumComponents(standardEntries));

  return {
    id: `hawker:${dishId}:standard`,
    name: template.displayName,
    source: "hawker_dish",
    adjustments: [],
    estimatedNutrition,
    provenance: "Comparable Reference — HawkerLens dish reference data (not measured)",
    logPayload: {
      foodName: template.displayName,
      source: "local",
      sourceId: `hawkerlens:${dishId}`,
      barcode: null,
      per100g,
      quantityGrams: totalGrams,
      isEstimated: true,
      estimationReason: "Suggested from HawkerLens comparable-reference data, not scanned or measured.",
    },
  };
}

/**
 * The mission's own worked example: "Chicken Rice — less rice, extra
 * chicken". Reduces the component with the most carbs, increases the
 * component with the most protein, and only returns a variant when it
 * measurably changes the total (some dishes have just one component
 * of each role, or reducing/increasing both hit the same component).
 */
function buildAdjustedHawkerDishOption(
  dishId: HawkerDishId,
  template: DishTemplate,
  entries: DishComponentTemplate[],
): NextMealOption | null {
  if (entries.length < 2) return null;

  const carbHeavy = [...entries].sort((a, b) => macroKeyDominant(b, "carbs") - macroKeyDominant(a, "carbs"))[0];
  const proteinHeavy = [...entries].sort(
    (a, b) => macroKeyDominant(b, "protein") - macroKeyDominant(a, "protein"),
  )[0];

  if (carbHeavy === proteinHeavy) return null;

  const adjustedEntries = entries.map((component) => {
    if (component === carbHeavy) {
      return { component, grams: Math.round(component.typicalGrams * COMPONENT_REDUCE_FACTOR) };
    }
    if (component === proteinHeavy) {
      return { component, grams: Math.round(component.typicalGrams * COMPONENT_INCREASE_FACTOR) };
    }
    return { component, grams: component.typicalGrams };
  });

  const { per100g, totalGrams } = combinedPer100g(adjustedEntries);
  const estimatedNutrition = roundTotals(sumComponents(adjustedEntries));

  const adjustments = [`less ${carbHeavy.name.toLowerCase()}`, `extra ${proteinHeavy.name.toLowerCase()}`];

  return {
    id: `hawker:${dishId}:adjusted`,
    name: template.displayName,
    source: "hawker_dish",
    adjustments,
    estimatedNutrition,
    provenance: "Comparable Reference — HawkerLens dish reference data (not measured)",
    logPayload: {
      foodName: `${template.displayName} (${adjustments.join(", ")})`,
      source: "local",
      sourceId: `hawkerlens:${dishId}:adjusted`,
      barcode: null,
      per100g,
      quantityGrams: totalGrams,
      isEstimated: true,
      estimationReason: "Suggested from HawkerLens comparable-reference data, not scanned or measured.",
    },
  };
}

function isViable(option: NextMealOption, remaining: DailyMacroTotals): boolean {
  if (remaining.calories <= 0) return false;
  return option.estimatedNutrition.calories <= remaining.calories * CALORIE_OVERAGE_TOLERANCE;
}

export function buildNextMealOptions(input: NextActionInput): NextActionResult {
  const { remaining, excludedTerms, recentFoods, frequentFoods } = input;

  if (remaining.calories <= 0) {
    return {
      hasRemainingBudget: false,
      remaining,
      options: [],
      message: "You've reached today's calorie target — no more meal suggestions for today.",
    };
  }

  const candidates: NextMealOption[] = [];

  const historyPool = [...recentFoods, ...frequentFoods].filter(
    (item, index, all) =>
      all.findIndex((other) => (other.foodIdentity ?? other.foodName) === (item.foodIdentity ?? item.foodName)) ===
      index,
  );

  for (const item of historyPool) {
    if (isExcluded(item.foodName, excludedTerms)) continue;
    const option = buildRecentFoodOption(item);
    if (option && isViable(option, remaining)) candidates.push(option);
  }

  for (const [dishId, template] of Object.entries(DISH_TEMPLATES) as Array<[HawkerDishId, DishTemplate]>) {
    const entries = dishDisplayEntries(template, excludedTerms);
    if (!entries || entries.length === 0) continue;

    const standard = buildHawkerDishOption(dishId, template, entries);
    if (isViable(standard, remaining)) candidates.push(standard);

    const adjusted = buildAdjustedHawkerDishOption(dishId, template, entries);
    if (adjusted && isViable(adjusted, remaining)) candidates.push(adjusted);
  }

  const ranked = candidates
    .map((option) => ({ option, score: fitScore(option.estimatedNutrition, remaining) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_OPTIONS)
    .map((entry) => entry.option);

  return {
    hasRemainingBudget: true,
    remaining,
    options: ranked,
    message:
      ranked.length > 0
        ? `${Math.round(remaining.calories)} kcal remaining · ${round1(remaining.protein)}g protein remaining`
        : "No good-fit suggestions from your history or HawkerLens dishes right now — search or log manually instead.",
  };
}
