import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { computeFoodIdentity } from "@/lib/nutrition/food-identity"
import type { FoodLogSource } from "./types"

/** Applies the correct filter to find prior logs of the SAME food, using the strongest identifier available. */
function applyIdentityFilter<T extends { eq: (column: string, value: string) => T }>(
  query: T,
  foodIdentity: string,
): T {
  if (foodIdentity.startsWith("barcode:")) {
    return query.eq("barcode", foodIdentity.slice("barcode:".length))
  }

  const separatorIndex = foodIdentity.indexOf(":")
  const source = foodIdentity.slice(0, separatorIndex)
  const sourceId = foodIdentity.slice(separatorIndex + 1)

  return query.eq("source", source).eq("source_id", sourceId)
}

export type LastPortion = {
  quantityGrams: number
  servingName: string | null
  servingsConsumed: number | null
  loggedAt: string
}

/** The most recently logged portion for this exact food (spec: "REMEMBER LAST PORTION"). */
export async function loadLastPortionForFood(
  supabase: SupabaseClient,
  userId: string,
  foodIdentity: string,
): Promise<LastPortion | null> {
  const base = supabase
    .from("food_logs")
    .select("quantity_grams, serving_name, servings_consumed, created_at")
    .eq("user_id", userId)

  const { data, error } = await applyIdentityFilter(base, foodIdentity)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  return {
    quantityGrams: Number(data.quantity_grams),
    servingName: data.serving_name,
    servingsConsumed: data.servings_consumed === null ? null : Number(data.servings_consumed),
    loggedAt: data.created_at,
  }
}

type HistoryRow = {
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
  created_at: string
}

export type FoodHistoryItem = {
  foodIdentity: string | null
  foodName: string
  brand: string | null
  source: FoodLogSource
  sourceId: string | null
  barcode: string | null
  lastQuantityGrams: number
  lastServingName: string | null
  lastServingsConsumed: number | null
  /** The exact macros logged last time, at lastQuantityGrams — the base for deriving a per-100g profile for "Add Again". */
  lastMacros: { calories: number; protein: number; carbs: number; fat: number; fiber: number | null }
  lastIsEstimated: boolean
  lastLoggedAt: string
  timesLogged: number
}

const HISTORY_WINDOW_ROWS = 200

/** One row per distinct food the user has ever logged, most-recent-first, with a use count. Shared source for both Recent and Frequent Foods. */
async function loadDedupedFoodHistory(
  supabase: SupabaseClient,
  userId: string,
): Promise<FoodHistoryItem[]> {
  const { data, error } = await supabase
    .from("food_logs")
    .select(
      "food_name, brand, source, source_id, barcode, quantity_grams, serving_name, servings_consumed, calories, protein_g, carbs_g, fat_g, fiber_g, is_estimated, created_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_WINDOW_ROWS)

  if (error || !data) {
    if (error) console.warn("[FOOD HISTORY] load failed:", error.message)
    return []
  }

  const byIdentity = new Map<string, FoodHistoryItem>()

  for (const row of data as HistoryRow[]) {
    const identity = computeFoodIdentity({ barcode: row.barcode, source: row.source, sourceId: row.source_id })
    const dedupeKey = identity ?? `name:${row.food_name.trim().toLowerCase()}`

    const existing = byIdentity.get(dedupeKey)

    if (existing) {
      existing.timesLogged += 1
      continue
    }

    byIdentity.set(dedupeKey, {
      foodIdentity: identity,
      foodName: row.food_name,
      brand: row.brand,
      source: row.source as FoodLogSource,
      sourceId: row.source_id,
      barcode: row.barcode,
      lastQuantityGrams: Number(row.quantity_grams),
      lastServingName: row.serving_name,
      lastServingsConsumed: row.servings_consumed === null ? null : Number(row.servings_consumed),
      lastMacros: {
        calories: Number(row.calories),
        protein: Number(row.protein_g),
        carbs: Number(row.carbs_g),
        fat: Number(row.fat_g),
        fiber: row.fiber_g === null ? null : Number(row.fiber_g),
      },
      lastIsEstimated: row.is_estimated,
      lastLoggedAt: row.created_at,
      timesLogged: 1,
    })
  }

  // Map preserves insertion order, and rows arrived most-recent-first,
  // so this is already sorted by recency.
  return Array.from(byIdentity.values())
}

/** Distinct foods the user has logged recently, most-recent-first (spec: "RECENT FOODS"). */
export async function loadRecentFoods(
  supabase: SupabaseClient,
  userId: string,
  limit = 8,
): Promise<FoodHistoryItem[]> {
  const history = await loadDedupedFoodHistory(supabase, userId)
  return history.slice(0, limit)
}

/** Distinct foods logged most often, purely from real usage counts — never AI-guessed (spec: "FREQUENT FOODS"). */
export async function loadFrequentFoods(
  supabase: SupabaseClient,
  userId: string,
  limit = 5,
): Promise<FoodHistoryItem[]> {
  const history = await loadDedupedFoodHistory(supabase, userId)

  return [...history]
    .filter((item) => item.timesLogged > 1)
    .sort((a, b) => b.timesLogged - a.timesLogged)
    .slice(0, limit)
}
