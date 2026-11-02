"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { loadCalibrationReview } from "@/lib/nutrition/calibration-data"
import { resolveLocalToday } from "@/lib/nutrition/food-log/load-food-log-context"
import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context"
import { buildNutritionPlan } from "@/lib/nutrition/plan"

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
  revalidatePath("/dashboard/nutrition/plan")
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
  revalidatePath("/dashboard/nutrition/plan")
  revalidatePath("/dashboard/nutrition/shopping-list")

  return { success: true, message: "Weekly food budget updated." }
}

/* =========================================================
   BODYWEIGHT LOG + CALORIE CALIBRATION
   Never changes a target on its own: logging a weight only stores
   the reading; a target changes only through an explicit
   accept / reset, re-verified here against the server's own data.
========================================================= */

function revalidateNutritionSurfaces() {
  revalidatePath("/dashboard/nutrition")
  revalidatePath("/dashboard/nutrition/plan")
  revalidatePath("/dashboard")
}

export async function logBodyWeightAction(
  formData: FormData,
): Promise<NutritionSettingsActionResult> {
  const raw = String(formData.get("weightKg") ?? "").trim().replace(",", ".")
  const weightKg = raw === "" ? NaN : Number(raw)

  // Mirrors body_weight_entries_weight_check (20–500 kg).
  if (!Number.isFinite(weightKg) || weightKg < 20 || weightKg > 500) {
    return { success: false, message: "Enter your weight in kg (20–500)." }
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { success: false, message: "Your session has expired. Please sign in again." }
  }

  // The server decides the date (the user's local today) — never the client.
  const loggedOn = await resolveLocalToday(supabase, user.id)

  const { error } = await supabase.from("body_weight_entries").upsert(
    {
      user_id: user.id,
      logged_on: loggedOn,
      weight_kg: Math.round(weightKg * 100) / 100,
      source: "manual",
    },
    { onConflict: "user_id,logged_on" },
  )

  if (error) {
    return { success: false, message: `Unable to save your weight: ${error.message}` }
  }

  revalidateNutritionSurfaces()
  return { success: true, message: `Saved ${Math.round(weightKg * 10) / 10} kg for ${loggedOn}. Your calorie target is unchanged.` }
}

const CALIBRATION_DECISIONS = new Set(["accept", "keep", "reset"])

export async function reviewCalorieCalibrationAction(
  formData: FormData,
): Promise<NutritionSettingsActionResult> {
  const decision = String(formData.get("decision") ?? "")
  const expectedTarget = Number(formData.get("expectedTargetCalories"))
  const expectedDelta = Number(formData.get("expectedDeltaKcal") ?? 0)

  if (!CALIBRATION_DECISIONS.has(decision) || !Number.isFinite(expectedTarget)) {
    return { success: false, message: "That calibration request isn't valid. Refresh and try again." }
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { success: false, message: "Your session has expired. Please sign in again." }
  }

  const context = await loadNutritionContext(supabase, user.id)
  const plan = context.plan

  if (!plan || !context.calibration.available || context.unavailable?.includes("preferences")) {
    return { success: false, message: "Calibration isn't available right now. Nothing was changed." }
  }

  const stale = { success: false, message: "Your target changed since this page loaded. Refresh and review again — nothing was changed." }
  if (plan.target.calories !== expectedTarget) return stale

  const currentAdjustment = plan.calorieAdjustmentKcal
  let nextAdjustment = currentAdjustment

  if (decision === "accept") {
    const review = await loadCalibrationReview(supabase, user.id, context)
    if (review.result?.status !== "propose" || review.result.deltaKcal !== expectedDelta) return stale
    nextAdjustment = currentAdjustment + review.result.deltaKcal
  } else if (decision === "reset") {
    nextAdjustment = 0
  }

  const patch = {
    calorie_adjustment_kcal: nextAdjustment,
    calorie_calibration_reviewed_at: new Date().toISOString(),
  }

  // One conditional UPDATE: applies only if nobody changed the adjustment in between.
  const updated = await supabase
    .from("user_preferences")
    .update(patch)
    .eq("user_id", user.id)
    .eq("calorie_adjustment_kcal", currentAdjustment)
    .select("user_id")

  if (updated.error) {
    return { success: false, message: `Unable to save: ${updated.error.message}. Nothing was changed.` }
  }

  if ((updated.data ?? []).length === 0) {
    // No preferences row yet (a never-saved user has adjustment 0): create it.
    if (currentAdjustment !== 0) return stale
    const inserted = await supabase.from("user_preferences").insert({ user_id: user.id, ...patch })
    if (inserted.error) return stale
  }

  revalidateNutritionSurfaces()

  const newTarget = buildNutritionPlan({ ...plan.input, calorieAdjustmentKcal: nextAdjustment }).target.calories
  const message =
    decision === "keep"
      ? `Kept your ${newTarget} kcal target. The next review uses weigh-ins from tomorrow on.`
      : decision === "reset"
        ? `Calibration removed — your target is back to the ${newTarget} kcal estimate.`
        : `Target updated to ${newTarget} kcal (${expectedDelta > 0 ? "+" : ""}${expectedDelta} kcal/day). Review the next 1–2 weeks of weigh-ins before changing again.`

  return { success: true, message }
}
