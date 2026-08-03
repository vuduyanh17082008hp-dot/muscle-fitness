// lib/nutrition/meal-generator.ts

import { FitnessProfile, NutritionTargets, CarbDay, Food } from '@/lib/client/client-profile';
import { FOOD_DB, getFoodById } from '@/lib/nutrition/food';
import { calculateNutritionTargets } from '@/lib/fitness/calorie';

// --- Types ---

export interface MealPlanMeal {
  id: string;
  name: string;          // "Breakfast", "Lunch", etc.
  time: string;          // "07:00", "12:30", etc.
  foods: MealPlanFood[];
  totals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
  };
}

export interface MealPlanFood {
  foodId: string;
  name: string;
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface MealPlan {
  meals: MealPlanMeal[];
  totals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
  };
  carbDay: CarbDay;
  createdAt: string;
}

// --- Constants ---

const MEAL_ROLES = ['breakfast', 'pre-workout', 'post-workout', 'lunch', 'snack', 'dinner', 'final-meal'];

const MEAL_DISTRIBUTION: Record<string, { calories: number; protein: number; carbs: number; fat: number }> = {
  breakfast: { calories: 0.25, protein: 0.2, carbs: 0.25, fat: 0.3 },
  'pre-workout': { calories: 0.15, protein: 0.15, carbs: 0.25, fat: 0.05 },
  'post-workout': { calories: 0.2, protein: 0.3, carbs: 0.2, fat: 0.1 },
  lunch: { calories: 0.25, protein: 0.25, carbs: 0.2, fat: 0.25 },
  snack: { calories: 0.1, protein: 0.1, carbs: 0.1, fat: 0.1 },
  dinner: { calories: 0.25, protein: 0.25, carbs: 0.15, fat: 0.3 },
  'final-meal': { calories: 0.1, protein: 0.05, carbs: 0.05, fat: 0.15 },
};

// --- Helper Functions ---

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function clampGrams(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// --- Main Engine ---

export function generateMealPlan(
  profile: FitnessProfile,
  targets: NutritionTargets,
  carbDay: CarbDay = 'normal'
): MealPlan {
  const adjustedTargets = calculateNutritionTargets(profile, carbDay);

  const mealsPerDay = profile.mealsPerDay || 3;
  const totalCalories = adjustedTargets.calories;
  const totalProtein = adjustedTargets.protein;
  const totalCarbs = adjustedTargets.carbs;
  const totalFat = adjustedTargets.fat;
  const totalFiber = adjustedTargets.fiber;

  const mealRoles = MEAL_ROLES.slice(0, mealsPerDay);
  const trainingTime = profile.preferredTrainingTime || '08:00';
  const trainingHour = parseInt(trainingTime.split(':')[0]);
  const isMorningWorkout = trainingHour < 12;

  const meals: MealPlanMeal[] = mealRoles.map((role, index) => {
    const distribution = MEAL_DISTRIBUTION[role] || MEAL_DISTRIBUTION.lunch;
    const calTarget = Math.round(totalCalories * distribution.calories);
    const proteinTarget = Math.round(totalProtein * distribution.protein);
    const carbTarget = Math.round(totalCarbs * distribution.carbs);
    const fatTarget = Math.round(totalFat * distribution.fat);
    // FIX: `distribution.fiber` does not exist. Removed unused dead code.

    const foods = selectFoodsForMeal(
      profile,
      role,
      calTarget,
      proteinTarget,
      carbTarget,
      fatTarget
    );

    const totals = foods.reduce(
      (acc, f) => ({
        calories: acc.calories + f.calories,
        protein: acc.protein + f.protein,
        carbs: acc.carbs + f.carbs,
        fat: acc.fat + f.fat,
        fiber: acc.fiber + f.fiber,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
    );

    return {
      id: `meal_${index}`,
      name: role.replace('-', ' ').toUpperCase(),
      time: getMealTime(role, trainingHour, isMorningWorkout),
      foods,
      totals,
    };
  });

  const grandTotals = meals.reduce(
    (acc, meal) => ({
      calories: acc.calories + meal.totals.calories,
      protein: acc.protein + meal.totals.protein,
      carbs: acc.carbs + meal.totals.carbs,
      fat: acc.fat + meal.totals.fat,
      fiber: acc.fiber + meal.totals.fiber,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  );

  return {
    meals,
    totals: grandTotals,
    carbDay,
    createdAt: new Date().toISOString(),
  };
}

// --- Food Selection Logic ---

function selectFoodsForMeal(
  profile: FitnessProfile,
  role: string,
  calTarget: number,
  proteinTarget: number,
  carbTarget: number,
  fatTarget: number
): MealPlanFood[] {
  const selected: MealPlanFood[] = [];
  let remainingCal = calTarget;
  let remainingProtein = proteinTarget;
  let remainingCarbs = carbTarget;
  let remainingFat = fatTarget;

  let availableFoods = FOOD_DB.filter(food => {
    if (profile.allergies.some(a => food.name.toLowerCase().includes(a.toLowerCase()))) return false;
    if (profile.dislikedFoods.some(d => food.name.toLowerCase().includes(d.toLowerCase()))) return false;
    return true;
  });

  let prioritizedCategories: string[] = [];
  if (role === 'breakfast' || role === 'pre-workout') {
    prioritizedCategories = ['carbs', 'protein'];
  } else if (role === 'post-workout') {
    prioritizedCategories = ['protein', 'carbs'];
  } else if (role === 'dinner' || role === 'final-meal') {
    prioritizedCategories = ['protein', 'fat', 'vegetable'];
  } else {
    prioritizedCategories = ['protein', 'carbs', 'fat', 'vegetable'];
  }

  for (const category of prioritizedCategories) {
    if (remainingCal <= 0) break;
    const categoryFoods = availableFoods.filter(f => f.category === category);
    if (categoryFoods.length === 0) continue;

    const numFoods = Math.min(Math.max(1, Math.floor(Math.random() * 2) + 1), categoryFoods.length);
    const shuffled = categoryFoods.sort(() => Math.random() - 0.5);
    const chosen = shuffled.slice(0, numFoods);

    for (const food of chosen) {
      let maxGrams = 500;
      if (food.caloriesPer100g > 0) {
        maxGrams = Math.min(500, (remainingCal / food.caloriesPer100g) * 100);
      }
      if (food.proteinPer100g > 0 && remainingProtein > 0) {
        const proteinGrams = (remainingProtein / food.proteinPer100g) * 100;
        maxGrams = Math.min(maxGrams, proteinGrams * 1.5);
      }
      if (food.carbsPer100g > 0 && remainingCarbs > 0) {
        const carbGrams = (remainingCarbs / food.carbsPer100g) * 100;
        maxGrams = Math.min(maxGrams, carbGrams * 1.5);
      }
      if (food.fatPer100g > 0 && remainingFat > 0) {
        const fatGrams = (remainingFat / food.fatPer100g) * 100;
        maxGrams = Math.min(maxGrams, fatGrams * 1.5);
      }

      const grams = clampGrams(
        Math.round(maxGrams * (0.6 + Math.random() * 0.4)),
        50,
        maxGrams
      );

      if (grams >= 20) {
        const factor = grams / 100;
        const mealFood: MealPlanFood = {
          foodId: food.id,
          name: food.name,
          grams,
          calories: Math.round(food.caloriesPer100g * factor),
          protein: Math.round(food.proteinPer100g * factor * 10) / 10,
          carbs: Math.round(food.carbsPer100g * factor * 10) / 10,
          fat: Math.round(food.fatPer100g * factor * 10) / 10,
          fiber: Math.round(food.fiberPer100g * factor * 10) / 10,
        };
        selected.push(mealFood);
        remainingCal -= mealFood.calories;
        remainingProtein -= mealFood.protein;
        remainingCarbs -= mealFood.carbs;
        remainingFat -= mealFood.fat;
      }
    }
  }

  if (remainingProtein > 20 && selected.length > 0) {
    const chicken = getFoodById('chicken_breast');
    if (chicken) {
      const grams = Math.round((remainingProtein / chicken.proteinPer100g) * 100);
      const factor = grams / 100;
      selected.push({
        foodId: chicken.id,
        name: chicken.name,
        grams,
        calories: Math.round(chicken.caloriesPer100g * factor),
        protein: Math.round(chicken.proteinPer100g * factor * 10) / 10,
        carbs: Math.round(chicken.carbsPer100g * factor * 10) / 10,
        fat: Math.round(chicken.fatPer100g * factor * 10) / 10,
        fiber: Math.round(chicken.fiberPer100g * factor * 10) / 10,
      });
    }
  }

  return selected;
}

// --- Time Assignment ---

function getMealTime(role: string, trainingHour: number, isMorning: boolean): string {
  const times: Record<string, string> = {
    breakfast: isMorning ? '07:00' : '08:30',
    'pre-workout': isMorning ? '06:30' : '17:00',
    'post-workout': isMorning ? '08:30' : '18:30',
    lunch: '12:30',
    snack: '15:30',
    dinner: '19:30',
    'final-meal': '21:30',
  };
  return times[role] || '12:00';
}

// --- User Actions ---

export function regenerateMealPlan(
  profile: FitnessProfile,
  targets: NutritionTargets,
  carbDay: CarbDay = 'normal'
): MealPlan {
  return generateMealPlan(profile, targets, carbDay);
}

export function swapFood(
  mealPlan: MealPlan,
  mealIndex: number,
  foodIndex: number,
  newFoodId: string
): MealPlan {
  const newMeals = [...mealPlan.meals];
  const meal = newMeals[mealIndex];
  const newFood = getFoodById(newFoodId);
  if (!newFood) return mealPlan;

  const oldFood = meal.foods[foodIndex];
  const grams = oldFood.grams;
  const factor = grams / 100;
  const updatedFood: MealPlanFood = {
    foodId: newFood.id,
    name: newFood.name,
    grams,
    calories: Math.round(newFood.caloriesPer100g * factor),
    protein: Math.round(newFood.proteinPer100g * factor * 10) / 10,
    carbs: Math.round(newFood.carbsPer100g * factor * 10) / 10,
    fat: Math.round(newFood.fatPer100g * factor * 10) / 10,
    fiber: Math.round(newFood.fiberPer100g * factor * 10) / 10,
  };

  const newFoods = [...meal.foods];
  newFoods[foodIndex] = updatedFood;
  newMeals[mealIndex] = { ...meal, foods: newFoods };

  const newTotals = newMeals[mealIndex].foods.reduce(
    (acc, f) => ({
      calories: acc.calories + f.calories,
      protein: acc.protein + f.protein,
      carbs: acc.carbs + f.carbs,
      fat: acc.fat + f.fat,
      fiber: acc.fiber + f.fiber,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  );
  newMeals[mealIndex] = { ...newMeals[mealIndex], totals: newTotals };

  const grandTotals = newMeals.reduce(
    (acc, m) => ({
      calories: acc.calories + m.totals.calories,
      protein: acc.protein + m.totals.protein,
      carbs: acc.carbs + m.totals.carbs,
      fat: acc.fat + m.totals.fat,
      fiber: acc.fiber + m.totals.fiber,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  );

  return { ...mealPlan, meals: newMeals, totals: grandTotals };
}

export function changeMealCount(
  mealPlan: MealPlan,
  newCount: number,
  profile: FitnessProfile,
  targets: NutritionTargets
): MealPlan {
  const updatedProfile = { ...profile, mealsPerDay: newCount };
  return generateMealPlan(updatedProfile, targets, mealPlan.carbDay);
}

export function changeCarbDay(
  mealPlan: MealPlan,
  newCarbDay: CarbDay,
  profile: FitnessProfile,
  targets: NutritionTargets
): MealPlan {
  return generateMealPlan(profile, targets, newCarbDay);
}

export function replaceIngredient(
  mealPlan: MealPlan,
  mealIndex: number,
  foodIndex: number,
  newFoodId: string
): MealPlan {
  return swapFood(mealPlan, mealIndex, foodIndex, newFoodId);
}