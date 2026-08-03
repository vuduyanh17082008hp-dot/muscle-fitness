// lib/repositories/food-log-repository.ts
// FIX: Thay vì import từ 'meal-plan/meal' (vốn là component React, không export type), 
// ta import Meal cùng với DailyNutritionLog, MealFood từ file types chung.
import { DailyNutritionLog, MealFood, Meal } from '@/lib/client/client-profile';
import { getFoodById, calculateFoodNutrition } from '@/lib/nutrition/food';

export interface IFoodLogRepository {
  getDay(userId: string, date: string): Promise<DailyNutritionLog | null>;
  saveDay(userId: string, log: DailyNutritionLog): Promise<void>;
}

class LocalFoodLogRepository implements IFoodLogRepository {
  private getKey(userId: string, date: string): string {
    return `muscle_fitness_foodlog_${userId}_${date}`;
  }

  async getDay(userId: string, date: string): Promise<DailyNutritionLog | null> {
    if (typeof window === 'undefined' || !userId || !date) return null;
    try {
      const raw = localStorage.getItem(this.getKey(userId, date));
      if (!raw) return null;
      return JSON.parse(raw) as DailyNutritionLog;
    } catch {
      return null;
    }
  }

  async saveDay(userId: string, log: DailyNutritionLog): Promise<void> {
    if (typeof window === 'undefined' || !userId || !log) return;
    localStorage.setItem(this.getKey(userId, log.date), JSON.stringify(log));
  }
}

export const foodLogRepository: IFoodLogRepository = new LocalFoodLogRepository();

// --- MUTATION HELPERS ---

export function createEmptyLog(date: string): DailyNutritionLog {
  return {
    date,
    meals: [],
    totals: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  };
}

export function recalculateTotals(log: DailyNutritionLog): DailyNutritionLog {
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  for (const meal of log.meals) {
    for (const food of meal.foods) {
      totals.calories += food.calories || 0;
      totals.protein += food.protein || 0;
      totals.carbs += food.carbs || 0;
      totals.fat += food.fat || 0;
      totals.fiber += food.fiber || 0;
    }
  }
  return {
    ...log,
    totals: {
      calories: Math.round(totals.calories),
      protein: Math.round(totals.protein * 10) / 10,
      carbs: Math.round(totals.carbs * 10) / 10,
      fat: Math.round(totals.fat * 10) / 10,
      fiber: Math.round(totals.fiber * 10) / 10,
    },
  };
}

export function addFoodToMeal(
  log: DailyNutritionLog,
  mealIndex: number,
  foodId: string,
  grams: number
): DailyNutritionLog {
  const food = getFoodById(foodId);
  if (!food) throw new Error(`Food with id ${foodId} not found`);
  if (grams <= 0) throw new Error('Grams must be positive');

  const mealFood = calculateFoodNutrition(food, grams);
  const newMeals = [...log.meals];
  
  if (mealIndex >= newMeals.length) {
    while (newMeals.length <= mealIndex) {
      newMeals.push({ id: crypto.randomUUID(), name: `Meal ${newMeals.length + 1}`, time: '', foods: [] });
    }
  }
  
  newMeals[mealIndex] = {
    ...newMeals[mealIndex],
    foods: [...newMeals[mealIndex].foods, mealFood],
  };
  
  return recalculateTotals({ ...log, meals: newMeals });
}

export function removeFoodFromMeal(
  log: DailyNutritionLog,
  mealIndex: number,
  foodIndex: number
): DailyNutritionLog {
  if (mealIndex >= log.meals.length) return log;
  const meal = log.meals[mealIndex];
  if (foodIndex >= meal.foods.length) return log;
  
  const newMeals = [...log.meals];
  newMeals[mealIndex] = {
    ...meal,
    foods: meal.foods.filter((_, i) => i !== foodIndex),
  };
  return recalculateTotals({ ...log, meals: newMeals });
}

export function clearMeal(log: DailyNutritionLog, mealIndex: number): DailyNutritionLog {
  if (mealIndex >= log.meals.length) return log;
  const newMeals = [...log.meals];
  newMeals[mealIndex] = { ...newMeals[mealIndex], foods: [] };
  return recalculateTotals({ ...log, meals: newMeals });
}

export function duplicateMeal(log: DailyNutritionLog, mealIndex: number): DailyNutritionLog {
  if (mealIndex >= log.meals.length) return log;
  const original = log.meals[mealIndex];
  const newMeal: Meal = {
    ...original,
    id: crypto.randomUUID(),
    name: `${original.name} (copy)`,
    foods: original.foods.map(f => ({ ...f })),
  };
  const newMeals = [...log.meals, newMeal];
  return recalculateTotals({ ...log, meals: newMeals });
}

export function editFoodGrams(
  log: DailyNutritionLog,
  mealIndex: number,
  foodIndex: number,
  newGrams: number
): DailyNutritionLog {
  if (mealIndex >= log.meals.length) return log;
  const meal = log.meals[mealIndex];
  if (foodIndex >= meal.foods.length || newGrams <= 0) return log;
  
  const food = getFoodById(meal.foods[foodIndex].foodId);
  if (!food) return log;
  
  const updatedFood = calculateFoodNutrition(food, newGrams);
  const newMeals = [...log.meals];
  const newFoods = [...meal.foods];
  newFoods[foodIndex] = updatedFood;
  newMeals[mealIndex] = { ...meal, foods: newFoods };
  return recalculateTotals({ ...log, meals: newMeals });
}