// lib/fitness/calories.ts

import { FitnessProfile, NutritionTargets, CarbDay, FitnessGoal } from '@/lib/client/client-profile';
import { clamp } from '@/lib/utils/validators';

export function calculateBMR(profile: FitnessProfile): number {
  const { age, heightCm, weightKg, sex } = profile;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(sex === 'male' ? base + 5 : base - 161);
}

const ACTIVITY_MULTIPLIERS: Record<FitnessProfile['activityLevel'], number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  'very-active': 1.725,
  athlete: 1.9,
};

export function calculateTDEE(profile: FitnessProfile): number {
  return Math.round(calculateBMR(profile) * ACTIVITY_MULTIPLIERS[profile.activityLevel]);
}

const GOAL_ADJUSTMENTS: Record<FitnessGoal, (tdee: number) => number> = {
  'fat-loss': (t) => t - 300,
  'recomposition': (t) => t - 100,
  'maintenance': (t) => t,
  'lean-bulk': (t) => t + 200,
  'muscle-gain': (t) => t + 400,
};

const PROTEIN_PER_KG: Record<FitnessGoal, number> = {
  'fat-loss': 2.2,
  'recomposition': 2.2,
  'maintenance': 1.8,
  'lean-bulk': 2.0,
  'muscle-gain': 2.2,
};

const FAT_PER_KG: Record<FitnessGoal, number> = {
  'fat-loss': 0.8,
  'recomposition': 0.8,
  'maintenance': 0.7,
  'lean-bulk': 0.7,
  'muscle-gain': 0.7,
};

const CARB_MODIFIERS: Record<CarbDay, number> = {
  low: 0.7,
  normal: 1.0,
  high: 1.3,
};

export function calculateNutritionTargets(
  profile: FitnessProfile,
  carbDay: CarbDay = 'normal'
): NutritionTargets {
  const bmr = calculateBMR(profile);
  const tdee = calculateTDEE(profile);
  const weightKg = profile.weightKg;

  let calories = GOAL_ADJUSTMENTS[profile.goal](tdee);
  calories = clamp(calories, 1200, 5000);

  const protein = Math.round(weightKg * PROTEIN_PER_KG[profile.goal]);
  const fat = Math.round(weightKg * FAT_PER_KG[profile.goal]);

  const carbMod = CARB_MODIFIERS[carbDay];
  const proteinCals = protein * 4;
  const fatCals = fat * 9;
  let carbCals = (calories - proteinCals - fatCals) * carbMod;
  if (carbCals < 0) carbCals = 0;
  const carbs = Math.round(carbCals / 4);
  const fiber = Math.round(calories / 1000 * 14);

  return {
    bmr,
    tdee,
    calories: Math.round(calories),
    protein,
    carbs,
    fat,
    fiber,
  };
}