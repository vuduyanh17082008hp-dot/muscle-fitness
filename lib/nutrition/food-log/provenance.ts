import "server-only"

import { getLocalFallbackById } from "@/lib/nutrition/food-data/local-fallback"
import { getProductByBarcode } from "@/lib/nutrition/food-data/open-food-facts"
import type { NormalizedFood, NormalizedFoodMacros } from "@/lib/nutrition/food-data/types"
import { getFoodById } from "@/lib/nutrition/food-data/usda"
import { FOOD_LOG_SOURCE_LABEL, type EstimationConfidence, type FoodLogSource } from "./types"

/**
 * Server-owned food provenance. The client (or a model) may PROPOSE a source and a per-100 g profile; it can never
 * make them authoritative. A database source (usda / open-food-facts / local) is honoured only when the server
 * re-resolves the record by its stable id, and then the SERVER's profile is stored, not the submitted one. A claim
 * that cannot be re-resolved is kept as what it actually is: user-provided, estimated.
 *
 * The one thing a caller may always do is be MORE conservative: `isEstimated: true` is honoured for any source
 * (e.g. a verified food whose portion was estimated from a photo).
 */

export type FoodProvenanceClaim = {
  source: FoodLogSource
  sourceId?: string | null
  barcode?: string | null
  per100g: NormalizedFoodMacros
  isEstimated?: boolean
  estimationConfidence?: EstimationConfidence | null
  estimationReason?: string | null
  estimatedFrom?: string | null
}

export type ResolvedFoodProvenance = {
  source: FoodLogSource
  per100g: NormalizedFoodMacros
  isEstimated: boolean
  estimationConfidence: EstimationConfidence | null
  estimationReason: string | null
  estimatedFrom: string | null
  /** True only when the server re-resolved the record itself. */
  verified: boolean
}

const FDC_ID = /^\d{1,12}$/
const BARCODE = /^\d{6,14}$/

async function trustedRecord(claim: FoodProvenanceClaim): Promise<NormalizedFood | null> {
  const id = claim.sourceId?.trim() ?? ""
  try {
    if (claim.source === "usda") return FDC_ID.test(id) ? await getFoodById(id) : null
    if (claim.source === "open-food-facts") {
      const code = claim.barcode?.trim() || id
      return BARCODE.test(code) ? await getProductByBarcode(code) : null
    }
    if (claim.source === "local") return id ? getLocalFallbackById(id) : null
  } catch {
    // A lookup failure is "could not verify", never "verified".
  }
  return null
}

export async function resolveFoodProvenance(claim: FoodProvenanceClaim): Promise<ResolvedFoodProvenance> {
  const clientEstimate = {
    estimationConfidence: claim.estimationConfidence ?? null,
    estimationReason: claim.estimationReason ?? null,
    estimatedFrom: claim.estimatedFrom ?? null,
  }

  // Not database claims: the source label already says the values are the user's own / a model's estimate.
  if (claim.source === "user_provided") return { source: "user_provided", per100g: claim.per100g, isEstimated: claim.isEstimated ?? false, ...clientEstimate, verified: false }
  if (claim.source === "ai_estimate") return { source: "ai_estimate", per100g: claim.per100g, isEstimated: true, ...clientEstimate, verified: false }

  const record = await trustedRecord(claim)
  if (record && record.source === claim.source) {
    const recordEstimated = record.isEstimated === true
    const isEstimated = recordEstimated || claim.isEstimated === true
    return {
      source: claim.source,
      per100g: record.per100g,
      isEstimated,
      estimationConfidence: isEstimated ? (claim.estimationConfidence ?? "medium") : null,
      estimationReason: isEstimated ? (claim.estimationReason ?? record.estimationReason ?? null) : null,
      estimatedFrom: isEstimated ? (claim.estimatedFrom ?? record.estimatedFrom ?? null) : null,
      verified: true,
    }
  }

  return {
    source: "user_provided",
    per100g: claim.per100g,
    isEstimated: true,
    estimationConfidence: "low",
    estimationReason: `Could not be verified against ${FOOD_LOG_SOURCE_LABEL[claim.source]} when saved, so the submitted values are stored as user-provided.`,
    estimatedFrom: null,
    verified: false,
  }
}

/** Per 100 g of anything: no macro exceeds 100 g, the three together cannot exceed the 100 g they are part of, and pure fat is ~900 kcal. */
export function isPlausiblePer100g(per100g: NormalizedFoodMacros): boolean {
  const { calories, protein, carbs, fat, fiber, sugar, sodiumMg } = per100g
  const required = [calories, protein, carbs, fat]
  const optional = [fiber, sugar, sodiumMg]
  if (required.some((value) => !Number.isFinite(value) || value < 0)) return false
  if (optional.some((value) => value != null && (!Number.isFinite(value) || value < 0))) return false
  // ponytail: fixed tolerances (label rounding); switch to an Atwater consistency check if real records get rejected.
  return calories <= 905 && protein + carbs + fat <= 102 && (fiber ?? 0) <= 100 && (sugar ?? 0) <= 100 && (sodiumMg ?? 0) <= 40000
}
