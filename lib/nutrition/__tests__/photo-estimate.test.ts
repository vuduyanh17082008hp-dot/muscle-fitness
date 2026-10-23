import { beforeEach, describe, expect, it, vi } from "vitest"

const identifyFoodsInImage = vi.fn()
const searchFood = vi.fn()
vi.mock("@/lib/ai/vision-client", async (original) => ({
  ...(await original<typeof import("@/lib/ai/vision-client")>()),
  identifyFoodsInImage: (...args: unknown[]) => identifyFoodsInImage(...args),
  isVisionConfigured: () => true,
}))
vi.mock("@/lib/nutrition/food-data", () => ({ searchFood: (...args: unknown[]) => searchFood(...args) }))

import { parseItems } from "@/lib/ai/vision-client"
import { estimateMealFromPhoto } from "@/lib/nutrition/photo-estimate"

const rice = { id: "local-white-rice", name: "White Rice — cooked", source: "local", sourceId: "local-white-rice", sourceLabel: "Local", preparationState: "cooked", per100g: { calories: 130, protein: 2.7, carbs: 28, fat: 0.3 } }

beforeEach(() => {
  identifyFoodsInImage.mockReset()
  searchFood.mockReset()
  searchFood.mockResolvedValue({ foods: [rice], status: "ok" })
})

describe("vision output is untrusted", () => {
  it("drops malformed entries, clamps portions, defaults unknown preparation, never trusts certainty without a method", () => {
    const items = parseItems({
      items: [
        { name: "grilled chicken", estimatedGrams: 180.4, confidence: "high", preparation: "grilled", preparationCertain: true, dish: null, notes: "" },
        { name: "", estimatedGrams: 100 },
        { name: "rice", estimatedGrams: -3 },
        { name: "soup", estimatedGrams: "200" },
        { name: "mystery", estimatedGrams: 99999, confidence: "certain", preparation: "sous-vide", preparationCertain: true, dish: "  " },
        "not an object",
      ],
    })
    expect(items).toEqual([
      { name: "grilled chicken", estimatedGrams: 180, confidence: "high", notes: undefined, preparation: "grilled", preparationCertain: true, dish: null },
      { name: "mystery", estimatedGrams: 2000, confidence: "medium", notes: undefined, preparation: "unknown", preparationCertain: false, dish: null },
    ])
    expect(parseItems({ items: [{ name: "bánh mì", estimatedGrams: 150, confidence: "high", preparation: "baked", preparationCertain: true, dish: "null", notes: "" }] })[0].dish).toBeNull() // live: the word "null"
    expect(parseItems({ calories: 500 })).toEqual([])
    expect(parseItems(null)).toEqual([])
  })
})

describe("estimateMealFromPhoto", () => {
  it("a failed or malformed vision call is an error, never an empty (0 kcal) meal", async () => {
    identifyFoodsInImage.mockResolvedValue(null)
    expect(await estimateMealFromPhoto("data:image/jpeg;base64,AA==")).toEqual({ status: "error", message: "Photo analysis is temporarily unavailable." })
    expect(searchFood).not.toHaveBeenCalled()
  })

  it("a non-food photo is no_foods_detected", async () => {
    identifyFoodsInImage.mockResolvedValue({ items: [] })
    expect((await estimateMealFromPhoto("data:image/jpeg;base64,AA==")).status).toBe("no_foods_detected")
  })

  it("a mixed dish keeps its components, drops the duplicate composite, and carries the oil record for the review", async () => {
    identifyFoodsInImage.mockResolvedValue({
      items: [
        { name: "chicken rice", estimatedGrams: 450, confidence: "medium", preparation: "unknown", preparationCertain: false, dish: null },
        { name: "cooked white rice", estimatedGrams: 250, confidence: "high", preparation: "boiled", preparationCertain: true, dish: "Chicken Rice" },
        { name: "chicken", estimatedGrams: 150, confidence: "medium", preparation: "steamed", preparationCertain: false, dish: "Chicken Rice" },
      ],
    })
    const result = await estimateMealFromPhoto("data:image/jpeg;base64,AA==")
    if (result.status !== "ok") throw new Error(result.status)
    expect(result.items.map((item) => [item.detectedName, item.dish, item.preparation, item.preparationCertain])).toEqual([
      ["cooked white rice", "Chicken Rice", "boiled", true],
      ["chicken", "Chicken Rice", "steamed", false],
    ])
    expect(searchFood).toHaveBeenCalledTimes(2)
    expect(result.cookingOil?.id).toBe("local-olive-oil")
    expect(result.cookingOil?.per100g.fat).toBe(100)
  })
  it("an unrelated branded provider hit is not the default when a named local record exists", async () => {
    const bouillon = { id: "off-1", name: "Vegan Bouillon powder", source: "open-food-facts", sourceId: "3017620422003", sourceLabel: "Open Food Facts", preparationState: "packaged", per100g: { calories: 250, protein: 5, carbs: 30, fat: 10 } }
    searchFood.mockResolvedValue({ foods: [bouillon], status: "results", usedFallback: false })
    identifyFoodsInImage.mockResolvedValue({ items: [{ name: "steamed chicken", estimatedGrams: 120, confidence: "high", preparation: "steamed", preparationCertain: true, dish: null }] })
    const result = await estimateMealFromPhoto("data:image/jpeg;base64,AA==")
    if (result.status !== "ok") throw new Error(result.status)
    expect(result.items[0].groundedFood?.id).toBe("local-chicken-breast-cooked")
    expect(result.items[0].candidates.map((food) => food.id)).toContain("off-1")
    expect(result.items[0].scaledMacros?.calories).toBeCloseTo(165 * 1.2, 0)
  })
  it("a branded product sharing the name is not the default for a photographed whole food", async () => {
    const yogurt = { id: "off-2", name: "Yogurt Bnine BANANA", brand: "Bnine", source: "open-food-facts", sourceId: "6111", sourceLabel: "Open Food Facts", preparationState: "packaged", per100g: { calories: 88, protein: 3, carbs: 14, fat: 2 } }
    searchFood.mockResolvedValue({ foods: [yogurt], status: "results", usedFallback: false })
    identifyFoodsInImage.mockResolvedValue({ items: [{ name: "banana", estimatedGrams: 120, confidence: "high", preparation: "raw", preparationCertain: true, dish: null }] })
    const result = await estimateMealFromPhoto("data:image/jpeg;base64,AA==")
    if (result.status !== "ok") throw new Error(result.status)
    expect(result.items[0].candidates.map((food) => food.id)).toEqual(["local-banana-raw", "off-2"])
  })

  it("an undecomposed Vietnamese dish becomes its catalog parts, each flagged as not seen, with no provider calls", async () => {
    identifyFoodsInImage.mockResolvedValue({ items: [{ name: "bún bò Huế", estimatedGrams: 900, confidence: "medium", preparation: "boiled", preparationCertain: true, dish: null }] })
    const result = await estimateMealFromPhoto("data:image/jpeg;base64,AA==")
    if (result.status !== "ok") throw new Error(result.status)
    expect(searchFood).not.toHaveBeenCalled()
    expect(result.items.length).toBeGreaterThan(5)
    expect(result.items.every((item) => item.fromTemplate && item.dish === "Bún bò Huế" && item.detectionConfidence === "low")).toBe(true)
    expect(result.items.find((item) => item.detectedName.startsWith("Pork roll"))?.optional).toBe(true)
    expect(result.items.map((item) => item.detectedName)).not.toContain("bún bò Huế") // the composite itself is never an item
  })
  it("a component of a catalog dish defaults to that dish's own record, even when a provider answers", async () => {
    const branded = { id: "off-3", name: "Beef jerky", brand: "X", source: "open-food-facts", sourceId: "123456", sourceLabel: "Open Food Facts", preparationState: "packaged", per100g: { calories: 410, protein: 33, carbs: 11, fat: 25 } }
    searchFood.mockResolvedValue({ foods: [branded], status: "results", usedFallback: false })
    identifyFoodsInImage.mockResolvedValue({ items: [
      { name: "sliced beef", estimatedGrams: 80, confidence: "high", preparation: "boiled", preparationCertain: true, dish: "Phở bò" },
      { name: "pho broth", estimatedGrams: 400, confidence: "medium", preparation: "boiled", preparationCertain: false, dish: "Phở bò" },
    ] })
    const result = await estimateMealFromPhoto("data:image/jpeg;base64,AA==")
    if (result.status !== "ok") throw new Error(result.status)
    expect(result.items[0].groundedFood?.id).toBe("local-beef-lean-cooked")
    expect(result.items[0].candidates.map((food) => food.id)).toContain("off-3")
    expect(result.items[1].groundedFood?.id).toBe("local-beef-broth")
    expect(result.items[1].noAddedOil).toBe(true)
  })
  it("USDA down: Vietnamese components still ground to reference records, and the failure is not a 'no match'", async () => {
    searchFood.mockResolvedValue({ foods: [], status: "provider_timeout", usedFallback: true })
    identifyFoodsInImage.mockResolvedValue({ items: [{ name: "rice vermicelli", estimatedGrams: 200, confidence: "high", preparation: "boiled", preparationCertain: true, dish: "Bún chả" }] })
    const result = await estimateMealFromPhoto("data:image/jpeg;base64,AA==")
    if (result.status !== "ok") throw new Error(result.status)
    expect(result.items[0].groundedFood?.id).toBe("local-rice-noodles-cooked")
    expect(result.items[0].searchStatus).toBe("provider_timeout")
    expect(result.items[0].scaledMacros?.calories).toBe(216)
  })
})
