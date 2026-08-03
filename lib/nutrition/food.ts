// lib/nutrition/food.ts

import { Food, MealFood } from '@/lib/client/client-profile';
import { ensurePositive } from '@/lib/utils/validators';

export function calculateFoodNutrition(food: Food, grams: number): MealFood {
  const safeGrams = ensurePositive(grams, 0);
  const factor = safeGrams / 100;
  return {
    foodId: food.id,
    foodName: food.name,
    grams: safeGrams,
    calories: Math.round(food.caloriesPer100g * factor),
    protein: Math.round(food.proteinPer100g * factor * 10) / 10,
    carbs: Math.round(food.carbsPer100g * factor * 10) / 10,
    fat: Math.round(food.fatPer100g * factor * 10) / 10,
    fiber: Math.round(food.fiberPer100g * factor * 10) / 10,
  };
}

// Trusted local database
export const FOOD_DB: Food[] = [
  { id: 'chicken_breast', name: 'Chicken Breast (cooked)', caloriesPer100g: 165, proteinPer100g: 31, carbsPer100g: 0, fatPer100g: 3.6, fiberPer100g: 0, category: 'protein', source: 'USDA' },
  { id: 'chicken_thigh', name: 'Chicken Thigh (cooked)', caloriesPer100g: 209, proteinPer100g: 26, carbsPer100g: 0, fatPer100g: 10.9, fiberPer100g: 0, category: 'protein', source: 'USDA' },
  { id: 'beef_mince_95', name: 'Beef Mince (95% lean)', caloriesPer100g: 171, proteinPer100g: 20, carbsPer100g: 0, fatPer100g: 9.6, fiberPer100g: 0, category: 'protein', source: 'USDA' },
  { id: 'salmon', name: 'Salmon (cooked)', caloriesPer100g: 208, proteinPer100g: 22, carbsPer100g: 0, fatPer100g: 13, fiberPer100g: 0, category: 'protein', source: 'USDA' },
  { id: 'eggs', name: 'Eggs (whole)', caloriesPer100g: 155, proteinPer100g: 13, carbsPer100g: 1.1, fatPer100g: 11, fiberPer100g: 0, category: 'protein', source: 'USDA' },
  { id: 'whey_protein', name: 'Whey Protein Powder', caloriesPer100g: 380, proteinPer100g: 80, carbsPer100g: 7, fatPer100g: 4, fiberPer100g: 0, category: 'protein', source: 'Label' },
  { id: 'brown_rice', name: 'Brown Rice (cooked)', caloriesPer100g: 111, proteinPer100g: 2.6, carbsPer100g: 23, fatPer100g: 0.9, fiberPer100g: 1.8, category: 'carbs', source: 'USDA' },
  { id: 'white_rice', name: 'White Rice (cooked)', caloriesPer100g: 130, proteinPer100g: 2.7, carbsPer100g: 28, fatPer100g: 0.3, fiberPer100g: 0.4, category: 'carbs', source: 'USDA' },
  { id: 'sweet_potato', name: 'Sweet Potato (baked)', caloriesPer100g: 90, proteinPer100g: 2, carbsPer100g: 20.7, fatPer100g: 0.2, fiberPer100g: 3.3, category: 'carbs', source: 'USDA' },
  { id: 'oats', name: 'Rolled Oats (dry)', caloriesPer100g: 389, proteinPer100g: 16.9, carbsPer100g: 66, fatPer100g: 6.9, fiberPer100g: 10.6, category: 'carbs', source: 'USDA' },
  { id: 'broccoli', name: 'Broccoli (cooked)', caloriesPer100g: 35, proteinPer100g: 2.4, carbsPer100g: 7.2, fatPer100g: 0.4, fiberPer100g: 3.3, category: 'vegetable', source: 'USDA' },
  { id: 'spinach', name: 'Spinach (cooked)', caloriesPer100g: 23, proteinPer100g: 3, carbsPer100g: 3.8, fatPer100g: 0.4, fiberPer100g: 2.4, category: 'vegetable', source: 'USDA' },
  { id: 'avocado', name: 'Avocado', caloriesPer100g: 160, proteinPer100g: 2, carbsPer100g: 8.5, fatPer100g: 14.7, fiberPer100g: 6.7, category: 'fat', source: 'USDA' },
  { id: 'olive_oil', name: 'Olive Oil', caloriesPer100g: 884, proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 100, fiberPer100g: 0, category: 'fat', source: 'USDA' },
  { id: 'almonds', name: 'Almonds', caloriesPer100g: 579, proteinPer100g: 21, carbsPer100g: 21.6, fatPer100g: 49.9, fiberPer100g: 12.5, category: 'fat', source: 'USDA' },
  { id: 'greek_yogurt', name: 'Greek Yogurt (plain)', caloriesPer100g: 59, proteinPer100g: 10, carbsPer100g: 3.6, fatPer100g: 0.4, fiberPer100g: 0, category: 'protein', source: 'USDA' },
  { id: 'cottage_cheese', name: 'Cottage Cheese (low fat)', caloriesPer100g: 84, proteinPer100g: 11, carbsPer100g: 3.4, fatPer100g: 2.3, fiberPer100g: 0, category: 'protein', source: 'USDA' },
  { id: 'banana', name: 'Banana', caloriesPer100g: 89, proteinPer100g: 1.1, carbsPer100g: 22.8, fatPer100g: 0.3, fiberPer100g: 2.6, category: 'carbs', source: 'USDA' },
];

export function searchFoods(query: string): Food[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return FOOD_DB.filter(f =>
    f.name.toLowerCase().includes(q) ||
    f.category.toLowerCase().includes(q)
  ).slice(0, 20);
}

export function getFoodById(id: string): Food | undefined {
  return FOOD_DB.find(f => f.id === id);
}