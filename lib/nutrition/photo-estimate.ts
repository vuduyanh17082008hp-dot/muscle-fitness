import "server-only"

/**
 * Photo Meal Estimate orchestration (spec: "AI ROLE" — AI identifies,
 * DATABASE grounds, DETERMINISTIC CODE calculates, USER confirms).
 *
 * `identifyFoodsInImage` (lib/ai/vision-client.ts) never returns a
 * calorie/macro number — it only names foods and guesses a portion
 * weight. Every nutrient value in the result below comes from the
 * existing USDA/Open Food Facts cascade (lib/nutrition/food-data),
 * scaled by the SAME deterministic calculator used everywhere else
 * (lib/nutrition/food-log-calculator.ts).
 */

import { identifyFoodsInImage, isVisionConfigured } from "@/lib/ai/vision-client"
import { searchFood } from "@/lib/nutrition/food-data"
import { getLocalFallbackById, searchLocalFallback } from "@/lib/nutrition/food-data/local-fallback"
import type { FoodSearchStatus, NormalizedFood } from "@/lib/nutrition/food-data/types"
import { scaleMacrosToGrams, type ScaledMacros } from "@/lib/nutrition/food-log-calculator"
import { dropDecomposedComposites, reviewFoodMatch, type CookingMethod } from "@/lib/nutrition/photo-match-review"
import { matchVietnameseDish, templateItems } from "@/lib/nutrition/vietnamese-dishes"

export type PhotoEstimateItem = {
  detectedName: string
  estimatedGrams: number
  detectionConfidence: "high" | "medium" | "low"
  notes?: string
  preparation: CookingMethod
  preparationCertain: boolean
  /** Mixed dish this item is a component of, or null. */
  dish: string | null

  /** The grounding database match, or null if nothing comparable was found (spec: "user can add manually"). */
  groundedFood: NormalizedFood | null
  scaledMacros: ScaledMacros | null
  /** Other records the same search returned (groundedFood first) — the user can switch before logging. */
  candidates: NormalizedFood[]
  /** External-provider outcome of the grounding search; a failure means better matches may exist. */
  searchStatus: FoodSearchStatus
  /** Not seen in the photo: a typical part of the named dish (lib/nutrition/vietnamese-dishes.ts), for the user to confirm. */
  fromTemplate?: boolean
  /** Template part that is common but not always there: starts unticked. */
  optional?: boolean
  /** The record already reflects how this part is prepared: no added-oil line. */
  noAddedOil?: boolean
}

export type PhotoEstimateResult =
  | { status: "unconfigured" }
  | { status: "no_foods_detected" }
  | { status: "error"; message: string }
  /** `cookingOil` is the database record any added-oil line is priced from (never detected — the user sets the amount). */
  | { status: "ok"; items: PhotoEstimateItem[]; cookingOil: NormalizedFood | null }

export async function estimateMealFromPhoto(imageDataUrl: string): Promise<PhotoEstimateResult> {
  if (!isVisionConfigured()) {
    return { status: "unconfigured" }
  }

  const detection = await identifyFoodsInImage(imageDataUrl)

  if (!detection) {
    return { status: "error", message: "Photo analysis is temporarily unavailable." }
  }

  if (detection.items.length === 0) {
    return { status: "no_foods_detected" }
  }

  const grounded = await Promise.all(
    dropDecomposedComposites(detection.items).map(async (item): Promise<PhotoEstimateItem[]> => {
      // A whole Vietnamese dish the model couldn't break down: offer the catalog's typical parts, each flagged
      // as not seen in the photo, scaled to the model's portion guess.
      const wholeDish = item.dish === null ? matchVietnameseDish(item.name) : null
      if (wholeDish) return templateItems(wholeDish, item.estimatedGrams)

      // A component of a catalog dish: the dish's own record for that part goes first ("beef" in phở → lean beef).
      const dish = matchVietnameseDish(item.dish)
      const dishPart = dish ? searchLocalFallback(item.name).find((food) => dish.components.some((c) => c.foodId === food.id)) ?? null : null
      const component = dishPart && dish ? dish.components.find((c) => c.foodId === dishPart.id) : undefined

      const searchResult = await searchFood(item.name, "any")
      // A provider hit can be an unrelated or branded product ("broth" → bouillon powder, "banana" → banana
      // yogurt); keep the local records alongside and default to a name-matching, unbranded whole food.
      const local = searchResult.usedFallback ? [] : searchLocalFallback(item.name)
      const pool = [...searchResult.foods, ...local.filter((food) => !searchResult.foods.some((hit) => hit.id === food.id))]
      const rank = (food: NormalizedFood) =>
        (reviewFoodMatch(item.name, food).some((flag) => flag.kind === "name_mismatch") ? 2 : 0) +
        (food.brand || food.preparationState === "packaged" ? 1 : 0)
      const ranked = pool.map((food, index) => ({ food, index })).sort((a, b) => rank(a.food) - rank(b.food) || a.index - b.index).map(({ food }) => food)
      const candidates = (dishPart ? [dishPart, ...ranked.filter((food) => food.id !== dishPart.id)] : ranked).slice(0, 6)
      const bestMatch = candidates[0] ?? null

      return [{
        ...(component?.noAddedOil ? { noAddedOil: true } : {}),
        detectedName: item.name,
        estimatedGrams: item.estimatedGrams,
        detectionConfidence: item.confidence,
        notes: item.notes,
        preparation: item.preparation,
        preparationCertain: item.preparationCertain,
        dish: item.dish,
        groundedFood: bestMatch,
        scaledMacros: bestMatch ? scaleMacrosToGrams(bestMatch.per100g, item.estimatedGrams) : null,
        candidates,
        searchStatus: searchResult.status,
      }]
    }),
  )

  return { status: "ok", items: grounded.flat(), cookingOil: getLocalFallbackById("local-olive-oil") }
}
