import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { buildNutritionPlan, type NutritionPlan } from "@/lib/nutrition/plan"

import {
  mapProfileToNutritionInput,
  type DbActivityLevelOverride,
  type DbNutritionGoalOverride,
  type DbTrainingModeOverride,
  type RawFitnessProfileRow,
  type RawPreferencesRow,
  type RawProfileRow,
} from "@/lib/nutrition/profile-mapping"

export type NutritionContext = {
  plan: NutritionPlan | null
  estimatedFields: string[]
  missingRequiredFields: string[]
  overrides: {
    activityLevel: DbActivityLevelOverride | null
    trainingMode: DbTrainingModeOverride | null
    goal: DbNutritionGoalOverride | null
  }
  /** From user_preferences.weekly_food_budget — null when never set. */
  weeklyFoodBudgetSgd: number | null
  cookingAbility: string | null
  mealPrepFrequency: string | null
}

const PREFERENCES_COLUMNS_WITH_NUTRITION_INTELLIGENCE = `
  meals_per_day,
  food_preferences,
  excluded_foods,
  allergies,
  activity_level_override,
  training_mode_override,
  nutrition_goal_override,
  weekly_food_budget,
  cooking_ability,
  meal_prep_frequency
`

const PREFERENCES_COLUMNS_FALLBACK = `
  meals_per_day,
  food_preferences,
  excluded_foods,
  allergies,
  weekly_food_budget,
  cooking_ability,
  meal_prep_frequency
`

/**
 * The nutrition-intelligence override columns (activity_level_override /
 * training_mode_override / nutrition_goal_override) ship via
 * supabase/migrations/20260911090000_nutrition_preference_overrides.sql.
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
      .select("height_cm, weight_kg, goal, training_days, priority_muscles")
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

  const { input, estimatedFields, missingRequiredFields, overrides } =
    mapProfileToNutritionInput({
      profile: (profileResponse.data ?? null) as RawProfileRow,
      fitnessProfile: (fitnessResponse.data ?? null) as RawFitnessProfileRow,
      preferences,
    })

  const rawBudget = preferences?.weekly_food_budget
  const weeklyFoodBudgetSgd =
    rawBudget === null || rawBudget === undefined || rawBudget === ""
      ? null
      : Number(rawBudget)

  return {
    plan: input ? buildNutritionPlan(input) : null,
    estimatedFields,
    missingRequiredFields,
    overrides,
    weeklyFoodBudgetSgd:
      weeklyFoodBudgetSgd !== null && Number.isFinite(weeklyFoodBudgetSgd)
        ? weeklyFoodBudgetSgd
        : null,
    cookingAbility: preferences?.cooking_ability ?? null,
    mealPrepFrequency: preferences?.meal_prep_frequency ?? null,
  }
}
