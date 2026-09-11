import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { FoodLogEntry, MealType, FoodLogSource, EstimationConfidence } from "./types"
import { computeDailyTotals } from "./totals"

export type FoodLogRow = {
  id: string
  log_date: string
  meal_type: string
  food_name: string
  brand: string | null
  source: string
  source_id: string | null
  barcode: string | null
  quantity_grams: number
  serving_name: string | null
  servings_consumed: number | null
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number | null
  is_estimated: boolean
  estimation_confidence: string | null
  estimation_reason: string | null
  estimated_from: string | null
  created_at: string
}

export function mapFoodLogRow(row: FoodLogRow): FoodLogEntry {
  return {
    id: row.id,
    logDate: row.log_date,
    mealType: row.meal_type as MealType,
    foodName: row.food_name,
    brand: row.brand,
    source: row.source as FoodLogSource,
    sourceId: row.source_id,
    barcode: row.barcode,
    quantityGrams: Number(row.quantity_grams),
    servingName: row.serving_name,
    servingsConsumed: row.servings_consumed === null ? null : Number(row.servings_consumed),
    calories: Number(row.calories),
    proteinG: Number(row.protein_g),
    carbsG: Number(row.carbs_g),
    fatG: Number(row.fat_g),
    fiberG: row.fiber_g === null ? null : Number(row.fiber_g),
    isEstimated: row.is_estimated,
    estimationConfidence: row.estimation_confidence as EstimationConfidence | null,
    estimationReason: row.estimation_reason,
    estimatedFrom: row.estimated_from,
    createdAt: row.created_at,
  }
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export type FoodLogContext = {
  date: string
  entries: FoodLogEntry[]
  totals: ReturnType<typeof computeDailyTotals>
}

export async function loadFoodLogForDate(
  supabase: SupabaseClient,
  userId: string,
  date: string = todayIso(),
): Promise<FoodLogContext> {
  const { data, error } = await supabase
    .from("food_logs")
    .select(
      "id, log_date, meal_type, food_name, brand, source, source_id, barcode, quantity_grams, serving_name, servings_consumed, calories, protein_g, carbs_g, fat_g, fiber_g, is_estimated, estimation_confidence, estimation_reason, estimated_from, created_at",
    )
    .eq("user_id", userId)
    .eq("log_date", date)
    .order("created_at", { ascending: true })

  if (error) {
    console.warn("[FOOD LOG] Unable to load food_logs:", error.message)
    return { date, entries: [], totals: computeDailyTotals([]) }
  }

  const entries = ((data as FoodLogRow[] | null) ?? []).map(mapFoodLogRow)

  return { date, entries, totals: computeDailyTotals(entries) }
}
