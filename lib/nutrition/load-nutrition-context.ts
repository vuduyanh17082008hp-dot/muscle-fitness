import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { buildNutritionPlan, type NutritionPlan } from "@/lib/nutrition/plan"

import {
  mapProfileToNutritionInput,
  type RawFitnessProfileRow,
  type RawPreferencesRow,
  type RawProfileRow,
} from "@/lib/nutrition/profile-mapping"

export type NutritionContext = {
  plan: NutritionPlan | null
  estimatedFields: string[]
  missingRequiredFields: string[]
}

const PREFERENCES_COLUMNS_WITH_NUTRITION_INTELLIGENCE = `
  meals_per_day,
  food_preferences,
  excluded_foods,
  allergies,
  training_mode,
  activity_level,
  nutrition_goal_override
`

const PREFERENCES_COLUMNS_FALLBACK = `
  meals_per_day,
  food_preferences,
  excluded_foods,
  allergies
`

/**
 * The nutrition-intelligence columns (training_mode / activity_level /
 * nutrition_goal_override) ship via
 * supabase/migrations/20260910090000_nutrition_intelligence.sql.
 * If that migration has not been applied yet in a given environment,
 * PostgREST rejects the unknown columns. Rather than crashing the
 * dashboard, fall back to the base column set and treat the new
 * fields as unset.
 */
async function loadPreferencesRow(
  supabase: SupabaseClient,
  userId: string,
): Promise<RawPreferencesRow> {
  const primary = await supabase
    .from("user_preferences")
    .select(PREFERENCES_COLUMNS_WITH_NUTRITION_INTELLIGENCE)
    .eq("user_id", userId)
    .maybeSingle()

  if (!primary.error) {
    return primary.data as RawPreferencesRow
  }

  console.warn(
    "[NUTRITION] Falling back to base user_preferences columns:",
    primary.error.message,
  )

  const fallback = await supabase
    .from("user_preferences")
    .select(PREFERENCES_COLUMNS_FALLBACK)
    .eq("user_id", userId)
    .maybeSingle()

  if (fallback.error) {
    console.warn(
      "[NUTRITION] Unable to load user_preferences:",
      fallback.error.message,
    )

    return null
  }

  return fallback.data as RawPreferencesRow
}

export async function loadNutritionContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<NutritionContext> {
  const [profileResponse, fitnessResponse, preferences] = await Promise.all([
    supabase
      .from("profiles")
      .select("gender, date_of_birth")
      .eq("user_id", userId)
      .maybeSingle(),

    supabase
      .from("fitness_profiles")
      .select("height_cm, weight_kg, goal, training_days")
      .eq("user_id", userId)
      .maybeSingle(),

    loadPreferencesRow(supabase, userId),
  ])

  if (profileResponse.error) {
    console.warn(
      "[NUTRITION] Unable to load profile:",
      profileResponse.error.message,
    )
  }

  if (fitnessResponse.error) {
    console.warn(
      "[NUTRITION] Unable to load fitness profile:",
      fitnessResponse.error.message,
    )
  }

  const { input, estimatedFields, missingRequiredFields } =
    mapProfileToNutritionInput({
      profile: (profileResponse.data ?? null) as RawProfileRow,
      fitnessProfile: (fitnessResponse.data ?? null) as RawFitnessProfileRow,
      preferences,
    })

  return {
    plan: input ? buildNutritionPlan(input) : null,
    estimatedFields,
    missingRequiredFields,
  }
}
