import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { UserFoodServing } from "@/lib/nutrition/food-log/types"

type UserFoodServingRow = {
  id: string
  food_identity: string
  food_name: string
  serving_name: string
  serving_grams: number
}

function mapRow(row: UserFoodServingRow): UserFoodServing {
  return {
    id: row.id,
    foodIdentity: row.food_identity,
    foodName: row.food_name,
    servingName: row.serving_name,
    servingGrams: Number(row.serving_grams),
  }
}

/** All serving presets this user has ever saved for one specific food (spec: "USER-SAVED SERVINGS"). */
export async function loadServingsForFood(
  supabase: SupabaseClient,
  userId: string,
  foodIdentity: string,
): Promise<UserFoodServing[]> {
  const { data, error } = await supabase
    .from("user_food_servings")
    .select("id, food_identity, food_name, serving_name, serving_grams")
    .eq("user_id", userId)
    .eq("food_identity", foodIdentity)
    .order("created_at", { ascending: true })

  if (error) {
    console.warn("[USER FOOD SERVINGS] load failed:", error.message)
    return []
  }

  return ((data as UserFoodServingRow[] | null) ?? []).map(mapRow)
}

export type SaveServingInput = {
  foodIdentity: string
  foodName: string
  servingName: string
  servingGrams: number
}

/**
 * Saves (or updates, if the same name already exists for this food) a
 * personal serving definition — "1 scoop = 30 g". Never touches any
 * database food record; this is entirely user-specific (spec: "Do
 * NOT globally overwrite database food serving values").
 */
export async function saveUserFoodServing(
  supabase: SupabaseClient,
  userId: string,
  input: SaveServingInput,
): Promise<{ success: true; data: UserFoodServing } | { success: false; error: string }> {
  if (!input.servingName.trim()) {
    return { success: false, error: "Serving name is required." }
  }

  if (!Number.isFinite(input.servingGrams) || input.servingGrams <= 0) {
    return { success: false, error: "Serving size must be a positive number of grams." }
  }

  const { data, error } = await supabase
    .from("user_food_servings")
    .upsert(
      {
        user_id: userId,
        food_identity: input.foodIdentity,
        food_name: input.foodName,
        serving_name: input.servingName.trim(),
        serving_grams: input.servingGrams,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,food_identity,serving_name" },
    )
    .select("id, food_identity, food_name, serving_name, serving_grams")
    .single()

  if (error || !data) {
    return { success: false, error: error?.message ?? "Unable to save this serving." }
  }

  return { success: true, data: mapRow(data as UserFoodServingRow) }
}

export async function deleteUserFoodServing(
  supabase: SupabaseClient,
  userId: string,
  id: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const { error } = await supabase
    .from("user_food_servings")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}
