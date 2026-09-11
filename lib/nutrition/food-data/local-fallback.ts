/**
 * Small, curated local fallback food table.
 *
 * This exists purely for resilience — used only when USDA/Open Food
 * Facts are unavailable, unconfigured, or a query matches nothing
 * useful. It is NOT a replacement for USDA FoodData Central and is
 * intentionally kept small (see docs/NUTRITION_DATA_SOURCES.md,
 * "Fallback strategy").
 *
 * Every entry states its preparationState explicitly so raw and
 * cooked values are never confused with each other.
 */

import type { NormalizedFood } from "./types"

const now = () => new Date().toISOString()

function localFood(
  input: Omit<NormalizedFood, "source" | "sourceLabel" | "confidence" | "retrievedAt">,
): NormalizedFood {
  return {
    ...input,
    source: "local",
    sourceLabel: "Local fallback",
    confidence: "fallback",
    retrievedAt: now(),
  }
}

export const LOCAL_FALLBACK_FOODS: NormalizedFood[] = [
  localFood({
    id: "local-oats-raw",
    name: "Oats",
    preparationState: "raw",
    rawDescription: "Rolled oats, dry",
    per100g: { calories: 389, protein: 16.9, carbs: 66.3, fat: 6.9, fiber: 10.6 },
  }),
  localFood({
    id: "local-white-rice-cooked",
    name: "White Rice — cooked",
    preparationState: "cooked",
    per100g: { calories: 130, protein: 2.7, carbs: 28.2, fat: 0.3, fiber: 0.4 },
  }),
  localFood({
    id: "local-white-rice-raw",
    name: "White Rice — dry/raw",
    preparationState: "raw",
    per100g: { calories: 365, protein: 7.1, carbs: 80, fat: 0.7, fiber: 1.3 },
  }),
  localFood({
    id: "local-chicken-breast-raw",
    name: "Chicken Breast — raw",
    preparationState: "raw",
    per100g: { calories: 120, protein: 22.5, carbs: 0, fat: 2.6 },
  }),
  localFood({
    id: "local-chicken-breast-cooked",
    name: "Chicken Breast — cooked",
    preparationState: "cooked",
    per100g: { calories: 165, protein: 31, carbs: 0, fat: 3.6 },
  }),
  localFood({
    id: "local-cod-raw",
    name: "Cod — raw",
    preparationState: "raw",
    per100g: { calories: 82, protein: 18, carbs: 0, fat: 0.7, sodiumMg: 54 },
  }),
  localFood({
    id: "local-salmon-raw",
    name: "Salmon — raw",
    preparationState: "raw",
    per100g: { calories: 142, protein: 20, carbs: 0, fat: 6.3 },
  }),
  localFood({
    id: "local-egg-whole-raw",
    name: "Whole Egg — raw",
    preparationState: "raw",
    per100g: { calories: 155, protein: 13, carbs: 1.1, fat: 11 },
  }),
  localFood({
    id: "local-greek-yogurt-plain",
    name: "Greek Yogurt — plain",
    preparationState: "packaged",
    per100g: { calories: 59, protein: 10, carbs: 3.6, fat: 0.4, sugar: 3.6 },
  }),
  localFood({
    id: "local-whey-protein",
    name: "Whey Protein",
    preparationState: "packaged",
    per100g: { calories: 380, protein: 80, carbs: 7, fat: 4 },
  }),
  localFood({
    id: "local-banana-raw",
    name: "Banana — raw",
    preparationState: "raw",
    per100g: { calories: 89, protein: 1.1, carbs: 22.8, fat: 0.3, fiber: 2.6, sugar: 12.2 },
  }),
  localFood({
    id: "local-apple-raw",
    name: "Apple — raw",
    preparationState: "raw",
    per100g: { calories: 52, protein: 0.3, carbs: 13.8, fat: 0.2, fiber: 2.4, sugar: 10.4 },
  }),
  localFood({
    id: "local-blueberries-raw",
    name: "Blueberries — raw",
    preparationState: "raw",
    per100g: { calories: 57, protein: 0.7, carbs: 14.5, fat: 0.3, fiber: 2.4, sugar: 10 },
  }),
  localFood({
    id: "local-broccoli-raw",
    name: "Broccoli — raw",
    preparationState: "raw",
    per100g: { calories: 34, protein: 2.8, carbs: 6.6, fat: 0.4, fiber: 2.6 },
  }),
  localFood({
    id: "local-spinach-raw",
    name: "Spinach — raw",
    preparationState: "raw",
    per100g: { calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4, fiber: 2.2 },
  }),
  localFood({
    id: "local-potato-raw",
    name: "Potato — raw",
    preparationState: "raw",
    per100g: { calories: 77, protein: 2, carbs: 17.5, fat: 0.1, fiber: 2.2 },
  }),
  localFood({
    id: "local-olive-oil",
    name: "Olive Oil",
    preparationState: "packaged",
    per100g: { calories: 884, protein: 0, carbs: 0, fat: 100 },
  }),
  localFood({
    id: "local-honey",
    name: "Honey",
    preparationState: "packaged",
    per100g: { calories: 304, protein: 0.3, carbs: 82.4, fat: 0, sugar: 82.1 },
  }),
  localFood({
    id: "local-whole-wheat-bread",
    name: "Whole Wheat Bread",
    preparationState: "packaged",
    per100g: { calories: 247, protein: 13, carbs: 41, fat: 3.4, fiber: 6 },
  }),
  localFood({
    id: "local-peanut-butter",
    name: "Peanut Butter",
    preparationState: "packaged",
    per100g: { calories: 588, protein: 25, carbs: 20, fat: 50, fiber: 6 },
  }),
  localFood({
    id: "local-skim-milk",
    name: "Skim Milk",
    preparationState: "packaged",
    per100g: { calories: 34, protein: 3.4, carbs: 5, fat: 0.1, sugar: 5 },
  }),
]

function normalize(value: string): string {
  return value.toLowerCase().trim()
}

export function searchLocalFallback(query: string): NormalizedFood[] {
  const normalizedQuery = normalize(query)

  if (!normalizedQuery) {
    return LOCAL_FALLBACK_FOODS
  }

  return LOCAL_FALLBACK_FOODS.filter((food) =>
    normalize(food.name).includes(normalizedQuery),
  )
}

export function getLocalFallbackById(id: string): NormalizedFood | null {
  return LOCAL_FALLBACK_FOODS.find((food) => food.id === id) ?? null
}
