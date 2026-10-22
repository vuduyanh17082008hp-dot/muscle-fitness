import { afterEach, describe, expect, it, vi } from "vitest"

import { getProductByBarcodeWithStatus } from "../open-food-facts"
import { lookupBarcode, searchFood } from "../index"
import { GET as barcodeRoute } from "@/app/api/nutrition/foods/barcode/route"

/**
 * Provider truth: a timeout or HTTP error is never reported (or cached) as
 * "this food doesn't exist". Each test uses its own barcode / query because
 * both adapters keep an in-process cache.
 */

const timeoutError = () => Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" })
const product = (name: string) => ({
  product: { product_name: name, nutriments: { "energy-kcal_100g": 400, proteins_100g: 10, carbohydrates_100g: 60, fat_100g: 12 } },
})
const usdaRow = (fdcId: number, description: string) => ({
  fdcId,
  description,
  dataType: "SR Legacy",
  foodNutrients: [
    { nutrientNumber: "208", value: 100 },
    { nutrientNumber: "203", value: 5 },
    { nutrientNumber: "204", value: 2 },
    { nutrientNumber: "205", value: 15 },
  ],
})

/** Routes fetch by host so USDA and Open Food Facts can fail independently. */
function stubProviders({ usda, off }: { usda: () => Promise<Response>; off: () => Promise<Response> }) {
  const fetchMock = vi.fn((url: string) => (String(url).includes("nal.usda.gov") ? usda() : off()))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("Open Food Facts barcode — outage is not 'not found'", () => {
  it("HTTP 503 → error, and is NOT cached: the next lookup after recovery finds the product", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(Response.json(product("Recovered Bar")))
    vi.stubGlobal("fetch", fetchMock)

    expect((await getProductByBarcodeWithStatus("5000112637922")).status).toBe("error")

    const second = await getProductByBarcodeWithStatus("5000112637922")
    expect(second.status).toBe("results")
    expect(second.value?.name).toBe("Recovered Bar")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("HTTP 404 → no_match (OFF's real unknown-product answer)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 404 })))
    expect(await getProductByBarcodeWithStatus("96385074")).toEqual({ status: "no_match", value: null })
  })

  it("timeout → provider_timeout through lookupBarcode", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeoutError()))
    expect(await lookupBarcode("036000291452")).toEqual({ status: "provider_timeout", food: null })
  })
})

describe("GET /api/nutrition/foods/barcode", () => {
  it("rejects an invalid check digit as invalid_input BEFORE any provider call", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const response = await barcodeRoute(new Request("http://localhost/api/nutrition/foods/barcode?code=5000159407237"))

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ ok: false, status: "invalid_input" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("a provider outage is a 503, not ok:true with food:null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad gateway", { status: 502 })))

    const response = await barcodeRoute(new Request("http://localhost/api/nutrition/foods/barcode?code=5000159407236"))

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ ok: false, status: "provider_error" })
  })
})

describe("searchFood cascade status", () => {
  it("empty query → invalid_input", async () => {
    expect((await searchFood("   ")).status).toBe("invalid_input")
  })

  it("both providers answer with nothing → no_match", async () => {
    vi.stubEnv("USDA_FDC_API_KEY", "test-key")
    stubProviders({ usda: async () => Response.json({ foods: [] }), off: async () => Response.json({ products: [] }) })

    const result = await searchFood("zzqx unknown dish one")
    expect(result).toMatchObject({ status: "no_match", usedFallback: true, providers: { usda: "no_match", "open-food-facts": "no_match" } })
  })

  it("USDA times out, OFF empty → provider_timeout, fallback disclosed as not a confirmed no-match", async () => {
    vi.stubEnv("USDA_FDC_API_KEY", "test-key")
    stubProviders({ usda: async () => { throw timeoutError() }, off: async () => Response.json({ products: [] }) })

    const result = await searchFood("zzqx unknown dish two")
    expect(result.status).toBe("provider_timeout")
    expect(result.usedFallback).toBe(true)
    expect(result.providers).toEqual({ usda: "timeout", "open-food-facts": "no_match" })
    expect(result.warning).toMatch(/isn't a confirmed "no match"/)
  })

  it("both providers error → provider_error", async () => {
    vi.stubEnv("USDA_FDC_API_KEY", "test-key")
    stubProviders({
      usda: async () => new Response("err", { status: 500 }),
      off: async () => new Response("err", { status: 500 }),
    })

    expect((await searchFood("zzqx unknown dish three")).status).toBe("provider_error")
  })

  it("USDA errors but OFF has results → results, with a degraded-coverage warning", async () => {
    vi.stubEnv("USDA_FDC_API_KEY", "test-key")
    stubProviders({
      usda: async () => new Response("err", { status: 500 }),
      off: async () => Response.json({ products: [{ code: "123", ...product("Kaya toast").product }] }),
    })

    const result = await searchFood("kaya toast zzqx")
    expect(result).toMatchObject({ status: "results", source: "open-food-facts", usedFallback: false })
    expect(result.warning).toMatch(/USDA didn't respond/)
  })

  it("USDA has results → results, no warning", async () => {
    vi.stubEnv("USDA_FDC_API_KEY", "test-key")
    stubProviders({ usda: async () => Response.json({ foods: [usdaRow(77, "Zzqx grain raw")] }), off: async () => Response.json({ products: [] }) })

    const result = await searchFood("zzqx grain raw")
    expect(result).toMatchObject({ status: "results", source: "usda" })
    expect(result.warning).toBeUndefined()
  })
})
