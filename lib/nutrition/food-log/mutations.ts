import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { scaleMacrosToGrams } from "@/lib/nutrition/food-log-calculator"
import type { NormalizedFoodMacros } from "@/lib/nutrition/food-data/types"
import type { EstimationConfidence, FoodLogSource, MealType } from "./types"
import { mapFoodLogRow, todayIso, type FoodLogRow } from "./load-food-log-context"

export type CreateFoodLogInput = {
  mealType: MealType
  foodName: string
  brand?: string | null

  source: FoodLogSource
  sourceId?: string | null
  barcode?: string | null

  /** Per-100g macro profile — the log row always stores the SCALED total, computed here, never client-side. */
  per100g: NormalizedFoodMacros
  quantityGrams: number

  /** How the user actually entered this (e.g. "2 servings" of a 30g scoop) — display/prefill only, grams stay authoritative. */
  servingName?: string | null
  servingsConsumed?: number | null

  isEstimated?: boolean
  estimationConfidence?: EstimationConfidence | null
  estimationReason?: string | null
  estimatedFrom?: string | null

  logDate?: string
}

export type MutationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function createFoodLog(
  supabase: SupabaseClient,
  userId: string,
  input: CreateFoodLogInput,
): Promise<MutationResult<ReturnType<typeof mapFoodLogRow>>> {
  if (!input.foodName.trim()) {
    return { success: false, error: "Food name is required." }
  }

  if (!Number.isFinite(input.quantityGrams) || input.quantityGrams <= 0) {
    return { success: false, error: "Quantity must be a positive number of grams." }
  }

  const scaled = scaleMacrosToGrams(input.per100g, input.quantityGrams)

  const { data, error } = await supabase
    .from("food_logs")
    .insert({
      user_id: userId,
      log_date: input.logDate ?? todayIso(),
      meal_type: input.mealType,
      food_name: input.foodName.trim(),
      brand: input.brand ?? null,
      source: input.source,
      source_id: input.sourceId ?? null,
      barcode: input.barcode ?? null,
      quantity_grams: input.quantityGrams,
      serving_name: input.servingName ?? null,
      servings_consumed: input.servingsConsumed ?? null,
      calories: scaled.calories,
      protein_g: scaled.protein,
      carbs_g: scaled.carbs,
      fat_g: scaled.fat,
      fiber_g: scaled.fiber,
      is_estimated: input.isEstimated ?? false,
      estimation_confidence: input.estimationConfidence ?? null,
      estimation_reason: input.estimationReason ?? null,
      estimated_from: input.estimatedFrom ?? null,
    })
    .select(
      "id, log_date, meal_type, food_name, brand, source, source_id, barcode, quantity_grams, serving_name, servings_consumed, calories, protein_g, carbs_g, fat_g, fiber_g, is_estimated, estimation_confidence, estimation_reason, estimated_from, created_at",
    )
    .single()

  if (error || !data) {
    return { success: false, error: error?.message ?? "Unable to save this food." }
  }

  return { success: true, data: mapFoodLogRow(data as FoodLogRow) }
}

export type UpdateFoodLogQuantityInput = {
  id: string
  quantityGrams: number
  servingName?: string | null
  servingsConsumed?: number | null
}

/**
 * Recalculates a logged food's macros for a new gram quantity by
 * deriving its per-100g profile back out of the row already stored
 * (per100g = storedMacros / (storedGrams/100)), then rescaling to the
 * new quantity with the same deterministic calculator used when the
 * food was first added. No re-fetch of the original source needed,
 * and the math stays exact regardless of how many times it's edited.
 */
export async function updateFoodLogQuantity(
  supabase: SupabaseClient,
  userId: string,
  input: UpdateFoodLogQuantityInput,
): Promise<MutationResult<ReturnType<typeof mapFoodLogRow>>> {
  if (!Number.isFinite(input.quantityGrams) || input.quantityGrams <= 0) {
    return { success: false, error: "Quantity must be a positive number of grams." }
  }

  const { data: existing, error: fetchError } = await supabase
    .from("food_logs")
    .select("quantity_grams, calories, protein_g, carbs_g, fat_g, fiber_g")
    .eq("id", input.id)
    .eq("user_id", userId)
    .single()

  if (fetchError || !existing) {
    return { success: false, error: fetchError?.message ?? "Food log entry not found." }
  }

  const originalGrams = Number(existing.quantity_grams)
  const factorBackToPer100g = originalGrams > 0 ? 100 / originalGrams : 0

  const per100g: NormalizedFoodMacros = {
    calories: Number(existing.calories) * factorBackToPer100g,
    protein: Number(existing.protein_g) * factorBackToPer100g,
    carbs: Number(existing.carbs_g) * factorBackToPer100g,
    fat: Number(existing.fat_g) * factorBackToPer100g,
    fiber: existing.fiber_g === null ? null : Number(existing.fiber_g) * factorBackToPer100g,
  }

  const scaled = scaleMacrosToGrams(per100g, input.quantityGrams)

  const { data, error } = await supabase
    .from("food_logs")
    .update({
      quantity_grams: input.quantityGrams,
      serving_name: input.servingName ?? null,
      servings_consumed: input.servingsConsumed ?? null,
      calories: scaled.calories,
      protein_g: scaled.protein,
      carbs_g: scaled.carbs,
      fat_g: scaled.fat,
      fiber_g: scaled.fiber,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .eq("user_id", userId)
    .select(
      "id, log_date, meal_type, food_name, brand, source, source_id, barcode, quantity_grams, serving_name, servings_consumed, calories, protein_g, carbs_g, fat_g, fiber_g, is_estimated, estimation_confidence, estimation_reason, estimated_from, created_at",
    )
    .single()

  if (error || !data) {
    return { success: false, error: error?.message ?? "Unable to update this food." }
  }

  return { success: true, data: mapFoodLogRow(data as FoodLogRow) }
}

export async function deleteFoodLog(
  supabase: SupabaseClient,
  userId: string,
  id: string,
): Promise<MutationResult<{ id: string }>> {
  const { error } = await supabase
    .from("food_logs")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, data: { id } }
}
