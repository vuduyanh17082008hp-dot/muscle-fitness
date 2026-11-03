import { afterEach, describe, expect, it, vi } from "vitest"

import { searchLocalFallback } from "@/lib/nutrition/food-data/local-fallback"
import { nutrientProvenance } from "@/lib/nutrition/photo-match-review"
import {
  VIETNAMESE_DISHES,
  dishDefaultTotals,
  matchVietnameseDish,
  resolveDishComponents,
  searchVietnameseDishes,
  sumComponentMacros,
  templateItems,
} from "@/lib/nutrition/vietnamese-dishes"

afterEach(() => vi.restoreAllMocks())

const REQUIRED = ["Phở bò", "Phở gà", "Bún bò Huế", "Bún chả", "Bún thịt nướng", "Cơm tấm sườn", "Cơm gà", "Bánh mì thịt", "Bánh mì trứng", "Bún riêu", "Hủ tiếu", "Mì Quảng", "Gỏi cuốn", "Bánh cuốn", "Cháo gà"]

describe("Vietnamese dish catalog", () => {
  it("has the 15 required dishes, Vietnamese names kept with their diacritics, and an English name", () => {
    expect(VIETNAMESE_DISHES.map((dish) => dish.nameVi)).toEqual(REQUIRED)
    for (const dish of VIETNAMESE_DISHES) expect(dish.nameEn.length).toBeGreaterThan(3)
  })

  it("every component resolves to an offline record that is either verified reference data or a stated estimate", () => {
    for (const dish of VIETNAMESE_DISHES) {
      for (const part of resolveDishComponents(dish)) {
        const tier = nutrientProvenance(part.food)
        expect(["VERIFIED_REFERENCE", "CURATED_ESTIMATE"], `${dish.id}/${part.label}`).toContain(tier)
        if (tier === "CURATED_ESTIMATE") expect(part.food.estimationReason).toMatch(/No USDA record/)
        else expect(part.food.rawDescription).toMatch(/USDA FDC \d+/)
      }
    }
  })

  it("is searchable by Vietnamese with or without diacritics and by English/menu names", () => {
    const ids = (q: string) => searchVietnameseDishes(q).map((dish) => dish.id)
    expect(ids("bun bo")).toEqual(["bun_bo_hue"])
    expect(ids("Bún bò Huế")).toEqual(["bun_bo_hue"])
    expect(ids("phở gà")).toEqual(["pho_ga"])
    expect(ids("pho")).toEqual(expect.arrayContaining(["pho_bo", "pho_ga"]))
    expect(ids("broken rice")).toEqual(["com_tam_suon"])
    expect(ids("fresh spring rolls")).toEqual(["goi_cuon"])
    expect(ids("pizza")).toEqual([])
  })

  it("matches a free-text dish name to the most specific catalog dish, never a bare ingredient", () => {
    expect(matchVietnameseDish("chicken pho")?.id).toBe("pho_ga")
    expect(matchVietnameseDish("Phở Bò Tái Nạm")?.id).toBe("pho_bo")
    expect(matchVietnameseDish("Bánh Mì Trứng ốp la")?.id).toBe("banh_mi_trung")
    expect(matchVietnameseDish("bánh mì đặc biệt")?.id).toBe("banh_mi_thit")
    expect(matchVietnameseDish("CƠM TẤM SƯỜN BÌ CHẢ")?.id).toBe("com_tam_suon")
    expect(matchVietnameseDish("broken rice")).toBeNull()
    expect(matchVietnameseDish("congee")).toBeNull()
    expect(matchVietnameseDish("Hainanese chicken rice")).toBeNull()
    expect(matchVietnameseDish(null)).toBeNull()
  })

  it("a dish total is exactly the sum of its components and scales linearly with the portion", () => {
    const pho = VIETNAMESE_DISHES.find((dish) => dish.id === "pho_bo")!
    expect(pho).not.toHaveProperty("per100g")
    const parts = resolveDishComponents(pho).filter((part) => !part.optional)
    expect(dishDefaultTotals(pho)).toEqual(sumComponentMacros(parts))
    // noodles 200 g × 108 + beef 80 × 166 + broth 400 × 7 + sprouts 30 × 30 + basil 5 × 23 + onion 15 × 40 + scallion 5 × 32
    expect(dishDefaultTotals(pho).calories).toBe(Math.round(216 + 132.8 + 28 + 9 + 1.2 + 6 + 1.6))
    const one = dishDefaultTotals(pho, 1)
    const two = dishDefaultTotals(pho, 2)
    expect(two.calories).toBeGreaterThanOrEqual(one.calories * 2 - 2)
    expect(two.calories).toBeLessThanOrEqual(one.calories * 2 + 2)
    expect(two.protein).toBeCloseTo(one.protein * 2, 0)
  })

  it("optional parts (brisket, hoisin, fried egg) start unticked and are not in the default total", () => {
    const pho = VIETNAMESE_DISHES.find((dish) => dish.id === "pho_bo")!
    const items = templateItems(pho, 800)
    expect(items.filter((item) => item.optional).map((item) => item.detectedName)).toEqual(["Brisket (nạm)", "Hoisin sauce"])
    expect(items.every((item) => item.fromTemplate && item.detectionConfidence === "low")).toBe(true)
    expect(items.find((item) => item.detectedName === "Broth")?.noAddedOil).toBe(true)
  })

  it("template portion follows the photo guess but is clamped (0.5×–2×)", () => {
    const bunCha = VIETNAMESE_DISHES.find((dish) => dish.id === "bun_cha")!
    const grams = (seen: number) => templateItems(bunCha, seen).find((item) => item.detectedName.startsWith("Rice vermicelli"))!.estimatedGrams
    expect(grams(10)).toBe(100)
    expect(grams(100000)).toBe(400)
  })

  it("works with no network at all: components and fallback search never call fetch", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    for (const dish of VIETNAMESE_DISHES) dishDefaultTotals(dish)
    expect(searchLocalFallback("rice vermicelli")[0]?.id).toBe("local-rice-noodles-cooked")
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
