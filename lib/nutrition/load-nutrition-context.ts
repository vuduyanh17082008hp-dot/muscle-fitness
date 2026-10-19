import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { buildNutritionPlan, type NutritionPlan } from "@/lib/nutrition/plan"
import { loadDisclosedAllergens } from "@/lib/nutrition/coach/disclosed-allergens"
import {
  getCanonicalNutritionTargets,
  type CanonicalNutritionTargets,
  type StoredNutritionTargetRow,
} from "@/lib/nutrition/targets"

import {
  mapProfileToNutritionInput,
  type DbActivityLevelOverride,
  type DbNutritionGoalOverride,
  type DbTrainingModeOverride,
  type RawFitnessProfileRow,
  type RawPreferencesRow,
  type RawProfileRow,
} from "@/lib/nutrition/profile-mapping"
import { classifyQueryError } from "@/lib/supabase/query-error"

export type NutritionContext = {
  plan: NutritionPlan | null
  /**
   * The canonical daily targets (lib/nutrition/targets.ts). Read targets
   * from here — never from `fitness_profiles` columns directly.
   */
  targets: CanonicalNutritionTargets
  fitnessGoal: string | null
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
  /**
   * Sources whose read FAILED (auth / RLS / network / schema), as opposed to
   * rows that do not exist. A failed preferences read means allergies are
   * unknown, not empty: a coach must not plan food from that.
   */
  unavailable?: Array<"profile" | "fitness_profile" | "preferences">
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
): Promise<{ row: RawPreferencesRow; failed: boolean }> {
  const primary = await supabase
    .from("user_preferences")
    .select(PREFERENCES_COLUMNS_WITH_NUTRITION_INTELLIGENCE)
    .eq("user_id", userId)
    .maybeSingle()

  if (!primary.error) {
    return { row: primary.data as RawPreferencesRow, failed: false }
  }

  // Only a missing column justifies the base-column retry. An auth,
  // RLS or transport failure would fail the retry the same way.
  const disposition = classifyQueryError(primary.error, primary.status)
  if (disposition !== "SCHEMA_MISMATCH") {
    console.warn("[NUTRITION] Unable to load user_preferences:", disposition)
    return { row: null, failed: true }
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

    return { row: null, failed: true }
  }

  return { row: fallback.data as RawPreferencesRow, failed: false }
}

export async function loadNutritionContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<NutritionContext> {
  const [profileResponse, fitnessResponse, preferencesRead, disclosedAllergens] = await Promise.all([
    supabase
      .from("profiles")
      .select("gender, date_of_birth")
      .eq("user_id", userId)
      .maybeSingle(),

    supabase
      .from("fitness_profiles")
      // "*" so the stored target columns (including the legacy duplicates)
      // are read without failing on an environment that lacks one of them.
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),

    loadPreferencesRow(supabase, userId),
    // Allergies the user disclosed in a coach chat count like stored ones on every surface built from this context.
    loadDisclosedAllergens(supabase, userId, new Date()),
  ])
  const preferences = preferencesRead.row

  if (profileResponse.error) {
    console.warn(
      "[NUTRITION] Unable to load profile:",
      classifyQueryError(profileResponse.error, profileResponse.status),
    )
  }

  if (fitnessResponse.error) {
    console.warn(
      "[NUTRITION] Unable to load fitness profile:",
      classifyQueryError(fitnessResponse.error, fitnessResponse.status),
    )
  }

  const mapped =
    mapProfileToNutritionInput({
      profile: (profileResponse.data ?? null) as RawProfileRow,
      fitnessProfile: (fitnessResponse.data ?? null) as RawFitnessProfileRow,
      preferences,
    })
  const { estimatedFields, missingRequiredFields, overrides } = mapped
  const input = mapped.input && disclosedAllergens?.length
    ? { ...mapped.input, allergies: [...new Set([...mapped.input.allergies, ...disclosedAllergens])] }
    : mapped.input
  const fitnessProfile = (fitnessResponse.data ?? null) as RawFitnessProfileRow

  const rawBudget = preferences?.weekly_food_budget
  const weeklyFoodBudgetSgd =
    rawBudget === null || rawBudget === undefined || rawBudget === ""
      ? null
      : Number(rawBudget)

  const plan = input ? buildNutritionPlan(input) : null
  const targets = getCanonicalNutritionTargets({
    planTarget: plan?.target ?? null,
    stored: (fitnessResponse.data ?? null) as StoredNutritionTargetRow,
  })

  for (const diagnostic of targets.diagnostics) {
    // Column-vs-column disagreement is a data defect worth a log line.
    // PLAN_STORED_MISMATCH is expected drift (the plan follows the live
    // profile), so it stays in `targets.diagnostics` only.
    if (diagnostic.startsWith("STORED_COLUMN_CONFLICT")) {
      console.warn("[NUTRITION] target conflict:", diagnostic)
    }
  }

  return {
    plan,
    targets,
    fitnessGoal: fitnessProfile?.goal ?? null,
    estimatedFields,
    missingRequiredFields,
    overrides,
    weeklyFoodBudgetSgd:
      weeklyFoodBudgetSgd !== null && Number.isFinite(weeklyFoodBudgetSgd)
        ? weeklyFoodBudgetSgd
        : null,
    cookingAbility: preferences?.cooking_ability ?? null,
    mealPrepFrequency: preferences?.meal_prep_frequency ?? null,
    unavailable: [
      ...(profileResponse.error ? (["profile"] as const) : []),
      ...(fitnessResponse.error ? (["fitness_profile"] as const) : []),
      // Disclosed allergies unreadable = allergies unknown, exactly like a failed preferences read.
      ...(preferencesRead.failed || disclosedAllergens === null ? (["preferences"] as const) : []),
    ],
  }
}
