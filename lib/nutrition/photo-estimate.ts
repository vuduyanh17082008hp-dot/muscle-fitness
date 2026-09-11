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
import type { NormalizedFood } from "@/lib/nutrition/food-data/types"
import { scaleMacrosToGrams, type ScaledMacros } from "@/lib/nutrition/food-log-calculator"

export type PhotoEstimateItem = {
  detectedName: string
  estimatedGrams: number
  detectionConfidence: "high" | "medium" | "low"
  notes?: string

  /** The grounding database match, or null if nothing comparable was found (spec: "user can add manually"). */
  groundedFood: NormalizedFood | null
  scaledMacros: ScaledMacros | null
}

export type PhotoEstimateResult =
  | { status: "unconfigured" }
  | { status: "no_foods_detected" }
  | { status: "error"; message: string }
  | { status: "ok"; items: PhotoEstimateItem[] }

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
    detection.items.map(async (item): Promise<PhotoEstimateItem> => {
      const searchResult = await searchFood(item.name, "any")
      const bestMatch = searchResult.foods[0] ?? null

      return {
        detectedName: item.name,
        estimatedGrams: item.estimatedGrams,
        detectionConfidence: item.confidence,
        notes: item.notes,
        groundedFood: bestMatch,
        scaledMacros: bestMatch ? scaleMacrosToGrams(bestMatch.per100g, item.estimatedGrams) : null,
      }
    }),
  )

  return { status: "ok", items: grounded }
}
