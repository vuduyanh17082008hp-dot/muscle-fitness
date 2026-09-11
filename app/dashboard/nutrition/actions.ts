"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"

export type NutritionSettingsActionResult = {
  success: boolean
  message: string
}

/*
 * These sets intentionally mirror the CHECK constraints in
 * supabase/migrations/20260911090000_nutrition_preference_overrides.sql
 * exactly. If the allowed values ever change, update both places.
 */

const VALID_TRAINING_MODE_OVERRIDES = new Set([
  "general",
  "strength",
  "running",
  "hybrid",
  "hiit",
  "team-sport",
])

const VALID_ACTIVITY_LEVEL_OVERRIDES = new Set([
  "sedentary",
  "light",
  "moderate",
  "very",
  "super",
])

const VALID_GOAL_OVERRIDES = new Set([
  "auto",
  "fat-loss",
  "maintenance",
  "lean-bulk",
])

export async function updateNutritionSettingsAction(
  formData: FormData,
): Promise<NutritionSettingsActionResult> {
  const trainingModeOverride = String(formData.get("trainingModeOverride") ?? "")
  const activityLevelOverride = String(formData.get("activityLevelOverride") ?? "")
  const goalOverride = String(formData.get("goalOverride") ?? "auto")

  if (!VALID_TRAINING_MODE_OVERRIDES.has(trainingModeOverride)) {
    return { success: false, message: "Please choose a valid training style." }
  }

  if (!VALID_ACTIVITY_LEVEL_OVERRIDES.has(activityLevelOverride)) {
    return { success: false, message: "Please choose a valid activity level." }
  }

  if (!VALID_GOAL_OVERRIDES.has(goalOverride)) {
    return { success: false, message: "Please choose a valid goal." }
  }

  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      success: false,
      message: "Your session has expired. Please sign in again.",
    }
  }

  /*
   * user_preferences.user_id is the table's primary key (see
   * supabase/migrations/20260802110000_database_foundation.sql), so
   * this upsert safely creates the row on first save and updates it
   * on every save after that — no separate "does a row exist" check
   * is needed, and it stays RLS-compatible because we always write
   * the authenticated user's own id.
   */
  const { error } = await supabase.from("user_preferences").upsert(
    {
      user_id: user.id,
      training_mode_override: trainingModeOverride,
      activity_level_override: activityLevelOverride,
      nutrition_goal_override: goalOverride === "auto" ? null : goalOverride,
    },
    { onConflict: "user_id" },
  )

  if (error) {
    return {
      success: false,
      message: `Unable to save nutrition settings: ${error.message}`,
    }
  }

  revalidatePath("/dashboard/nutrition")
  revalidatePath("/dashboard")

  return { success: true, message: "Nutrition plan updated." }
}

/* =========================================================
   BUDGET-AWARE NUTRITION PLANNER
========================================================= */

export async function updateWeeklyFoodBudgetAction(
  formData: FormData,
): Promise<NutritionSettingsActionResult> {
  const rawBudget = String(formData.get("weeklyFoodBudget") ?? "")
  const budget = rawBudget === "" ? null : Number(rawBudget)

  if (budget !== null && (!Number.isFinite(budget) || budget < 0 || budget > 1_000_000)) {
    return { success: false, message: "Please enter a valid weekly budget." }
  }

  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      success: false,
      message: "Your session has expired. Please sign in again.",
    }
  }

  const { error } = await supabase.from("user_preferences").upsert(
    {
      user_id: user.id,
      weekly_food_budget: budget,
    },
    { onConflict: "user_id" },
  )

  if (error) {
    return {
      success: false,
      message: `Unable to save your weekly budget: ${error.message}`,
    }
  }

  revalidatePath("/dashboard/nutrition")
  revalidatePath("/dashboard/nutrition/shopping-list")

  return { success: true, message: "Weekly food budget updated." }
}
