import { describe, expect, it } from "vitest"

import { getLocalFallbackById, searchLocalFallback } from "@/lib/nutrition/food-data/local-fallback"

/** "banana", "chicken breast", "rice" (spec Part "10. TESTS"). */
describe("searchLocalFallback", () => {
  it("finds banana by name", () => {
    const results = searchLocalFallback("banana")
    expect(results.some((food) => food.name.toLowerCase().includes("banana"))).toBe(true)
    const banana = results.find((food) => food.id === "local-banana-raw")
    expect(banana?.per100g).toMatchObject({ calories: 89, protein: 1.1, carbs: 22.8, fat: 0.3 })
    expect(banana?.confidence).toBe("fallback")
  })

  it("finds chicken breast, distinguishing raw from cooked preparation state", () => {
    const results = searchLocalFallback("chicken breast")
    const raw = results.find((food) => food.id === "local-chicken-breast-raw")
    const cooked = results.find((food) => food.id === "local-chicken-breast-cooked")

    expect(raw?.preparationState).toBe("raw")
    expect(cooked?.preparationState).toBe("cooked")
    // Cooked chicken breast is denser in protein/calories per 100g than raw — never conflate the two.
    expect(cooked!.per100g.calories).toBeGreaterThan(raw!.per100g.calories)
  })

  it("finds rice, distinguishing cooked from raw/dry preparation state", () => {
    const results = searchLocalFallback("rice")
    const cooked = results.find((food) => food.id === "local-white-rice-cooked")
    const raw = results.find((food) => food.id === "local-white-rice-raw")

    expect(cooked).toBeDefined()
    expect(raw).toBeDefined()
    expect(raw!.per100g.calories).toBeGreaterThan(cooked!.per100g.calories) // dry rice is far denser than cooked
  })

  it("is case-insensitive and trims whitespace", () => {
    expect(searchLocalFallback("  BANANA  ").length).toBeGreaterThan(0)
  })

  it("returns every entry for an empty query", () => {
    expect(searchLocalFallback("").length).toBeGreaterThan(0)
  })

  it("returns an empty list for a query matching nothing", () => {
    expect(searchLocalFallback("nonexistent-food-xyz")).toEqual([])
  })
})

describe("getLocalFallbackById", () => {
  it("looks a specific entry up by id", () => {
    expect(getLocalFallbackById("local-banana-raw")?.name).toBe("Banana — raw")
  })

  it("returns null for an unknown id", () => {
    expect(getLocalFallbackById("does-not-exist")).toBeNull()
  })
})
