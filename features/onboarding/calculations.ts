import type { OnboardingData } from "@/features/onboarding/schema"

export type NutritionTargets = {
  age: number
  bmr: number
  maintenanceCalories: number
  calories: number
  protein: number
  carbohydrates: number
  fat: number
}

export function calculateAge(
  dateOfBirth: string,
): number {
  if (!dateOfBirth) {
    return 18
  }

  const birthDate = new Date(
    `${dateOfBirth}T00:00:00`,
  )

  if (Number.isNaN(birthDate.getTime())) {
    return 18
  }

  const today = new Date()

  let age =
    today.getFullYear() -
    birthDate.getFullYear()

  const monthDifference =
    today.getMonth() -
    birthDate.getMonth()

  const hasNotReachedBirthday =
    monthDifference < 0 ||
    (monthDifference === 0 &&
      today.getDate() <
        birthDate.getDate())

  if (hasNotReachedBirthday) {
    age -= 1
  }

  return Math.max(age, 1)
}

function getGenderAdjustment(
  gender: OnboardingData["personal"]["gender"],
): number {
  switch (gender) {
    case "male":
      return 5

    case "female":
      return -161

    case "non_binary":
    case "prefer_not_to_say":
    default:
      return -78
  }
}

function getActivityMultiplier(
  trainingDays: number,
): number {
  if (trainingDays >= 6) {
    return 1.725
  }

  if (trainingDays >= 4) {
    return 1.55
  }

  if (trainingDays >= 2) {
    return 1.375
  }

  return 1.2
}

function getGoalCalorieAdjustment(
  goal: OnboardingData["goal"]["goal"],
): number {
  const adjustments: Record<
    OnboardingData["goal"]["goal"],
    number
  > = {
    fat_loss: -400,
    lean_bulk: 250,
    muscle_gain: 350,
    body_recomposition: -100,
    maintenance: 0,
    performance: 150,
  }

  return adjustments[goal]
}

function getProteinMultiplier(
  goal: OnboardingData["goal"]["goal"],
): number {
  const multipliers: Record<
    OnboardingData["goal"]["goal"],
    number
  > = {
    fat_loss: 2.2,
    lean_bulk: 2,
    muscle_gain: 2,
    body_recomposition: 2.2,
    maintenance: 1.8,
    performance: 2,
  }

  return multipliers[goal]
}

/**
 * Hàm chính được actions.ts và onboarding-wizard.tsx sử dụng.
 */
export function calculateNutritionTargets(
  data: OnboardingData,
): NutritionTargets {
  const age = calculateAge(
    data.personal.dateOfBirth,
  )

  const weightKg =
    data.personal.weightKg

  const heightCm =
    data.personal.heightCm

  const bmr =
    10 * weightKg +
    6.25 * heightCm -
    5 * age +
    getGenderAdjustment(
      data.personal.gender,
    )

  const maintenanceCalories =
    bmr *
    getActivityMultiplier(
      data.training.trainingDays,
    )

  const adjustedCalories =
    maintenanceCalories +
    getGoalCalorieAdjustment(
      data.goal.goal,
    )

  const calories =
    Math.round(
      Math.max(1200, adjustedCalories) /
        10,
    ) * 10

  const protein = Math.round(
    weightKg *
      getProteinMultiplier(
        data.goal.goal,
      ),
  )

  const fat = Math.max(
    40,
    Math.round(weightKg * 0.8),
  )

  const remainingCalories =
    calories -
    protein * 4 -
    fat * 9

  const carbohydrates = Math.max(
    0,
    Math.round(
      remainingCalories / 4,
    ),
  )

  return {
    age,
    bmr: Math.round(bmr),
    maintenanceCalories: Math.round(
      maintenanceCalories,
    ),
    calories,
    protein,
    carbohydrates,
    fat,
  }
}

/**
 * Alias để tương thích với những file cũ.
 */
export const calculateMacros =
  calculateNutritionTargets

export const calculateInitialMacros =
  calculateNutritionTargets

export const calculateInitialTargets =
  calculateNutritionTargets

export const calculateCalorieAndMacros =
  calculateNutritionTargets