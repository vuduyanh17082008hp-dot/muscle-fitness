/**
 * FOOD PRICE ARCHITECTURE
 *
 * USDA FoodData Central and Open Food Facts provide NUTRIENT data, not
 * live supermarket pricing. Neither is a reliable universal price API,
 * so pricing lives in its own, clearly-labelled architecture instead of
 * being invented at request time.
 *
 * This file is a manually maintained DEMO market dataset (source #2 in
 * the FoodPrice.source vocabulary below) — realistic Singapore
 * supermarket estimates, not a live feed. Every price is flagged
 * `isEstimate: true` and the UI must always render the label
 * "ESTIMATED MARKET PRICE", never "LIVE PRICE".
 *
 * If a real pricing provider is ever configured, it should populate
 * this same FoodPrice shape (source #3) — the budget engine
 * (lib/nutrition/budget.ts) does not care where a price came from, only
 * that it is shaped like this.
 */

import { FOOD_TEMPLATES } from "@/lib/nutrition/plan"
import type { ShoppingList } from "@/lib/nutrition/shopping-list"

export type FoodPriceSource =
  | "user_catalog"
  | "demo_market_dataset"
  | "live_provider"

export type FoodPrice = {
  foodId: string
  market: string
  currency: "SGD"
  quantity: number
  unit: "g" | "kg" | "unit"
  price: number
  pricePer100g: number
  source: FoodPriceSource
  observedAt: string
  isEstimate: boolean
}

/**
 * Estimated Singapore supermarket prices (SGD) for the exact
 * preparation state each food is used in across lib/nutrition/plan.ts
 * meal blueprints (see FOOD_TEMPLATES.preparationState) — e.g.
 * "Chicken Breast" here prices a cooked, edible 100 g portion, matching
 * how many grams of it actually appear in a generated meal.
 *
 * DEMO DATA — not a live feed. See module doc comment above.
 */
export const FOOD_PRICE_CATALOG: Record<string, FoodPrice> = {
  oats: priceEntry("oats", 0.32),
  rice: priceEntry("rice", 0.15),
  rice_cakes: priceEntry("rice_cakes", 0.6),
  potato: priceEntry("potato", 0.25),
  wholegrain_bread: priceEntry("wholegrain_bread", 0.8),
  chicken_breast: priceEntry("chicken_breast", 1.1),
  cod: priceEntry("cod", 1.8),
  salmon: priceEntry("salmon", 2.8),
  eggs: priceEntry("eggs", 0.6),
  greek_yogurt: priceEntry("greek_yogurt", 0.9),
  whey_protein: priceEntry("whey_protein", 3.5),
  banana: priceEntry("banana", 0.25),
  berries: priceEntry("berries", 1.2),
  vegetables: priceEntry("vegetables", 0.35),
  olive_oil: priceEntry("olive_oil", 1.5),
  peanut_butter: priceEntry("peanut_butter", 1.0),
  honey: priceEntry("honey", 1.2),
}

function priceEntry(foodId: string, pricePer100g: number): FoodPrice {
  return {
    foodId,
    market: "Singapore (estimated)",
    currency: "SGD",
    quantity: 100,
    unit: "g",
    price: pricePer100g,
    pricePer100g,
    source: "demo_market_dataset",
    observedAt: "2026-01-01",
    isEstimate: true,
  }
}

/** True only for prices that come from a configured live provider. */
export function isLivePrice(price: FoodPrice): boolean {
  return price.source === "live_provider" && !price.isEstimate
}

export function getFoodPrice(foodId: string): FoodPrice | null {
  return FOOD_PRICE_CATALOG[foodId] ?? null
}

export function priceForGrams(foodId: string, grams: number): number | null {
  const price = getFoodPrice(foodId)
  if (!price) return null

  return Math.round(((price.pricePer100g * grams) / 100) * 100) / 100
}

export type ShoppingListItemCost = {
  foodId: string
  name: string
  grams: number
  costSgd: number | null
  pricePer100g: number | null
  isEstimate: boolean
}

export type ShoppingListCostSummary = {
  totalSgd: number
  currency: "SGD"
  isEstimate: true
  items: ShoppingListItemCost[]
  missingPriceFoodIds: string[]
}

/**
 * Layers estimated cost on top of an already-built ShoppingList without
 * touching how the list itself is generated — the shopping list stays
 * the single source of truth for quantities (lib/nutrition/shopping-list.ts).
 */
export function estimateShoppingListCost(
  list: ShoppingList,
): ShoppingListCostSummary {
  const items: ShoppingListItemCost[] = []
  const missingPriceFoodIds: string[] = []
  let totalSgd = 0

  for (const group of list.groups) {
    for (const item of group.items) {
      const price = getFoodPrice(item.foodId)

      if (!price) {
        missingPriceFoodIds.push(item.foodId)

        items.push({
          foodId: item.foodId,
          name: item.name,
          grams: item.totalGrams,
          costSgd: null,
          pricePer100g: null,
          isEstimate: true,
        })

        continue
      }

      const costSgd = priceForGrams(item.foodId, item.totalGrams) ?? 0
      totalSgd += costSgd

      items.push({
        foodId: item.foodId,
        name: item.name,
        grams: item.totalGrams,
        costSgd,
        pricePer100g: price.pricePer100g,
        isEstimate: true,
      })
    }
  }

  return {
    totalSgd: Math.round(totalSgd * 100) / 100,
    currency: "SGD",
    isEstimate: true,
    items,
    missingPriceFoodIds,
  }
}

/** Every priced food must exist in the shared food template catalog. */
export function assertPriceCatalogMatchesFoodTemplates(): string[] {
  const templateIds = new Set(FOOD_TEMPLATES.map((food) => food.id))

  return Object.keys(FOOD_PRICE_CATALOG).filter((id) => !templateIds.has(id))
}
