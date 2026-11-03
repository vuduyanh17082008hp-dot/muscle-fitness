import { describe, expect, it } from "vitest"

import { getLocalFallbackById, searchLocalFallback } from "@/lib/nutrition/food-data/local-fallback"
import type { NormalizedFood } from "@/lib/nutrition/food-data/types"
import {
  COOKING_METHODS,
  COOKING_METHOD_LABEL,
  applyEatenSuggestions,
  candidateIndexForMethod,
  eatenGrams,
  needsCookingQuestion,
  nutrientProvenance,
  suggestedOilGrams,
  type EatenSource,
  type EatenSuggestion,
} from "@/lib/nutrition/photo-match-review"

const food = (id: string) => getLocalFallbackById(id)!

describe("cooking methods", () => {
  it("offers all nine required preparations plus 'not sure'", () => {
    for (const label of ["Boiled", "Steamed", "Grilled", "Roasted", "Pan-fried", "Deep-fried", "Stir-fried", "Air-fried", "Raw"]) {
      expect(COOKING_METHODS.map((method) => COOKING_METHOD_LABEL[method])).toContain(label)
    }
  })

  it("oil is counted exactly once: never on top of a record that already includes its fat", () => {
    const chicken = food("local-chicken-breast-cooked")
    expect(suggestedOilGrams("air_fried", 200, chicken)).toBe(2)
    expect(suggestedOilGrams("fried", 100, food("local-egg-fried"))).toBe(0) // "Egg, whole, cooked, fried"
    expect(suggestedOilGrams("stir_fried", 50, food("local-vegetable-oil"))).toBe(0) // oil itself
    expect(suggestedOilGrams("grilled", 200, chicken, { noAddedOil: true })).toBe(0) // template says the record covers it
  })

  it("asks only material questions: never for staples, garnish, or a record with its fat included", () => {
    expect(needsCookingQuestion("unknown", false, food("local-white-rice-cooked"))).toBe(false)
    expect(needsCookingQuestion("boiled", false, food("local-rice-noodles-cooked"))).toBe(false)
    expect(needsCookingQuestion("unknown", false, food("local-beef-broth"))).toBe(false)
    expect(needsCookingQuestion("unknown", false, food("local-egg-fried"))).toBe(false)
    expect(needsCookingQuestion("grilled", false, food("local-chicken-breast-cooked"), { noAddedOil: true })).toBe(false)
    expect(needsCookingQuestion("grilled", false, food("local-chicken-breast-cooked"))).toBe(true)
    expect(needsCookingQuestion("grilled", true, food("local-chicken-breast-cooked"))).toBe(false)
  })

  it("changing the method moves between raw and cooked records of the same food, never to a different food", () => {
    const candidates = searchLocalFallback("chicken breast") // [raw, cooked]
    expect(candidates.map((c) => c.preparationState)).toEqual(["raw", "cooked"])
    expect(candidateIndexForMethod("chicken breast", candidates, 0, "grilled")).toBe(1)
    expect(candidateIndexForMethod("chicken breast", candidates, 1, "raw")).toBe(0)
    expect(candidateIndexForMethod("chicken breast", candidates, 1, "steamed")).toBe(1)
    expect(candidateIndexForMethod("chicken breast", candidates, 0, "unknown")).toBe(0)

    const salmonOnlyRaw = searchLocalFallback("salmon")
    expect(candidateIndexForMethod("salmon", salmonOnlyRaw, 0, "grilled")).toBe(0) // no cooked salmon record: keep, don't jump
    const mixed: NormalizedFood[] = [food("local-salmon-raw"), food("local-chicken-breast-cooked")]
    expect(candidateIndexForMethod("salmon", mixed, 0, "grilled")).toBe(0) // the cooked record is a different food
  })

  it("labels nutrient provenance in the five honest buckets", () => {
    expect(nutrientProvenance(food("local-rice-noodles-cooked"))).toBe("VERIFIED_REFERENCE")
    expect(nutrientProvenance(food("local-cha-lua"))).toBe("CURATED_ESTIMATE")
    expect(nutrientProvenance(food("local-banana-raw"))).toBe("CURATED_ESTIMATE") // small unattributed fallback table
    expect(nutrientProvenance({ source: "ai_estimate" })).toBe("AI_ESTIMATE")
    expect(nutrientProvenance({ source: "user_provided" })).toBe("USER_CORRECTED")
    expect(nutrientProvenance(null)).toBe("UNKNOWN")
    expect(nutrientProvenance({ source: "usda", confidence: "high" })).toBe("VERIFIED_REFERENCE")
  })
})

describe("applyEatenSuggestions (before/after plate)", () => {
  const items: Array<{ key: string; name: string; grams: number; eatenPercent: number; eatenSource: EatenSource; suggestion?: EatenSuggestion | null }> = [
    { key: "c0", name: "rice", grams: 200, eatenPercent: 100, eatenSource: "default" },
    { key: "c1", name: "chicken", grams: 150, eatenPercent: 100, eatenSource: "default" },
    { key: "c2", name: "broth", grams: 400, eatenPercent: 100, eatenSource: "default" },
    { key: "c3", name: "egg", grams: 50, eatenPercent: 30, eatenSource: "user" },
  ]
  const next = applyEatenSuggestions(items, [
    { id: "c0", eatenPercent: 50, confidence: "medium", note: null },
    { id: "c1", eatenPercent: 90, confidence: "high", note: null },
    { id: "c2", eatenPercent: null, confidence: "low", note: "liquid level unclear" },
    { id: "c3", eatenPercent: 100, confidence: "high", note: null },
    { id: "ghost", eatenPercent: 0, confidence: "high", note: null },
  ])

  it("sets suggested percentages per component, keeps can't-tell and user-set values, never touches grams", () => {
    expect(next.map((item) => [item.key, item.eatenPercent, item.eatenSource, item.grams])).toEqual([
      ["c0", 50, "after_photo", 200],
      ["c1", 90, "after_photo", 150],
      ["c2", 100, "default", 400],
      ["c3", 30, "user", 50],
    ])
    expect(next[2].suggestion?.note).toBe("liquid level unclear")
    expect(next[3].suggestion?.eatenPercent).toBe(100) // shown beside the user's value, not applied
  })

  it("eaten grams then follow deterministically, and a 0 % component logs nothing", () => {
    expect(eatenGrams(next[0].grams, next[0].eatenPercent)).toBe(100)
    expect(eatenGrams(next[1].grams, next[1].eatenPercent)).toBe(135)
    expect(eatenGrams(200, 0)).toBe(0)
  })
})
