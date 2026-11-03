import { describe, expect, it } from "vitest"

import { dropDecomposedComposites, eatenGrams, needsCookingQuestion, reviewFoodMatch, suggestedOilGrams } from "@/lib/nutrition/photo-match-review"
import type { NormalizedFood } from "@/lib/nutrition/food-data/types"

const food = (overrides: Partial<NormalizedFood>): NormalizedFood => ({
  id: "usda-1",
  name: "Chicken, broiler, breast, meat only, cooked, roasted",
  source: "usda",
  sourceLabel: "USDA FoodData Central",
  preparationState: "cooked",
  per100g: { calories: 165, protein: 31, carbs: 0, fat: 3.6 },
  confidence: "high",
  ...overrides,
})

const kinds = (flags: ReturnType<typeof reviewFoodMatch>) => flags.map((flag) => flag.kind)

describe("reviewFoodMatch", () => {
  it("a clean cooked match for a cooked detection has no flags", () => {
    expect(reviewFoodMatch("grilled chicken breast", food({}))).toEqual([])
  })

  it("cooked detection matched to a RAW record → preparation_mismatch", () => {
    const flags = reviewFoodMatch("grilled chicken breast", food({ name: "Chicken breast, raw", preparationState: "raw" }))
    expect(kinds(flags)).toEqual(["preparation_mismatch"])
    expect(flags[0].message).toMatch(/grilled.*RAW/)
  })

  it("unqualified detection matched to a RAW record → raw_record (softer prompt)", () => {
    expect(kinds(reviewFoodMatch("chicken breast", food({ name: "Chicken breast, raw", preparationState: "raw" })))).toEqual(["raw_record"])
  })

  it("no shared words → name_mismatch", () => {
    expect(kinds(reviewFoodMatch("laksa", food({ name: "Beef stew, canned", preparationState: "packaged" })))).toEqual(["name_mismatch"])
  })

  it("plural/singular still counts as the same food", () => {
    expect(reviewFoodMatch("fried eggs", food({ name: "Egg, whole, cooked, fried" }))).toEqual([])
  })

  it("local fallback and degraded search are disclosed", () => {
    const flags = reviewFoodMatch("white rice", food({ name: "White rice, cooked", confidence: "fallback", source: "local" }), "provider_timeout")
    expect(kinds(flags)).toEqual(["low_confidence_record", "degraded_search"])
  })

  it("never produces a number or accuracy score", () => {
    const flags = reviewFoodMatch("laksa", food({ name: "Beef stew", preparationState: "raw", confidence: "low" }), "provider_error")
    for (const flag of flags) expect(flag.message).not.toMatch(/\d+\s*%|accura/i)
  })
})

describe("photo review: cooking method, eaten %, mixed dishes", () => {
  it("added-oil default follows the cooking method and is 0 when nothing implies oil", () => {
    const chicken = { name: "Chicken breast, roasted", rawDescription: null }
    expect(suggestedOilGrams("boiled", 200, chicken)).toBe(0)
    expect(suggestedOilGrams("steamed", 200, chicken)).toBe(0)
    expect(suggestedOilGrams("raw", 200, chicken)).toBe(0)
    expect(suggestedOilGrams("unknown", 200, chicken)).toBe(0)
    expect(suggestedOilGrams("grilled", 200, chicken)).toBe(6)
    expect(suggestedOilGrams("stir_fried", 200, chicken)).toBe(12)
    expect(suggestedOilGrams("deep_fried", 200, chicken)).toBe(24)
  })

  it("a record that already includes cooking fat never gets extra oil (no double count)", () => {
    expect(suggestedOilGrams("fried", 300, { name: "Fried rice", rawDescription: null })).toBe(0)
    expect(suggestedOilGrams("stir_fried", 150, { name: "Vegetables, stir-fried in oil", rawDescription: null })).toBe(0)
  })

  it("eaten grams scale the served portion; 0 % logs nothing; out-of-range is clamped", () => {
    expect(eatenGrams(200, 100)).toBe(200)
    expect(eatenGrams(200, 50)).toBe(100)
    expect(eatenGrams(155, 33)).toBe(51.15)
    expect(eatenGrams(200, 0)).toBe(0)
    expect(eatenGrams(200, 150)).toBe(200)
    expect(eatenGrams(200, -5)).toBe(0)
  })

  it("an uncertain or unknown preparation asks one question; a certain one does not", () => {
    expect(needsCookingQuestion("grilled", false)).toBe(true)
    expect(needsCookingQuestion("unknown", true)).toBe(true)
    expect(needsCookingQuestion("steamed", true)).toBe(false)
  })

  it("a composite listed alongside its own components is dropped; an undecomposed dish stays", () => {
    const items = [
      { name: "Chicken Rice", dish: null },
      { name: "steamed chicken", dish: "chicken rice" },
      { name: "cooked white rice", dish: "Chicken  rice" },
      { name: "pho", dish: null },
    ]
    expect(dropDecomposedComposites(items).map((item) => item.name)).toEqual(["steamed chicken", "cooked white rice", "pho"])
  })
})
