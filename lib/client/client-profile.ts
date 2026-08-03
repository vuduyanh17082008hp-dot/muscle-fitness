// lib/client/client-profile.ts

export type FitnessGoal =
  | 'fat-loss'
  | 'recomposition'
  | 'maintenance'
  | 'lean-bulk'
  | 'muscle-gain';

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very-active' | 'athlete';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type CarbDay = 'low' | 'normal' | 'high';

export interface FitnessProfile {
  id: string; // Supabase auth.user.id
  name: string;
  age: number;
  sex: 'male' | 'female';
  heightCm: number;
  weightKg: number;
  targetWeightKg?: number;

  goal: FitnessGoal;
  activityLevel: ActivityLevel;
  experience: ExperienceLevel;
  trainingDaysPerWeek: number;
  sessionDurationMinutes: number;
  availableEquipment: string[];
  priorityMuscles: string[];

  mealsPerDay: number;
  dietaryPreferences: string[];
  dislikedFoods: string[];
  allergies: string[];

  dailyStepTarget?: number;
  preferredTrainingTime?: string;

  onboardingCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Food {
  id: string;
  name: string;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number;
  category: string;
  source?: string;
}

export interface MealFood {
  foodId: string;
  foodName: string;
  grams: number;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
}

export interface Meal {
  id: string;
  name: string;
  time: string;
  foods: MealFood[];
}

export interface DailyNutritionLog {
  date: string;
  meals: Meal[];
  totals?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
  };
}

export interface NutritionTargets {
  bmr: number;
  tdee: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}