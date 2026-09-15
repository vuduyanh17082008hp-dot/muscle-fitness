import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { isValidDateIso } from "@/lib/nutrition/date-utils"
import { scaleMacrosToGrams } from "@/lib/nutrition/food-log-calculator"
import type { NormalizedFoodMacros } from "@/lib/nutrition/food-data/types"
import type { EstimationConfidence, FoodLogSource, MealType } from "./types"
import { mapFoodLogRow, resolveLocalToday, type FoodLogRow } from "./load-food-log-context"
import { emitEvent } from "@/lib/events/emit"

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

  const macros = [input.per100g.calories, input.per100g.protein, input.per100g.carbs, input.per100g.fat]
  const optionalMacros = [input.per100g.fiber, input.per100g.sugar, input.per100g.sodiumMg]
  if (macros.some((value) => !Number.isFinite(value) || value < 0) ||
      optionalMacros.some((value) => value != null && (!Number.isFinite(value) || value < 0))) {
    return { success: false, error: "Nutrients must be finite, non-negative numbers." }
  }
  if (input.logDate !== undefined && !isValidDateIso(input.logDate)) {
    return { success: false, error: "Invalid calendar date." }
  }
  const scaled = scaleMacrosToGrams(input.per100g, input.quantityGrams)
  if (Object.values(scaled).some((value) => value !== null && !Number.isFinite(value))) {
    return { success: false, error: "Nutrient totals are out of range." }
  }
  const logDate = input.logDate ?? (await resolveLocalToday(supabase, userId))

  const { data, error } = await supabase
    .from("food_logs")
    .insert({
      user_id: userId,
      log_date: logDate,
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
    if (error) console.error("[FOOD LOG] createFoodLog failed:", error.message)
    return { success: false, error: "Nutrition data couldn't be saved. Please try again." }
  }

  const savedEntry = mapFoodLogRow(data as FoodLogRow)

  await emitEvent(supabase, {
    type: "FOOD_LOGGED",
    userId,
    payload: {
      foodLogId: savedEntry.id,
      mealType: savedEntry.mealType,
      calories: savedEntry.calories,
      source: savedEntry.source,
    },
  })

  return { success: true, data: savedEntry }
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
 * Storage rounding means repeated edits can lose precision; the stored row
 * is the only available baseline until per-100g provenance is persisted.
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
    if (fetchError) console.error("[FOOD LOG] updateFoodLogQuantity fetch failed:", fetchError.message)
    return { success: false, error: "Food log entry not found." }
  }

  const originalGrams = Number(existing.quantity_grams)
  if (!Number.isFinite(originalGrams) || originalGrams <= 0) {
    return { success: false, error: "Stored quantity is invalid. Remove and re-add this food." }
  }
  const factorBackToPer100g = 100 / originalGrams

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
    if (error) console.error("[FOOD LOG] updateFoodLogQuantity update failed:", error.message)
    return { success: false, error: "Nutrition data couldn't be saved. Please try again." }
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
    console.error("[FOOD LOG] deleteFoodLog failed:", error.message)
    return { success: false, error: "Nutrition data couldn't be deleted. Please try again." }
  }

  return { success: true, data: { id } }
}
