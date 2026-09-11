import { describe, expect, it } from "vitest"
import { compareToTargets, computeDailyTotals, groupByMeal } from "@/lib/nutrition/food-log/totals"
import type { FoodLogEntry } from "@/lib/nutrition/food-log/types"

function entry(overrides: Partial<FoodLogEntry> = {}): FoodLogEntry {
  return {
    id: "1",
    logDate: "2026-01-01",
    mealType: "breakfast",
    foodName: "Oats",
    brand: null,
    source: "usda",
    sourceId: "123",
    barcode: null,
    quantityGrams: 100,
    servingName: null,
    servingsConsumed: null,
    calories: 389,
    proteinG: 16.9,
    carbsG: 66.3,
    fatG: 6.9,
    fiberG: 10.6,
    isEstimated: false,
    estimationConfidence: null,
    estimationReason: null,
    estimatedFrom: null,
    createdAt: "2026-01-01T08:00:00.000Z",
    ...overrides,
  }
}

describe("computeDailyTotals", () => {
  it("returns zero totals for no logged food", () => {
    expect(computeDailyTotals([])).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 })
  })

  it("sums calories/protein/carbs/fat across multiple entries", () => {
    const entries = [
      entry({ id: "1", calories: 389, proteinG: 16.9, carbsG: 66.3, fatG: 6.9 }),
      entry({ id: "2", calories: 107, proteinG: 1.3, carbsG: 27.6, fatG: 0.4 }),
    ]

    expect(computeDailyTotals(entries)).toEqual({
      calories: 496,
      protein: 18.2,
      carbs: 93.9,
      fat: 7.3,
    })
  })

  it("increases when a food is added", () => {
    const before = computeDailyTotals([entry({ id: "1" })])
    const after = computeDailyTotals([entry({ id: "1" }), entry({ id: "2", calories: 100, proteinG: 5, carbsG: 10, fatG: 2 })])

    expect(after.calories).toBeGreaterThan(before.calories)
  })

  it("recalculates correctly when a food's quantity is edited (replaced in the array)", () => {
    const original = [entry({ id: "1", calories: 389, proteinG: 16.9, carbsG: 66.3, fatG: 6.9 })]
    const edited = [entry({ id: "1", calories: 194.5, proteinG: 8.45, carbsG: 33.15, fatG: 3.45 })]

    expect(computeDailyTotals(original).calories).toBe(389)
    // calories are rounded to whole kcal for display; protein/carbs/fat keep 1 decimal.
    expect(computeDailyTotals(edited).calories).toBe(195)
    expect(computeDailyTotals(edited).protein).toBe(8.5)
  })

  it("decreases when a food is deleted (removed from the array)", () => {
    const before = computeDailyTotals([entry({ id: "1" }), entry({ id: "2", calories: 200, proteinG: 5, carbsG: 10, fatG: 2 })])
    const after = computeDailyTotals([entry({ id: "1" })])

    expect(after.calories).toBeLessThan(before.calories)
    expect(after.calories).toBe(389)
  })
})

describe("compareToTargets", () => {
  it("never confuses consumed with target — reports both plus remaining", () => {
    const comparison = compareToTargets(
      { calories: 1840, protein: 92, carbs: 210, fat: 54 },
      { calories: 3200, protein: 140, carbs: 500, fat: 70 },
    )

    expect(comparison.protein).toEqual({ consumed: 92, target: 140, remaining: 48 })
    expect(comparison.calories.remaining).toBe(1360)
  })
})

describe("groupByMeal", () => {
  it("groups entries under every meal type, including empty ones", () => {
    const grouped = groupByMeal([entry({ id: "1", mealType: "breakfast" }), entry({ id: "2", mealType: "lunch" })])

    expect(grouped.breakfast).toHaveLength(1)
    expect(grouped.lunch).toHaveLength(1)
    expect(grouped.dinner).toHaveLength(0)
    expect(grouped.snack).toHaveLength(0)
  })
})
