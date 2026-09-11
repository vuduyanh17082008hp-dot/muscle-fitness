import type { NormalizedFoodMacros } from "@/lib/nutrition/food-data/types"
import type { EstimationConfidence, FoodLogSource, MealType } from "@/lib/nutrition/food-log/types"

/** What every input method (barcode/search/photo/manual) produces once the user hits "Add to Today". */
export type ConfirmedFood = {
  foodName: string
  brand?: string | null

  source: FoodLogSource
  sourceId?: string | null
  barcode?: string | null

  per100g: NormalizedFoodMacros
  quantityGrams: number

  /** How the user actually entered the portion — display/prefill only, grams stay authoritative. */
  servingName?: string | null
  servingsConsumed?: number | null

  mealType: MealType

  isEstimated?: boolean
  estimationConfidence?: EstimationConfidence | null
  estimationReason?: string | null
  estimatedFrom?: string | null
}
