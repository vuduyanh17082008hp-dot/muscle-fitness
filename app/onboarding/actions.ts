"use server"

import { revalidatePath } from "next/cache"

import { calculateNutritionTargets } from "@/features/onboarding/calculations"

import {
  onboardingSchema,
  type OnboardingData,
} from "@/features/onboarding/schema"

import type { Json } from "@/lib/database/types"
import { createClient } from "@/lib/supabase/server"

export type OnboardingInput = OnboardingData

export type OnboardingActionResult = {
  success: boolean
  message: string
}

export type SaveOnboardingDraftInput = {
  currentStep: number
  data: OnboardingData
}

type DatabaseErrorLike = {
  code?: string
  message?: string
  details?: string
  hint?: string
}

function convertToJson(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value),
  ) as Json
}

function getDatabaseErrorMessage(
  error: DatabaseErrorLike,
  fallback: string,
): string {
  const errorMessage = error.message ?? ""

  const isMissingDatabaseObject =
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    errorMessage
      .toLowerCase()
      .includes("schema cache") ||
    errorMessage
      .toLowerCase()
      .includes("could not find the table") ||
    errorMessage
      .toLowerCase()
      .includes("relation") &&
      errorMessage
        .toLowerCase()
        .includes("does not exist")

  if (isMissingDatabaseObject) {
    return [
      "The Muscle Fitness database has not been installed completely.",
      "Run the complete onboarding SQL migration in the Supabase SQL Editor,",
      "then refresh this page.",
    ].join(" ")
  }

  const details = [
    error.message,
    error.details,
    error.hint,
  ]
    .filter(
      (value): value is string =>
        typeof value === "string" &&
        value.trim().length > 0,
    )
    .join(" ")

  return details
    ? `${fallback}: ${details}`
    : fallback
}

async function getAuthenticatedContext() {
  const supabase = await createClient()

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  return {
    supabase,
    user: error ? null : user,
  }
}

export async function saveOnboardingDraftAction(
  input: SaveOnboardingDraftInput,
): Promise<OnboardingActionResult> {
  const { supabase, user } =
    await getAuthenticatedContext()

  if (!user) {
    return {
      success: false,
      message:
        "Your session has expired. Please sign in again.",
    }
  }

  const currentStep = Math.min(
    Math.max(
      Math.trunc(input.currentStep),
      0,
    ),
    5,
  )

  const { error } = await supabase
    .from("onboarding_drafts")
    .upsert(
      {
        user_id: user.id,
        current_step: currentStep,
        data: convertToJson(input.data),
      },
      {
        onConflict: "user_id",
      },
    )

  if (error) {
    return {
      success: false,
      message: getDatabaseErrorMessage(
        error,
        "Unable to save onboarding draft",
      ),
    }
  }

  return {
    success: true,
    message: "Draft saved.",
  }
}

export async function completeOnboardingAction(
  input: OnboardingInput,
): Promise<OnboardingActionResult> {
  const validation =
    onboardingSchema.safeParse(input)

  if (!validation.success) {
    return {
      success: false,
      message:
        validation.error.issues[0]
          ?.message ??
        "Please review your onboarding information.",
    }
  }

  const values = validation.data

  const { supabase, user } =
    await getAuthenticatedContext()

  if (!user) {
    return {
      success: false,
      message:
        "Your session has expired. Please sign in again.",
    }
  }

  const targets =
    calculateNutritionTargets(values)

  const { error: profileError } =
    await supabase
      .from("profiles")
      .upsert(
        {
          user_id: user.id,
          full_name:
            values.personal.fullName,
          date_of_birth:
            values.personal.dateOfBirth,
          gender:
            values.personal.gender,
          timezone:
            values.personal.timezone,
          onboarding_completed: true,
        },
        {
          onConflict: "user_id",
        },
      )

  if (profileError) {
    return {
      success: false,
      message: getDatabaseErrorMessage(
        profileError,
        "Unable to save personal information",
      ),
    }
  }

  const { error: fitnessError } =
    await supabase
      .from("fitness_profiles")
      .upsert(
        {
          user_id: user.id,

          height_cm:
            values.personal.heightCm,

          weight_kg:
            values.personal.weightKg,

          goal:
            values.goal.goal,

          experience:
            values.training.experience,

          training_days:
            values.training.trainingDays,

          session_duration_minutes:
            values.training
              .sessionDurationMinutes,

          training_location:
            values.training
              .trainingLocation,

          available_equipment:
            values.training
              .availableEquipment,

          priority_muscles:
            values.training
              .priorityMuscles,

          physical_limitations:
            values.training
              .physicalLimitations
              .trim() || null,

          calories_target:
            targets.calories,

          protein_target_g:
            targets.protein,

          carbs_target_g:
            targets.carbohydrates,

          fat_target_g:
            targets.fat,
        },
        {
          onConflict: "user_id",
        },
      )

  if (fitnessError) {
    return {
      success: false,
      message: getDatabaseErrorMessage(
        fitnessError,
        "Unable to save fitness information",
      ),
    }
  }

  const {
    error: preferencesError,
  } = await supabase
    .from("user_preferences")
    .upsert(
      {
        user_id: user.id,

        meals_per_day:
          values.nutrition.mealsPerDay,

        food_preferences:
          values.nutrition
            .foodPreferences,

        excluded_foods:
          values.nutrition
            .excludedFoods,

        allergies:
          values.nutrition.allergies,

        weekly_food_budget:
          values.nutrition
            .weeklyFoodBudget,

        cooking_ability:
          values.nutrition
            .cookingAbility,

        meal_prep_frequency:
          values.nutrition
            .mealPrepFrequency,

        sleep_hours:
          values.lifestyle.sleepHours,

        daily_steps:
          values.lifestyle.dailySteps,

        work_schedule:
          values.lifestyle.workSchedule,

        stress_level:
          values.lifestyle.stressLevel,

        preferred_training_time:
          values.lifestyle
            .preferredTrainingTime,
      },
      {
        onConflict: "user_id",
      },
    )

  if (preferencesError) {
    return {
      success: false,
      message: getDatabaseErrorMessage(
        preferencesError,
        "Unable to save nutrition and lifestyle information",
      ),
    }
  }

  await supabase
    .from("onboarding_drafts")
    .delete()
    .eq("user_id", user.id)

  revalidatePath("/onboarding")
  revalidatePath("/dashboard")

  return {
    success: true,
    message:
      "Onboarding completed successfully.",
  }
}

/**
 * Alias tương thích với code cũ.
 */
export const saveOnboardingDraft =
  saveOnboardingDraftAction

export const completeOnboarding =
  completeOnboardingAction