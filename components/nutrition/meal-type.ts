import type { MealType } from "@/lib/nutrition/food-log/types"

/** A reasonable default meal type based on the time of day — always user-editable. */
export function suggestMealType(date: Date = new Date()): MealType {
  const hour = date.getHours()

  if (hour < 11) return "breakfast"
  if (hour < 15) return "lunch"
  if (hour < 21) return "dinner"

  return "snack"
}
