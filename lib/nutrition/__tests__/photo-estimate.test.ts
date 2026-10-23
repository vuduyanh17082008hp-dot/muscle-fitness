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
})
