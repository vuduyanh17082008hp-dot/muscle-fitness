import "server-only"

/**
 * Source-hierarchy orchestrator (PHASE 3 of the nutrition data-layer
 * work). This is the only entry point the rest of the app should use
 * to look food data up live — it decides which adapter to try first
 * and guarantees a usable (never throwing) result.
 *
 * RAW / BASIC FOODS
 *   1. USDA Foundation / SR Legacy (lib/nutrition/food-data/usda.ts)
 *   2. Local curated fallback
 *
 * PACKAGED / BRANDED FOODS
 *   1. Open Food Facts (lib/nutrition/food-data/open-food-facts.ts)
 *   2. Local curated fallback
 *
 * See docs/NUTRITION_DATA_SOURCES.md for the full research behind
 * this ordering.
 */

import { isUsdaConfigured, searchFoodWithStatus as searchUsda } from "./usda"
import { getProductByBarcodeWithStatus, searchPackagedFoodWithStatus as searchPackagedFood } from "./open-food-facts"
import { searchLocalFallback } from "./local-fallback"
import type { FoodSearchCategory, FoodSearchResult, FoodSearchStatus, NormalizedFood, ProviderStatus } from "./types"

export type { FoodSearchCategory, FoodSearchResult, FoodSearchStatus, NormalizedFood, ProviderStatus } from "./types"

const PROVIDER_LABEL = { usda: "USDA", "open-food-facts": "Open Food Facts" } as const
export { isUsdaConfigured } from "./usda"

/**
 * Very small heuristic: does this look like a request for a specific
 * commercial product rather than a basic/raw food? This only decides
 * *which source to try first* — both are always attempted before
 * falling back to local data.
 */
function looksPackaged(query: string): boolean {
  const text = query.toLowerCase()

  return [
    "protein powder",
    "whey",
    "cereal",
    "bar",
    "yogurt",
    "yoghurt",
    "bread",
    "sauce",
    "snack",
    "drink",
    "brand",
  ].some((keyword) => text.includes(keyword))
}

export async function searchFood(
  query: string,
  category: FoodSearchCategory = "any",
): Promise<FoodSearchResult> {
  const trimmedQuery = query.trim()

  if (!trimmedQuery) {
    return { foods: [], source: "local", usedFallback: true, warning: "Empty query.", status: "invalid_input", providers: {} }
  }

  const preferPackagedFirst = category === "packaged" || (category === "any" && looksPackaged(trimmedQuery))
  const order: Array<keyof typeof PROVIDER_LABEL> = preferPackagedFirst
    ? category === "packaged" ? ["open-food-facts"] : ["open-food-facts", "usda"]
    : category === "raw" ? ["usda"] : ["usda", "open-food-facts"]

  const providers: FoodSearchResult["providers"] = {}

  for (const provider of order) {
    const outcome = provider === "usda" ? await searchUsda(trimmedQuery) : await searchPackagedFood(trimmedQuery)
    providers[provider] = outcome.status

    if (outcome.value.length > 0) {
      // A provider tried earlier may have failed; the results are real, but say what was skipped.
      const degraded = order.filter((p) => isFailure(providers[p]))
      return {
        foods: outcome.value,
        source: provider,
        usedFallback: false,
        status: "results",
        providers,
        ...(degraded.length > 0
          ? { warning: `${degraded.map((p) => PROVIDER_LABEL[p]).join(" and ")} didn't respond — results may be incomplete.` }
          : {}),
      }
    }
  }

  const failed = order.filter((p) => isFailure(providers[p]))
  const status: FoodSearchStatus = failed.some((p) => providers[p] === "timeout")
    ? "provider_timeout"
    : failed.length > 0
      ? "provider_error"
      : "no_match"

  return {
    foods: searchLocalFallback(trimmedQuery),
    source: "local",
    usedFallback: true,
    status,
    providers,
    warning:
      failed.length > 0
        ? `${failed.map((p) => `${PROVIDER_LABEL[p]} ${providers[p] === "timeout" ? "timed out" : "returned an error"}`).join(" and ")} — this isn't a confirmed "no match". Showing local fallback data; try again shortly.`
        : isUsdaConfigured()
          ? "No external match found — showing local fallback data."
          : "USDA_FDC_API_KEY is not configured — showing local fallback data.",
  }
}

function isFailure(status: ProviderStatus | undefined): boolean {
  return status === "timeout" || status === "error"
}

export async function lookupBarcode(
  barcode: string,
): Promise<{ status: Exclude<FoodSearchStatus, "invalid_input">; food: NormalizedFood | null }> {
  const outcome = await getProductByBarcodeWithStatus(barcode)
  const status =
    outcome.status === "timeout" ? "provider_timeout" : outcome.status === "error" ? "provider_error" : outcome.value ? "results" : "no_match"
  return { status, food: outcome.value }
}
