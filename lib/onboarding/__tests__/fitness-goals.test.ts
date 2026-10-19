import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import {
  fitnessGoalValues,
  onboardingSchema,
  type OnboardingData,
} from "@/features/onboarding/schema"

const currentGoals = [
  "fat_loss",
  "lean_bulk",
  "muscle_gain",
  "body_recomposition",
  "maintenance",
  "performance",
] as const

const validOnboardingPayload: OnboardingData = {
  personal: {
    fullName: "Test Athlete",
    dateOfBirth: "1990-01-01",
    gender: "prefer_not_to_say",
    heightCm: 175,
    weightKg: 70,
    timezone: "Asia/Singapore",
  },
  goal: { goal: "performance" },
  training: {
    trainingStyle: "general",
    experience: "intermediate",
    trainingDays: 3,
    sessionDurationMinutes: 60,
    trainingLocation: "gym",
    availableEquipment: [],
    priorityMuscles: [],
    physicalLimitations: "",
  },
  nutrition: {
    mealsPerDay: 3,
    foodPreferences: [],
    excludedFoods: [],
    allergies: [],
    weeklyFoodBudget: null,
    cookingAbility: "intermediate",
    mealPrepFrequency: "twice_weekly",
  },
  lifestyle: {
    sleepHours: 8,
    dailySteps: 6000,
    workSchedule: "Weekdays",
    stressLevel: "moderate",
    preferredTrainingTime: "flexible",
  },
}

describe("fitness goal taxonomy", () => {
  it("keeps the canonical app vocabulary explicit", () => {
    expect(fitnessGoalValues).toEqual(currentGoals)
  })

  it.each(currentGoals)("accepts and round-trips %s in an onboarding payload", (goal) => {
    const parsed = onboardingSchema.parse({
      ...validOnboardingPayload,
      goal: { goal },
    })

    expect(parsed.goal.goal).toBe(goal)
  })

  it("adds every current goal that was missing from the legacy database enum", () => {
    const migration = fs.readFileSync(
      path.join(
        process.cwd(),
        "supabase/migrations/20261008100000_add_current_fitness_goal_values.sql",
      ),
      "utf8",
    )

    for (const goal of [
      "fat_loss",
      "muscle_gain",
      "body_recomposition",
      "maintenance",
      "performance",
    ]) {
      expect(migration).toContain(`add value if not exists '${goal}'`)
    }
  })
})
