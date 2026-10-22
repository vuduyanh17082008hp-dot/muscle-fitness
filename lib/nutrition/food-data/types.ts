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

  /** Grams per single serving, when the source provides it (e.g. Open Food Facts `serving_quantity`). Used only to pre-fill the quantity input — never assumed equal to 100g. */
  servingSizeGrams?: number | null

  rawDescription?: string | null

  retrievedAt?: string

  /**
   * "high"   — matched a specific, well-identified record (e.g. a
   *            barcode lookup, or a Foundation/SR Legacy raw food
   *            that clearly matches the query).
   * "medium" — a reasonable keyword-ranked match.
   * "low"    — an estimated/best-effort match (see `isEstimated`).
   * "fallback" — the local curated table, used only when no
   *            external source is available or configured.
   */
  confidence?: "high" | "medium" | "low" | "fallback"

  /**
   * True when one or more of `per100g`'s values were not present in
   * the original source record and were filled in from a comparable
   * USDA-backed match instead of the source's own measured data.
   * Never set nutrient values from an estimate without also setting
   * this — the UI must be able to say "estimated" instead of
   * presenting a filled-in number as exact (spec: "Missing Macro
   * Data").
   */
  isEstimated?: boolean

  /** Which source record the estimate was derived from, e.g. `usda-123456`. */
  estimatedFrom?: string

  /** Human-readable reason the estimate was needed, e.g. "missing protein/fat from source". */
  estimationReason?: string
}

export type FoodSearchCategory = "raw" | "packaged" | "any"

/**
 * What one external provider actually did. "no_match" is only ever claimed
 * when the provider answered; a timeout or error says nothing about whether
 * the food exists.
 */
export type ProviderStatus = "results" | "no_match" | "timeout" | "error" | "unconfigured"

/** Overall outcome of the external providers for one search or barcode lookup. */
export type FoodSearchStatus = "results" | "no_match" | "provider_timeout" | "provider_error" | "invalid_input"

export type ProviderOutcome<T> = { status: ProviderStatus; value: T }

export function classifyProviderError(error: unknown): "timeout" | "error" {
  const name = (error as { name?: unknown } | null)?.name
  return name === "TimeoutError" || name === "AbortError" ? "timeout" : "error"
}

export type FoodSearchResult = {
  foods: NormalizedFood[]
  source: FoodSource
  /** True when an external API call could not be made or failed and a fallback was used instead. */
  usedFallback: boolean
  warning?: string
  /** External-provider outcome; with usedFallback, `foods` are local data, not provider results. */
  status: FoodSearchStatus
  providers: Partial<Record<"usda" | "open-food-facts", ProviderStatus>>
}
