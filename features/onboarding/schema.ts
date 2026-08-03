import { z } from "zod"

const textListSchema = z
  .array(z.string().trim().min(1))
  .max(30, "Maximum 30 items are allowed.")

export const personalSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Full name must contain at least 2 characters.")
    .max(100, "Full name is too long."),

  dateOfBirth: z
    .string()
    .min(1, "Date of birth is required.")
    .refine((value) => {
      const date = new Date(`${value}T00:00:00`)

      return !Number.isNaN(date.getTime()) && date <= new Date()
    }, "Date of birth is invalid."),

  gender: z.enum([
    "male",
    "female",
    "non_binary",
    "prefer_not_to_say",
  ]),

  heightCm: z
    .number()
    .min(80, "Height must be at least 80 cm.")
    .max(250, "Height must be below 250 cm."),

  weightKg: z
    .number()
    .min(20, "Weight must be at least 20 kg.")
    .max(400, "Weight must be below 400 kg."),

  timezone: z
    .string()
    .trim()
    .min(1, "Timezone is required.")
    .max(100),
})

export const goalSchema = z.object({
  goal: z.enum([
    "fat_loss",
    "lean_bulk",
    "muscle_gain",
    "body_recomposition",
    "maintenance",
    "performance",
  ]),
})

export const trainingSchema = z.object({
  experience: z.enum([
    "beginner",
    "intermediate",
    "advanced",
  ]),

  trainingDays: z
    .number()
    .int()
    .min(1, "Choose at least one training day.")
    .max(7, "Training days cannot exceed 7."),

  sessionDurationMinutes: z
    .number()
    .int()
    .min(20, "Session duration must be at least 20 minutes.")
    .max(300, "Session duration cannot exceed 300 minutes."),

  trainingLocation: z.enum([
    "gym",
    "home",
    "hybrid",
  ]),

  availableEquipment: textListSchema,

  priorityMuscles: textListSchema,

  physicalLimitations: z
    .string()
    .trim()
    .max(500, "Physical limitations are too long."),
})

export const nutritionSchema = z.object({
  mealsPerDay: z
    .number()
    .int()
    .min(1, "Meals per day must be at least 1.")
    .max(8, "Meals per day cannot exceed 8."),

  foodPreferences: textListSchema,

  excludedFoods: textListSchema,

  allergies: textListSchema,

  weeklyFoodBudget: z
    .number()
    .min(0, "Budget cannot be negative.")
    .max(100000)
    .nullable(),

  cookingAbility: z.enum([
    "beginner",
    "intermediate",
    "advanced",
  ]),

  mealPrepFrequency: z.enum([
    "daily",
    "twice_weekly",
    "weekly",
    "rarely",
  ]),
})

export const lifestyleSchema = z.object({
  sleepHours: z
    .number()
    .min(0, "Sleep cannot be negative.")
    .max(24, "Sleep cannot exceed 24 hours."),

  dailySteps: z
    .number()
    .int()
    .min(0, "Daily steps cannot be negative.")
    .max(100000),

  workSchedule: z
    .string()
    .trim()
    .min(2, "Please describe your school or work schedule.")
    .max(500, "Schedule description is too long."),

  stressLevel: z.enum([
    "low",
    "moderate",
    "high",
    "very_high",
  ]),

  preferredTrainingTime: z.enum([
    "morning",
    "afternoon",
    "evening",
    "flexible",
  ]),
})

export const onboardingSchema = z.object({
  personal: personalSchema,
  goal: goalSchema,
  training: trainingSchema,
  nutrition: nutritionSchema,
  lifestyle: lifestyleSchema,
})

export type OnboardingData = z.infer<typeof onboardingSchema>

export type OnboardingValues = OnboardingData

/**
 * Deep partial type dùng khi draft chưa có đủ mọi trường.
 */
export type OnboardingDraftData = {
  personal?: Partial<OnboardingData["personal"]>
  goal?: Partial<OnboardingData["goal"]>
  training?: Partial<OnboardingData["training"]>
  nutrition?: Partial<OnboardingData["nutrition"]>
  lifestyle?: Partial<OnboardingData["lifestyle"]>
}

export const onboardingStepSchemas = [
  personalSchema,
  goalSchema,
  trainingSchema,
  nutritionSchema,
  lifestyleSchema,
] as const

export const defaultOnboardingData: OnboardingData = {
  personal: {
    fullName: "",
    dateOfBirth: "",
    gender: "male",
    heightCm: 175,
    weightKg: 70,
    timezone: "Asia/Singapore",
  },

  goal: {
    goal: "body_recomposition",
  },

  training: {
    experience: "beginner",
    trainingDays: 3,
    sessionDurationMinutes: 90,
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
    cookingAbility: "beginner",
    mealPrepFrequency: "twice_weekly",
  },

  lifestyle: {
    sleepHours: 8,
    dailySteps: 6000,
    workSchedule: "",
    stressLevel: "moderate",
    preferredTrainingTime: "flexible",
  },
}

export const defaultOnboardingValues = defaultOnboardingData