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

import { isUsdaConfigured, searchFood as searchUsda } from "./usda"
import { getProductByBarcode, searchPackagedFood } from "./open-food-facts"
import { searchLocalFallback } from "./local-fallback"
import type { FoodSearchCategory, FoodSearchResult, NormalizedFood } from "./types"

export type { FoodSearchCategory, FoodSearchResult, NormalizedFood } from "./types"
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
    return { foods: [], source: "local", usedFallback: true, warning: "Empty query." }
  }

  const preferPackagedFirst = category === "packaged" || (category === "any" && looksPackaged(trimmedQuery))

  if (preferPackagedFirst) {
    const packaged = await searchPackagedFood(trimmedQuery)
    if (packaged.length > 0) {
      return { foods: packaged, source: "open-food-facts", usedFallback: false }
    }

    if (category !== "packaged") {
      const raw = await searchUsda(trimmedQuery)
      if (raw.length > 0) {
        return { foods: raw, source: "usda", usedFallback: false }
      }
    }
  } else {
    const raw = await searchUsda(trimmedQuery)
    if (raw.length > 0) {
      return { foods: raw, source: "usda", usedFallback: false }
    }

    if (category !== "raw") {
      const packaged = await searchPackagedFood(trimmedQuery)
      if (packaged.length > 0) {
        return { foods: packaged, source: "open-food-facts", usedFallback: false }
      }
    }
  }

  const local = searchLocalFallback(trimmedQuery)

  return {
    foods: local,
    source: "local",
    usedFallback: true,
    warning: isUsdaConfigured()
      ? "No external match found — showing local fallback data."
      : "USDA_FDC_API_KEY is not configured — showing local fallback data.",
  }
}

export async function lookupBarcode(barcode: string): Promise<NormalizedFood | null> {
  return getProductByBarcode(barcode)
}
