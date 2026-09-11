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
 *
 * VOCABULARY BOUNDARY
 * `public.user_preferences` stores the three nutrition-intelligence
 * override columns using a short, hyphenated vocabulary
 * (`very`, `team-sport`, `fat-loss`, ...) — see
 * supabase/migrations/20260911090000_nutrition_preference_overrides.sql.
 * The nutrition engine (`lib/nutrition/plan.ts`) uses a more
 * descriptive internal vocabulary (`very_active`, `team_sport`,
 * `fat_loss`, ...). This file is the ONLY place that translates
 * between the two, so the database schema and the engine can evolve
 * independently.
 *
 * FALLBACK PRIORITY (per field)
 *   1. Explicit saved user override (`*_override` column)
 *   2. Signal already present in the fitness profile / onboarding data
 *   3. Safe, clearly-flagged default
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
   DATABASE VOCABULARY
========================================================= */

export type DbActivityLevelOverride =
  | "sedentary"
  | "light"
  | "moderate"
  | "very"
  | "super"

export type DbTrainingModeOverride =
  | "general"
  | "strength"
  | "running"
  | "hybrid"
  | "hiit"
  | "team-sport"

export type DbNutritionGoalOverride = "fat-loss" | "maintenance" | "lean-bulk"

export const DB_ACTIVITY_LEVEL_OVERRIDE_LABELS: Record<
  DbActivityLevelOverride,
  string
> = {
  sedentary: "Sedentary",
  light: "Lightly Active",
  moderate: "Moderately Active",
  very: "Very Active",
  super: "Super Active",
}

export const DB_TRAINING_MODE_OVERRIDE_LABELS: Record<
  DbTrainingModeOverride,
  string
> = {
  general: "General Fitness",
  strength: "Strength / Bodybuilding",
  running: "Running / Endurance",
  hybrid: "Hybrid — Strength + Endurance",
  hiit: "HIIT / Functional",
  "team-sport": "Team Sport",
}

export const DB_NUTRITION_GOAL_OVERRIDE_LABELS: Record<
  DbNutritionGoalOverride,
  string
> = {
  "fat-loss": "Fat Loss",
  maintenance: "Maintenance",
  "lean-bulk": "Lean Bulk",
}

function isDbActivityLevelOverride(
  value: string | null | undefined,
): value is DbActivityLevelOverride {
  return (
    value === "sedentary" ||
    value === "light" ||
    value === "moderate" ||
    value === "very" ||
    value === "super"
  )
}

function isDbTrainingModeOverride(
  value: string | null | undefined,
): value is DbTrainingModeOverride {
  return (
    value === "general" ||
    value === "strength" ||
    value === "running" ||
    value === "hybrid" ||
    value === "hiit" ||
    value === "team-sport"
  )
}

function isDbNutritionGoalOverride(
  value: string | null | undefined,
): value is DbNutritionGoalOverride {
  return value === "fat-loss" || value === "maintenance" || value === "lean-bulk"
}

/** Database (short/hyphenated) vocabulary → engine vocabulary. */
export function dbActivityOverrideToEngine(
  value: DbActivityLevelOverride,
): ActivityLevel {
  if (value === "very") return "very_active"
  if (value === "super") return "super_active"
  return value
}

export function dbTrainingModeOverrideToEngine(
  value: DbTrainingModeOverride,
): TrainingMode {
  if (value === "team-sport") return "team_sport"
  return value
}

export function dbGoalOverrideToEngine(
  value: DbNutritionGoalOverride,
): NutritionGoal {
  if (value === "fat-loss") return "fat_loss"
  if (value === "lean-bulk") return "lean_bulk"
  return "maintenance"
}

/** Engine vocabulary → database (short/hyphenated) vocabulary. */
export function engineActivityToDbOverride(
  value: ActivityLevel,
): DbActivityLevelOverride {
  if (value === "very_active") return "very"
  if (value === "super_active") return "super"
  return value
}

export function engineTrainingModeToDbOverride(
  value: TrainingMode,
): DbTrainingModeOverride {
  if (value === "team_sport") return "team-sport"
  return value
}

export function engineGoalToDbOverride(
  value: NutritionGoal,
): DbNutritionGoalOverride {
  if (value === "fat_loss") return "fat-loss"
  if (value === "lean_bulk") return "lean-bulk"
  return "maintenance"
}

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
  priority_muscles?: string[] | null
} | null

export type RawPreferencesRow = {
  meals_per_day?: number | null
  food_preferences?: string[] | null
  excluded_foods?: string[] | null
  allergies?: string[] | null
  activity_level_override?: string | null
  training_mode_override?: string | null
  nutrition_goal_override?: string | null
  weekly_food_budget?: number | string | null
  cooking_ability?: string | null
  meal_prep_frequency?: string | null
} | null

export type NutritionMappingResult = {
  input: NutritionInput | null
  /** Fields that were unavailable and had to fall back to a default. */
  estimatedFields: string[]
  /** Fields that are missing and block plan generation entirely. */
  missingRequiredFields: string[]
  /**
   * The raw, explicit user overrides actually found in
   * user_preferences (database vocabulary), or null when the user
   * has not set that override yet. Useful for rendering form
   * defaults that reflect exactly what is saved — e.g. the goal
   * selector should show "Use onboarding goal" (not a specific
   * goal) when `overrides.goal` is null.
   */
  overrides: {
    activityLevel: DbActivityLevelOverride | null
    trainingMode: DbTrainingModeOverride | null
    goal: DbNutritionGoalOverride | null
  }
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

/**
 * Fallback used only when the user has not explicitly chosen an
 * activity level. This is a heuristic, not a claim of accuracy —
 * training days alone under-describes real-world activity, so the
 * UI always lets the user override it.
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

/**
 * Fallback used only when the user has not explicitly chosen a
 * training mode. The onboarding schema has no dedicated "sport"
 * field, so this can only ever confidently infer "strength" (from
 * a bodybuilding-oriented goal or from having set priority muscle
 * groups, which is a resistance-training-only onboarding concept).
 * There is no reliable signal for running/hybrid/hiit/team sport in
 * the current schema, so those always require an explicit choice.
 */
function inferTrainingModeFromFitnessProfile(fitnessProfile: {
  goal?: string | null
  priorityMuscles?: string[] | null
}): TrainingMode {
  if (
    fitnessProfile.goal === "muscle_gain" ||
    fitnessProfile.goal === "lean_bulk"
  ) {
    return "strength"
  }

  if ((fitnessProfile.priorityMuscles ?? []).length > 0) {
    return "strength"
  }

  return "general"
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
    return {
      input: null,
      estimatedFields,
      missingRequiredFields,
      overrides: { activityLevel: null, trainingMode: null, goal: null },
    }
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

  /* -------------------------------------------------------
     ACTIVITY LEVEL
     1. explicit override
     2. inferred from training days
  ------------------------------------------------------- */

  const activityOverride = isDbActivityLevelOverride(
    rows.preferences?.activity_level_override,
  )
    ? rows.preferences?.activity_level_override
    : null

  const activityLevel = activityOverride
    ? dbActivityOverrideToEngine(activityOverride)
    : inferActivityLevelFromTrainingDays(trainingDays)

  if (!activityOverride) {
    estimatedFields.push("activity level (estimated from training days)")
  }

  /* -------------------------------------------------------
     TRAINING MODE
     1. explicit override
     2. inferred from fitness profile (strength-only signal)
     3. general
  ------------------------------------------------------- */

  const trainingModeOverride = isDbTrainingModeOverride(
    rows.preferences?.training_mode_override,
  )
    ? rows.preferences?.training_mode_override
    : null

  const inferredTrainingMode = inferTrainingModeFromFitnessProfile({
    goal: rows.fitnessProfile?.goal,
    priorityMuscles: rows.fitnessProfile?.priority_muscles,
  })

  const trainingMode = trainingModeOverride
    ? dbTrainingModeOverrideToEngine(trainingModeOverride)
    : inferredTrainingMode

  if (!trainingModeOverride) {
    estimatedFields.push(
      inferredTrainingMode === "general"
        ? "training style (defaulted to General Fitness)"
        : "training style (inferred from your fitness profile)",
    )
  }

  /* -------------------------------------------------------
     GOAL
     1. explicit override
     2. mapped from onboarding goal
  ------------------------------------------------------- */

  const goalOverride = isDbNutritionGoalOverride(
    rows.preferences?.nutrition_goal_override,
  )
    ? rows.preferences?.nutrition_goal_override
    : null

  const goal = goalOverride
    ? dbGoalOverrideToEngine(goalOverride)
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

  return {
    input,
    estimatedFields,
    missingRequiredFields,
    overrides: {
      activityLevel: activityOverride,
      trainingMode: trainingModeOverride,
      goal: goalOverride,
    },
  }
}
