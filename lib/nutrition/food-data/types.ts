/**
 * Normalized food-data model shared by every adapter (USDA, Open
 * Food Facts, local fallback). Nothing outside this module should
 * work with raw USDA/OFF response shapes — everything is converted
 * to `NormalizedFood` at the adapter boundary so the rest of the app
 * only ever deals with one consistent, typed shape.
 *
 * See docs/NUTRITION_DATA_SOURCES.md for the research behind the
 * source selection and priority order implemented in `index.ts`.
 */

export type FoodSource = "usda" | "open-food-facts" | "local"

/**
 * Whether the nutrient values describe the food raw, cooked, some
 * other prepared state, or a packaged/branded product as sold.
 * This must never be assumed — raw and cooked weights/nutrients are
 * not interchangeable (100 g raw chicken breast and 100 g cooked
 * chicken breast are materially different foods).
 */
export type FoodPreparationState =
  | "raw"
  | "cooked"
  | "prepared"
  | "packaged"
  | "unknown"

export type NormalizedFoodMacros = {
  calories: number
  protein: number
  carbs: number
  fat: number

  fiber?: number | null
  sugar?: number | null
  sodiumMg?: number | null
}

export type NormalizedFood = {
  id: string
  name: string
  source: FoodSource
  sourceId?: string
  sourceLabel: string

  preparationState: FoodPreparationState

  per100g: NormalizedFoodMacros

  brand?: string | null
  barcode?: string | null

  rawDescription?: string | null

  retrievedAt?: string

  /**
   * "high"   — matched a specific, well-identified record (e.g. a
   *            barcode lookup, or a Foundation/SR Legacy raw food
   *            that clearly matches the query).
   * "medium" — a reasonable keyword-ranked match.
   * "fallback" — the local curated table, used only when no
   *            external source is available or configured.
   */
  confidence?: "high" | "medium" | "fallback"
}

export type FoodSearchCategory = "raw" | "packaged" | "any"

export type FoodSearchResult = {
  foods: NormalizedFood[]
  source: FoodSource
  /** True when an external API call could not be made or failed and a fallback was used instead. */
  usedFallback: boolean
  warning?: string
}
