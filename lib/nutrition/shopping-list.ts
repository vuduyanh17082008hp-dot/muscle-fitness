/**
 * Shopping-list aggregation (PHASE 12-14 of the food-data work).
 *
 * This is a pure function over an already-built `NutritionPlan` — it
 * does NOT recompute the plan, call any external API, or introduce a
 * second meal-plan formula. It is the single, deterministic
 * transformation from "today's meals" to "what to buy," so the
 * shopping list can never drift from what /dashboard/nutrition shows.
 *
 * Allergy/exclusion safety is inherited for free: `buildNutritionPlan()`
 * already filters/substitutes blocked ingredients before any meal
 * reaches `plan.meals`, so a food removed for an allergy can never
 * appear here either.
 */

import type {
  FoodCategory,
  MealMeasurementBasis,
  NutritionPlan,
} from "@/lib/nutrition/plan"

export const SHOPPING_LIST_DAY_OPTIONS = [1, 3, 5, 7, 14] as const
export type ShoppingListDayOption = (typeof SHOPPING_LIST_DAY_OPTIONS)[number]

export const DEFAULT_SHOPPING_LIST_DAYS: ShoppingListDayOption = 7

export type ShoppingListItem = {
  foodId: string
  name: string
  category: FoodCategory
  totalGrams: number
  measurementBasis: MealMeasurementBasis
  displayQuantity: string
}

export type ShoppingListGroup = {
  category: FoodCategory
  label: string
  items: ShoppingListItem[]
}

export type ShoppingList = {
  days: number
  groups: ShoppingListGroup[]
  itemCount: number
  generatedAt: string
}

const CATEGORY_ORDER: FoodCategory[] = ["protein", "carb", "fruit", "vegetable", "fat"]

const CATEGORY_LABELS: Record<FoodCategory, string> = {
  protein: "Protein",
  carb: "Carbohydrates",
  fruit: "Fruit",
  vegetable: "Vegetables",
  fat: "Fats & Pantry",
}

export function isValidShoppingListDays(value: number): value is ShoppingListDayOption {
  return (SHOPPING_LIST_DAY_OPTIONS as readonly number[]).includes(value)
}

/**
 * < 1000 g shows grams; >= 1000 g shows kilograms — per the product
 * spec, never a raw 4-digit gram figure.
 */
export function formatShoppingQuantity(totalGrams: number): string {
  if (totalGrams < 1000) {
    return `${Math.round(totalGrams)} g`
  }

  return `${(totalGrams / 1000).toFixed(2)} kg`
}

export function buildShoppingList(
  plan: NutritionPlan,
  days: ShoppingListDayOption,
): ShoppingList {
  const dailyTotals = new Map<
    string,
    { name: string; category: FoodCategory; measurementBasis: MealMeasurementBasis; grams: number }
  >()

  for (const meal of plan.meals) {
    for (const ingredient of meal.ingredients) {
      const existing = dailyTotals.get(ingredient.foodId)

      if (existing) {
        existing.grams += ingredient.grams
        continue
      }

      dailyTotals.set(ingredient.foodId, {
        name: ingredient.name,
        category: ingredient.category,
        measurementBasis: ingredient.measurementBasis,
        grams: ingredient.grams,
      })
    }
  }

  const itemsByCategory = new Map<FoodCategory, ShoppingListItem[]>()

  for (const [foodId, entry] of dailyTotals) {
    const totalGrams = entry.grams * days

    const item: ShoppingListItem = {
      foodId,
      name: entry.name,
      category: entry.category,
      measurementBasis: entry.measurementBasis,
      totalGrams,
      displayQuantity: formatShoppingQuantity(totalGrams),
    }

    const bucket = itemsByCategory.get(entry.category) ?? []
    bucket.push(item)
    itemsByCategory.set(entry.category, bucket)
  }

  const groups: ShoppingListGroup[] = CATEGORY_ORDER.filter((category) =>
    itemsByCategory.has(category),
  ).map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    items: (itemsByCategory.get(category) ?? []).sort((a, b) => b.totalGrams - a.totalGrams),
  }))

  const itemCount = groups.reduce((total, group) => total + group.items.length, 0)

  return {
    days,
    groups,
    itemCount,
    generatedAt: new Date().toISOString(),
  }
}
