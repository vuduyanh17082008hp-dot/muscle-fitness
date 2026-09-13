import { afterEach, describe, expect, it, vi } from "vitest"

import { getProductByBarcode } from "@/lib/nutrition/food-data/open-food-facts"

/**
 * "Known packaged barcode" (spec Part "10. TESTS"). Exercises the real
 * adapter logic (normalization, per100g mapping) against a mocked
 * Open Food Facts v3 response — no real network call.
 */

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 404,
    json: async () => body,
  } as Response
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("getProductByBarcode — known packaged barcode", () => {
  it("normalizes a complete Open Food Facts product into the shared NormalizedFood shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        product: {
          code: "7622210951353",
          product_name: "Oreo Original",
          brands: "Oreo,Mondelez",
          generic_name: "Chocolate sandwich cookies",
          serving_quantity: 29,
          nutriments: {
            "energy-kcal_100g": 480,
            proteins_100g: 5.2,
            carbohydrates_100g: 68,
            fat_100g: 20,
            fiber_100g: 2.8,
            sugars_100g: 38,
            sodium_100g: 0.4,
          },
        },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const food = await getProductByBarcode("7622210951353")

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(food).not.toBeNull()
    expect(food?.name).toBe("Oreo Original")
    expect(food?.source).toBe("open-food-facts")
    expect(food?.barcode).toBe("7622210951353")
    expect(food?.brand).toBe("Oreo")
    expect(food?.per100g).toEqual({
      calories: 480,
      protein: 5.2,
      carbs: 68,
      fat: 20,
      fiber: 2.8,
      sugar: 38,
      sodiumMg: 400,
    })
    expect(food?.servingSizeGrams).toBe(29)
  })

  it("returns null (not an error) for a barcode with no matching product", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false)))

    const food = await getProductByBarcode("0000000000000")

    expect(food).toBeNull()
  })

  it("returns null when the response has no product_name to key off", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ product: { nutriments: { "energy-kcal_100g": 100 } } })),
    )

    const food = await getProductByBarcode("1111111111111")

    expect(food).toBeNull()
  })
})
