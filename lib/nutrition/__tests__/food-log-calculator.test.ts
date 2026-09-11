import { describe, expect, it } from "vitest"
import { scaleMacrosToGrams } from "@/lib/nutrition/food-log-calculator"
import type { NormalizedFoodMacros } from "@/lib/nutrition/food-data/types"

const PER_100G: NormalizedFoodMacros = {
  calories: 120,
  protein: 10,
  carbs: 20,
  fat: 2,
  fiber: 4,
}

describe("scaleMacrosToGrams", () => {
  it("returns the exact per-100g values for 100g", () => {
    expect(scaleMacrosToGrams(PER_100G, 100)).toEqual({
      calories: 120,
      protein: 10,
      carbs: 20,
      fat: 2,
      fiber: 4,
    })
  })

  it("scales exactly 2x for 200g", () => {
    expect(scaleMacrosToGrams(PER_100G, 200)).toEqual({
      calories: 240,
      protein: 20,
      carbs: 40,
      fat: 4,
      fiber: 8,
    })
  })

  it("scales exactly 0.5x for 50g", () => {
    expect(scaleMacrosToGrams(PER_100G, 50)).toEqual({
      calories: 60,
      protein: 5,
      carbs: 10,
      fat: 1,
      fiber: 2,
    })
  })

  it("handles a food with no fiber data by keeping it null rather than 0", () => {
    const result = scaleMacrosToGrams({ calories: 50, protein: 1, carbs: 2, fat: 0 }, 175)
    expect(result.fiber).toBeNull()
  })

  it("rounds to 1 decimal place without accumulating floating-point noise", () => {
    const result = scaleMacrosToGrams(PER_100G, 175)
    expect(result.calories).toBe(210)
    expect(result.protein).toBe(17.5)
    expect(result.carbs).toBe(35)
    expect(result.fat).toBe(3.5)
  })

  it("treats a non-positive quantity as zero rather than throwing", () => {
    const result = scaleMacrosToGrams(PER_100G, -5)
    expect(result).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 })
  })

  it("converts a serving-based portion to grams before scaling (30g = 1 serving, 2 servings logged)", () => {
    const servingGrams = 30
    const servingsConsumed = 2
    const grams = servingGrams * servingsConsumed

    expect(grams).toBe(60)

    const proteinBar: NormalizedFoodMacros = { calories: 400, protein: 33.3, carbs: 66.7, fat: 16.7 }
    const result = scaleMacrosToGrams(proteinBar, grams)

    // 60g is exactly 2x the 30g serving, so macros must be exactly 2x too.
    const oneServing = scaleMacrosToGrams(proteinBar, servingGrams)
    expect(result.calories).toBe(oneServing.calories * 2)
    expect(result.protein).toBe(oneServing.protein * 2)
  })
})
