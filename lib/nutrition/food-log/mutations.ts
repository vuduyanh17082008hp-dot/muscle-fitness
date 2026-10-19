import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { isSupportedFoodLogWriteDate } from "@/lib/nutrition/date-utils"
import { scaleMacrosToGrams } from "@/lib/nutrition/food-log-calculator"
import type { NormalizedFoodMacros } from "@/lib/nutrition/food-data/types"
import type { EstimationConfidence, FoodLogSource, MealType } from "./types"
import { isIdempotencyKey } from "./idempotency-key"
import { isPlausiblePer100g, resolveFoodProvenance, type ResolvedFoodProvenance } from "./provenance"
import { mapFoodLogRow, resolveLocalToday, type FoodLogRow } from "./load-food-log-context"
import { emitEvent } from "@/lib/events/emit"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

const FOOD_LOG_SELECT =
  "id, log_date, meal_type, food_name, brand, source, source_id, barcode, quantity_grams, serving_name, servings_consumed, calories, protein_g, carbs_g, fat_g, fiber_g, is_estimated, estimation_confidence, estimation_reason, estimated_from, created_at"

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

  /** Client-generated request key. Scoped to user_id; never used for ownership. */
  idempotencyKey?: string

  /**
   * A claimed (confirmed) Dante pending action. When set, the insert and the
   * action's transition to 'executed' happen in ONE transaction
   * (finalize_food_log_action); the action id is the idempotency key.
   */
  finalizeActionId?: string

  /**
   * The profile was computed by server code from server-held data (e.g. a meal draft built from the ingredient table),
   * so there is nothing to re-resolve. NEVER set from request data: the HTTP schema does not carry this field.
   */
  serverComputedProfile?: true
}

export type MutationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; status?: 400 | 500 }

export async function createFoodLog(
  supabase: SupabaseClient,
  userId: string,
  input: CreateFoodLogInput,
): Promise<MutationResult<ReturnType<typeof mapFoodLogRow>>> {
  if (!input.foodName.trim()) {
    return { success: false, error: "Food name is required.", status: 400 }
  }

  if (!Number.isFinite(input.quantityGrams) || input.quantityGrams <= 0) {
    return { success: false, error: "Quantity must be a positive number of grams.", status: 400 }
  }

  if (!isPlausiblePer100g(input.per100g)) {
    return { success: false, error: "Nutrients must be finite, non-negative and physically possible per 100 g.", status: 400 }
  }

  const idempotencyKey = input.finalizeActionId ?? input.idempotencyKey ?? crypto.randomUUID()
  if (!isIdempotencyKey(idempotencyKey)) {
    return { success: false, error: "Invalid idempotency key.", status: 400 }
  }

  const localToday = await resolveLocalToday(supabase, userId)
  const logDate = input.logDate ?? localToday
  if (!isSupportedFoodLogWriteDate(logDate, localToday)) {
    return { success: false, error: "Food can only be logged for today.", status: 400 }
  }
  // Trust boundary: source, per-100 g profile and estimation status are decided here, never taken from the request.
  const provenance: ResolvedFoodProvenance = input.serverComputedProfile
    ? { source: input.source, per100g: input.per100g, isEstimated: input.isEstimated ?? false, estimationConfidence: input.estimationConfidence ?? null, estimationReason: input.estimationReason ?? null, estimatedFrom: input.estimatedFrom ?? null, verified: true }
    : await resolveFoodProvenance(input)
  const scaled = scaleMacrosToGrams(provenance.per100g, input.quantityGrams)
  if (Object.values(scaled).some((value) => value !== null && !Number.isFinite(value))) {
    return { success: false, error: "Nutrient totals are out of range.", status: 400 }
  }

  const row = {
    user_id: userId,
    log_date: logDate,
    meal_type: input.mealType,
    food_name: input.foodName.trim(),
    brand: input.brand ?? null,
    source: provenance.source,
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
    is_estimated: provenance.isEstimated,
    estimation_confidence: provenance.estimationConfidence,
    estimation_reason: provenance.estimationReason,
    estimated_from: provenance.estimatedFrom,
    idempotency_key: idempotencyKey,
  }

  const { data, error } = input.finalizeActionId
    ? // service-role only RPC; userId is the session-derived identity from the calling route
        await createSupabaseAdminClient().rpc("finalize_food_log_action", { p_action_id: input.finalizeActionId, p_user_id: userId, p_row: row })
    : await supabase.from("food_logs").insert(row).select(FOOD_LOG_SELECT).single()

  if (error?.code === "23505") {
    const existing = await loadFoodLogByIdempotencyKey(supabase, userId, idempotencyKey)
    if (existing) return { success: true, data: existing }
  }

  if (error || !data) {
    if (error) console.error("[FOOD LOG] createFoodLog failed:", error.message)
    return { success: false, error: "Nutrition data couldn't be saved. Please try again.", status: 500 }
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

async function loadFoodLogByIdempotencyKey(
  supabase: SupabaseClient,
  userId: string,
  idempotencyKey: string,
): Promise<ReturnType<typeof mapFoodLogRow> | null> {
  const { data } = await supabase
    .from("food_logs")
    .select(FOOD_LOG_SELECT)
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle()

  return data ? mapFoodLogRow(data as FoodLogRow) : null
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
    .select(FOOD_LOG_SELECT)
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
