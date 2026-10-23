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

  it("matches by food words, not substring, and puts cooked records first for a cooked query (photo names)", () => {
    expect(searchLocalFallback("cooked rice")[0]?.id).toBe("local-white-rice-cooked")
    expect(searchLocalFallback("steamed chicken")[0]?.id).toBe("local-chicken-breast-cooked")
    expect(searchLocalFallback("poached chicken")[0]?.id).toBe("local-chicken-breast-cooked")
    expect(searchLocalFallback("cooked white rice")[0]?.id).toBe("local-white-rice-cooked")
    expect(searchLocalFallback("bananas").map((food) => food.id)).toEqual(["local-banana-raw"])
    expect(searchLocalFallback("beef slices")[0]?.id).toBe("local-beef-lean-cooked")
  })

  it("finds Vietnamese dish components by Vietnamese or menu names, with or without diacritics, names untouched", () => {
    const first = (q: string) => searchLocalFallback(q)[0]?.id
    expect(first("bún")).toBe("local-rice-noodles-cooked")
    expect(first("bun")).toBe("local-rice-noodles-cooked")
    expect(first("bánh phở")).toBe("local-rice-noodles-cooked")
    expect(first("nước mắm")).toBe("local-fish-sauce")
    expect(first("nuoc mam")).toBe("local-fish-sauce")
    expect(first("giá đỗ")).toBe("local-bean-sprouts-raw")
    expect(first("sườn nướng")).toBe("local-pork-chop-grilled")
    expect(first("pork")).toBe("local-pork-shoulder-grilled")
    expect(first("fried egg")).toBe("local-egg-fried")
    // an alias matches only as a whole: a lone "bò" is not "bò nạm" or "thịt bò"
    expect(searchLocalFallback("bò")).toEqual([])
    // a shared word is not the same food (live finding: "baked beans" defaulted to bean sprouts)
    expect(searchLocalFallback("baked beans")).toEqual([])
    expect(searchLocalFallback("steamed vegetables")).toEqual([])
    expect(searchLocalFallback("grilled fish")).toEqual([])
    expect(searchLocalFallback("cooked rice").map((food) => food.id)).not.toContain("local-rice-noodles-cooked")
    expect(first("fish sauce")).toBe("local-fish-sauce")
    expect(first("rice noodles")).toBe("local-rice-noodles-cooked") // live finding: plural fold vs head word
    expect(first("bean sprouts")).toBe("local-bean-sprouts-raw")
    expect(getLocalFallbackById("local-cha-lua")?.name).toBe("Vietnamese Pork Roll (chả lụa)")
  })

  it("offline copies of USDA records cite their FDC id; borrowed values are marked estimated with the reason", () => {
    const noodles = getLocalFallbackById("local-rice-noodles-cooked")!
    expect(noodles).toMatchObject({ source: "local", confidence: "high", per100g: { calories: 108, protein: 1.79, carbs: 24, fat: 0.2 } })
    expect(noodles.rawDescription).toBe("Rice noodles, cooked (USDA FDC 168914)")
    expect(noodles.isEstimated).toBeUndefined()
    const paper = getLocalFallbackById("local-rice-paper-dry")!
    expect(paper).toMatchObject({ isEstimated: true, confidence: "low", sourceLabel: "Curated estimate" })
    expect(paper.estimationReason).toMatch(/USDA FDC 169742/)
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
