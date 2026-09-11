import "server-only"

/**
 * Missing Macro Data fallback (spec: "MISSING MACRO DATA").
 *
 * When a source record (currently: an Open Food Facts barcode
 * product) is missing one or more of calories/protein/carbs/fat, we
 * never display zero and we never let an LLM invent the number.
 * Instead we attempt to fill only the missing fields from the
 * closest comparable USDA-backed match, and the result is always
 * marked `isEstimated: true` with provenance (`estimatedFrom`,
 * `estimationReason`) so the UI can say "estimated" rather than
 * presenting a filled-in value as exact source data.
 *
 * If no comparable USDA match exists, this returns `null` — the
 * caller falls back to its existing "not found" behavior rather than
 * guessing.
 */

import { searchFood as searchUsdaFood } from "./usda"
import type { NormalizedFoodMacros } from "./types"

export type PartialMacros = {
  calories: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
  fiber?: number | null
  sugar?: number | null
  sodiumMg?: number | null
}

export type MacroEstimationResult = {
  macros: NormalizedFoodMacros
  isEstimated: boolean
  estimatedFrom?: string
  estimationReason?: string
  confidence: "medium" | "low"
}

const REQUIRED_KEYS = ["calories", "protein", "carbs", "fat"] as const

export async function fillMissingMacrosFromUsda(
  name: string,
  known: PartialMacros,
): Promise<MacroEstimationResult | null> {
  const missing = REQUIRED_KEYS.filter((key) => known[key] === null)

  if (missing.length === 0) {
    return {
      macros: {
        calories: known.calories as number,
        protein: known.protein as number,
        carbs: known.carbs as number,
        fat: known.fat as number,
        fiber: known.fiber ?? null,
        sugar: known.sugar ?? null,
        sodiumMg: known.sodiumMg ?? null,
      },
      isEstimated: false,
      confidence: "medium",
    }
  }

  let matches: Awaited<ReturnType<typeof searchUsdaFood>> = []

  try {
    matches = await searchUsdaFood(name, { limit: 3 })
  } catch (error) {
    console.warn("[NUTRITION ESTIMATE] USDA lookup failed:", error)
    return null
  }

  const best = matches[0]

  if (!best) {
    return null
  }

  const merged: NormalizedFoodMacros = {
    calories: known.calories ?? best.per100g.calories,
    protein: known.protein ?? best.per100g.protein,
    carbs: known.carbs ?? best.per100g.carbs,
    fat: known.fat ?? best.per100g.fat,
    fiber: known.fiber ?? best.per100g.fiber ?? null,
    sugar: known.sugar ?? best.per100g.sugar ?? null,
    sodiumMg: known.sodiumMg ?? best.per100g.sodiumMg ?? null,
  }

  return {
    macros: merged,
    isEstimated: true,
    estimatedFrom: best.id,
    estimationReason: `Missing ${missing.join(", ")} from the source record — filled in from a comparable USDA match ("${best.name}").`,
    confidence: "low",
  }
}
