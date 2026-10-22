import { describe, expect, it } from "vitest"

import { reviewFoodMatch } from "@/lib/nutrition/photo-match-review"
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
