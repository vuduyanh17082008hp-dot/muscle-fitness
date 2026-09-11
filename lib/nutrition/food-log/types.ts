export type MealType =
  | "breakfast"
  | "lunch"
  | "dinner"
  | "snack"
  | "pre_workout"
  | "post_workout"

export const MEAL_TYPES: MealType[] = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
  "pre_workout",
  "post_workout",
]

export const MEAL_TYPE_LABEL: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
  pre_workout: "Pre-Workout",
  post_workout: "Post-Workout",
}

export type FoodLogSource = "usda" | "open-food-facts" | "local" | "user_provided" | "ai_estimate"

export const FOOD_LOG_SOURCE_LABEL: Record<FoodLogSource, string> = {
  usda: "USDA FoodData Central",
  "open-food-facts": "Open Food Facts",
  local: "Local reference data",
  user_provided: "Entered manually",
  ai_estimate: "AI photo estimate",
}

export type EstimationConfidence = "high" | "medium" | "low"

export type FoodLogEntry = {
  id: string
  logDate: string
  mealType: MealType

  foodName: string
  brand: string | null

  source: FoodLogSource
  sourceId: string | null
  barcode: string | null

  quantityGrams: number

  /** How the user actually entered the portion — for display ("2 servings") and to prefill next time. Null when logged directly in grams. */
  servingName: string | null
  servingsConsumed: number | null

  calories: number
  proteinG: number
  carbsG: number
  fatG: number
  fiberG: number | null

  isEstimated: boolean
  estimationConfidence: EstimationConfidence | null
  estimationReason: string | null
  estimatedFrom: string | null

  createdAt: string
}

export type UserFoodServing = {
  id: string
  foodIdentity: string
  foodName: string
  servingName: string
  servingGrams: number
}

export type DailyMacroTotals = {
  calories: number
  protein: number
  carbs: number
  fat: number
}

export function emptyTotals(): DailyMacroTotals {
  return { calories: 0, protein: 0, carbs: 0, fat: 0 }
}
