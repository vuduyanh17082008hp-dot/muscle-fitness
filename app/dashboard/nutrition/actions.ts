"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"

export type NutritionSettingsActionResult = {
  success: boolean
  message: string
}

const VALID_TRAINING_MODES = new Set([
  "general",
  "strength",
  "running",
  "hybrid",
  "hiit",
  "team_sport",
])

const VALID_ACTIVITY_LEVELS = new Set([
  "sedentary",
  "light",
  "moderate",
  "very_active",
  "super_active",
])

const VALID_GOAL_OVERRIDES = new Set([
  "auto",
  "fat_loss",
  "maintenance",
  "lean_bulk",
])

export async function updateNutritionSettingsAction(
  formData: FormData,
): Promise<NutritionSettingsActionResult> {
  const trainingMode = String(formData.get("trainingMode") ?? "")
  const activityLevel = String(formData.get("activityLevel") ?? "")
  const goalOverride = String(formData.get("goalOverride") ?? "auto")

  if (!VALID_TRAINING_MODES.has(trainingMode)) {
    return { success: false, message: "Please choose a valid training style." }
  }

  if (!VALID_ACTIVITY_LEVELS.has(activityLevel)) {
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

  const { error } = await supabase.from("user_preferences").upsert(
    {
      user_id: user.id,
      training_mode: trainingMode,
      activity_level: activityLevel,
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

  return { success: true, message: "Nutrition settings updated." }
}
