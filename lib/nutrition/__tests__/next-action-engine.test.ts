import { describe, expect, it } from "vitest"

import { buildNextMealOptions } from "@/lib/nutrition/next-action-engine"
import type { FoodHistoryItem } from "@/lib/nutrition/food-log/history"

function historyItem(overrides: Partial<FoodHistoryItem> = {}): FoodHistoryItem {
  return {
    foodIdentity: "usda:123",
    foodName: "Grilled Chicken Breast",
    brand: null,
    source: "usda",
    sourceId: "123",
    barcode: null,
    lastQuantityGrams: 150,
    lastServingName: null,
    lastServingsConsumed: null,
    lastMacros: { calories: 250, protein: 46, carbs: 0, fat: 5, fiber: null },
    lastIsEstimated: false,
    lastLoggedAt: "2026-09-10T12:00:00.000Z",
    timesLogged: 3,
    ...overrides,
  }
}

describe("buildNextMealOptions", () => {
  it("reports no remaining budget once the calorie target has been hit", () => {
    const result = buildNextMealOptions({
      remaining: { calories: 0, protein: 10, carbs: 10, fat: 10 },
      excludedTerms: [],
      recentFoods: [],
      frequentFoods: [],
    })

    expect(result.hasRemainingBudget).toBe(false)
    expect(result.options).toHaveLength(0)
  })

  it("suggests today's actual remaining macros verbatim in the message (daily macro update)", () => {
    const result = buildNextMealOptions({
      remaining: { calories: 680, protein: 38, carbs: 60, fat: 20 },
      excludedTerms: [],
      recentFoods: [],
      frequentFoods: [],
    })

    expect(result.remaining).toEqual({ calories: 680, protein: 38, carbs: 60, fat: 20 })
    expect(result.message).toContain("680")
    expect(result.message).toContain("38")
  })

  it("offers the Chicken Rice 'less rice, extra chicken' component adjustment from HawkerLens reference data", () => {
    const result = buildNextMealOptions({
      remaining: { calories: 720, protein: 45, carbs: 80, fat: 30 },
      excludedTerms: [],
      recentFoods: [],
      frequentFoods: [],
    })

    const adjusted = result.options.find((o) => o.id === "hawker:chicken_rice:adjusted")
    expect(adjusted).toBeDefined()
    expect(adjusted?.adjustments).toEqual(
      expect.arrayContaining([expect.stringContaining("less"), expect.stringContaining("extra")]),
    )
    expect(adjusted?.provenance).toContain("Comparable Reference")
  })

  it("never suggests a food matching an excluded term or allergy", () => {
    const result = buildNextMealOptions({
      remaining: { calories: 700, protein: 40, carbs: 80, fat: 25 },
      excludedTerms: ["chicken"],
      recentFoods: [historyItem()],
      frequentFoods: [],
    })

    const names = result.options.map((o) => o.name.toLowerCase())
    expect(names.every((name) => !name.includes("chicken"))).toBe(true)
    // Chicken Rice (whose required component is chicken) must be excluded entirely, not silently missing an ingredient.
    expect(result.options.some((o) => o.id.startsWith("hawker:chicken_rice"))).toBe(false)
  })

  it("only proposes options that fit within remaining calories (with a small tolerance)", () => {
    const result = buildNextMealOptions({
      remaining: { calories: 150, protein: 100, carbs: 100, fat: 100 },
      excludedTerms: [],
      recentFoods: [historyItem()], // 250 kcal — over a 150 kcal remaining budget
      frequentFoods: [],
    })

    expect(result.options.some((o) => o.name === "Grilled Chicken Breast")).toBe(false)
  })

  it("surfaces a real recent food as a viable option when it fits", () => {
    const result = buildNextMealOptions({
      remaining: { calories: 300, protein: 50, carbs: 20, fat: 15 },
      excludedTerms: [],
      recentFoods: [historyItem()],
      frequentFoods: [],
    })

    const recent = result.options.find((o) => o.source === "recent_food")
    expect(recent).toBeDefined()
    expect(recent?.logPayload.source).toBe("usda") // original provenance preserved, not overwritten
    expect(recent?.provenance).toContain("recent log")
  })

  it("deduplicates a food that appears in both recent and frequent lists", () => {
    const item = historyItem()
    const result = buildNextMealOptions({
      remaining: { calories: 300, protein: 50, carbs: 20, fat: 15 },
      excludedTerms: [],
      recentFoods: [item],
      frequentFoods: [item],
    })

    const matches = result.options.filter((o) => o.name === "Grilled Chicken Breast")
    expect(matches.length).toBeLessThanOrEqual(1)
  })

  it("returns at most 3 ranked options", () => {
    const result = buildNextMealOptions({
      remaining: { calories: 900, protein: 60, carbs: 100, fat: 40 },
      excludedTerms: [],
      recentFoods: [],
      frequentFoods: [],
    })

    expect(result.options.length).toBeLessThanOrEqual(3)
  })

  it("every option carries honest provenance and marks HawkerLens suggestions as estimated", () => {
    const result = buildNextMealOptions({
      remaining: { calories: 700, protein: 40, carbs: 80, fat: 25 },
      excludedTerms: [],
      recentFoods: [],
      frequentFoods: [],
    })

    for (const option of result.options) {
      expect(option.provenance.length).toBeGreaterThan(0)
      if (option.source === "hawker_dish") {
        expect(option.logPayload.isEstimated).toBe(true)
        expect(option.logPayload.source).toBe("local")
      }
    }
  })
})
