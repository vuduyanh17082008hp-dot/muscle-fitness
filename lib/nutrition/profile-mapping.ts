/**
 * Maps the real, already-existing `profiles` / `fitness_profiles` /
 * `user_preferences` rows into a `NutritionInput` for the adaptive
 * nutrition engine (`lib/nutrition/plan.ts`).
 *
 * This is the ONLY place that turns raw profile data into engine
 * input. Every page that needs a nutrition plan (Dashboard Overview,
 * the Nutrition Plan page, Dante) should go through
 * `mapProfileToNutritionInput()` so they stay in sync by construction
 * instead of by convention.
 *
 * Nothing here fabricates data: if height, weight or age cannot be
 * determined from the stored profile, `input` is `null` and the
 * caller is expected to render a "complete your profile" state.
 */

import { calculateAge } from "@/features/onboarding/calculations"

import type {
  ActivityLevel,
  NutritionGoal,
  NutritionInput,
  Sex,
  TrainingMode,
} from "@/lib/nutrition/plan"

/* =========================================================
   RAW ROW SHAPES
   (Loosely typed on purpose — the Supabase client used across
   this codebase is not bound to the generated Database type for
   these tables, matching the existing convention in
   app/dashboard/page.tsx and lib/auth/current-account.ts.)
========================================================= */

export type RawProfileRow = {
  gender?: string | null
  date_of_birth?: string | null
} | null

export type RawFitnessProfileRow = {
  height_cm?: number | string | null
  weight_kg?: number | string | null
  goal?: string | null
  training_days?: number | null
} | null

export type RawPreferencesRow = {
  meals_per_day?: number | null
  food_preferences?: string[] | null
  excluded_foods?: string[] | null
  allergies?: string[] | null
  training_mode?: string | null
  activity_level?: string | null
  nutrition_goal_override?: string | null
} | null

export type NutritionMappingResult = {
  input: NutritionInput | null
  /** Fields that were unavailable and had to fall back to a default. */
  estimatedFields: string[]
  /** Fields that are missing and block plan generation entirely. */
  missingRequiredFields: string[]
}

/* =========================================================
   HELPERS
========================================================= */

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") {
    return null
  }

  const parsed = typeof value === "number" ? value : Number.parseFloat(value)

  return Number.isFinite(parsed) ? parsed : null
}

function mapSex(gender: string | null | undefined): Sex {
  if (gender === "male") return "male"
  if (gender === "female") return "female"
  return "unspecified"
}

/**
 * The onboarding wizard uses a 6-value goal enum. The nutrition
 * engine works with the 3 goals described in the product spec
 * (Fat Loss / Maintenance / Lean Bulk). This collapses the wider
 * enum down, matching the closest nutritional intent.
 */
function mapOnboardingGoalToNutritionGoal(
  goal: string | null | undefined,
): NutritionGoal {
  switch (goal) {
    case "fat_loss":
      return "fat_loss"
    case "lean_bulk":
    case "muscle_gain":
      return "lean_bulk"
    case "maintenance":
    case "body_recomposition":
    case "performance":
    default:
      return "maintenance"
  }
}

function isNutritionGoal(value: string | null | undefined): value is NutritionGoal {
  return value === "fat_loss" || value === "maintenance" || value === "lean_bulk"
}

function isTrainingMode(value: string | null | undefined): value is TrainingMode {
  return (
    value === "general" ||
    value === "strength" ||
    value === "running" ||
    value === "hybrid" ||
    value === "hiit" ||
    value === "team_sport"
  )
}

function isActivityLevel(value: string | null | undefined): value is ActivityLevel {
  return (
    value === "sedentary" ||
    value === "light" ||
    value === "moderate" ||
    value === "very_active" ||
    value === "super_active"
  )
}

/**
 * Fallback used only when the user has not explicitly chosen an
 * activity level. This is a heuristic, not a claim of accuracy —
 * training days alone under-describes real-world activity (see
 * PART 11 of the nutrition planning brief), so the UI always lets
 * the user override it.
 */
function inferActivityLevelFromTrainingDays(
  trainingDays: number | null,
): ActivityLevel {
  const days = trainingDays ?? 3

  if (days >= 6) return "very_active"
  if (days >= 4) return "moderate"
  if (days >= 2) return "light"
  return "sedentary"
}

/* =========================================================
   MAPPING
========================================================= */

export function mapProfileToNutritionInput(rows: {
  profile: RawProfileRow
  fitnessProfile: RawFitnessProfileRow
  preferences: RawPreferencesRow
}): NutritionMappingResult {
  const missingRequiredFields: string[] = []
  const estimatedFields: string[] = []

  const heightCm = toNumber(rows.fitnessProfile?.height_cm)
  const weightKg = toNumber(rows.fitnessProfile?.weight_kg)

  if (heightCm === null) missingRequiredFields.push("height")
  if (weightKg === null) missingRequiredFields.push("weight")

  const dateOfBirth = rows.profile?.date_of_birth ?? null
  if (!dateOfBirth) {
    missingRequiredFields.push("date of birth")
  }

  if (missingRequiredFields.length > 0) {
    return { input: null, estimatedFields, missingRequiredFields }
  }

  const age = calculateAge(dateOfBirth as string)
  const sex = mapSex(rows.profile?.gender)

  if (!rows.profile?.gender) {
    estimatedFields.push("sex (not set — BMR uses a neutral estimate)")
  }

  const trainingDays = rows.fitnessProfile?.training_days ?? null

  if (trainingDays === null) {
    estimatedFields.push("training days per week (defaulted to 3)")
  }

  const activityLevel = isActivityLevel(rows.preferences?.activity_level)
    ? rows.preferences?.activity_level
    : inferActivityLevelFromTrainingDays(trainingDays)

  if (!isActivityLevel(rows.preferences?.activity_level)) {
    estimatedFields.push("activity level (estimated from training days)")
  }

  const trainingMode = isTrainingMode(rows.preferences?.training_mode)
    ? rows.preferences?.training_mode
    : "general"

  if (!isTrainingMode(rows.preferences?.training_mode)) {
    estimatedFields.push("training style (defaulted to General Fitness)")
  }

  const goal = isNutritionGoal(rows.preferences?.nutrition_goal_override)
    ? rows.preferences?.nutrition_goal_override
    : mapOnboardingGoalToNutritionGoal(rows.fitnessProfile?.goal)

  const mealsPerDay = rows.preferences?.meals_per_day ?? 4

  if (!rows.preferences?.meals_per_day) {
    estimatedFields.push("meals per day (defaulted to 4)")
  }

  const input: NutritionInput = {
    sex,
    age,
    heightCm: heightCm as number,
    weightKg: weightKg as number,
    activityLevel,
    trainingMode,
    goal,
    trainingDaysPerWeek: trainingDays ?? 3,
    mealsPerDay,
    foodPreferences: rows.preferences?.food_preferences ?? [],
    excludedFoods: rows.preferences?.excluded_foods ?? [],
    allergies: rows.preferences?.allergies ?? [],
  }

  return { input, estimatedFields, missingRequiredFields }
}
