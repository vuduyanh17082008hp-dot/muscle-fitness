import { describe, expect, it } from "vitest"

import { mentionsMeal } from "@/lib/nutrition/coach/followup"
import { parseCoachMessage } from "@/lib/nutrition/coach/intent"
import type { NormalizedFood } from "@/lib/nutrition/food-data/types"
import { photoMatchRank, reviewFoodMatch } from "@/lib/nutrition/photo-match-review"

const usda = (name: string, over: Partial<NormalizedFood> = {}): NormalizedFood => ({ id: name, name, source: "usda", sourceLabel: "USDA FoodData Central", preparationState: "cooked", per100g: { calories: 100, protein: 10, carbs: 0, fat: 1 }, confidence: "medium", ...over })

describe("S4-A accuracy fixes (live defects 2026-11-03)", () => {
  it("a shared cooking word never makes two records the same food", () => {
    const corn = usda("Corn, white, steamed (Navajo)")
    expect(reviewFoodMatch("Steamed chicken", corn).map((flag) => flag.kind)).toContain("name_mismatch")
    const chicken = usda("Chicken Breast — cooked")
    const spread = usda("Chicken spread", { preparationState: "unknown" })
    const ranked = [corn, spread, chicken].sort((a, b) => photoMatchRank("Steamed chicken", "steamed", a) - photoMatchRank("Steamed chicken", "steamed", b))
    expect(ranked[0].name).toBe("Chicken Breast — cooked")
  })

  it("plain rice is preferred over a glutinous variant the user didn't name", () => {
    const glutinous = usda("Rice, white, glutinous, unenriched, cooked")
    const plain = usda("Rice, white, short-grain, enriched, cooked")
    expect(photoMatchRank("Cooked white rice", "boiled", plain)).toBeLessThan(photoMatchRank("Cooked white rice", "boiled", glutinous))
  })

  it("'Cooked rice' defaults to plain rice, not rice noodles (a different food form)", () => {
    const noodles = usda("Rice noodles, cooked")
    const plain = usda("Rice, white, medium-grain, cooked, unenriched")
    expect(photoMatchRank("Cooked rice", "boiled", plain)).toBeLessThan(photoMatchRank("Cooked rice", "boiled", noodles))
    expect(photoMatchRank("Rice noodles", "boiled", noodles)).toBe(0)
  })

  it("'with realistic portions' is a request qualifier, not an unknown food", () => {
    const intent = parseCoachMessage("Give me 3 high-protein lunch ideas with realistic portions", { hasDraft: false })
    expect(intent.kind).toBe("build")
    if (intent.kind === "build") expect(intent.unresolvedFoods).toEqual([])
  })

  it("a meal is only 'mentioned' by a word that tells it apart", () => {
    const tuna = { id: "a", name: "High-Protein Tuna Wrap Bowl", family: "savory_bowl", items: [], source: "conversation" as const, createdAt: "" }
    expect(mentionsMeal("what are the ingredients and how much of each, raw or cooked?", tuna)).toBe(false)
    expect(mentionsMeal("ingredients of the tuna one", tuna)).toBe(true)
  })
})
