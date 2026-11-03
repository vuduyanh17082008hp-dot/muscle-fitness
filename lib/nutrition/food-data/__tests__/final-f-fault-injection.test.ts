import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const identifyFoodsInImage = vi.fn()
vi.mock("@/lib/ai/vision-client", async (original) => ({
  ...(await original<typeof import("@/lib/ai/vision-client")>()),
  identifyFoodsInImage: (...args: unknown[]) => identifyFoodsInImage(...args),
  isVisionConfigured: () => true,
}))

// These tests exercise provider truth inside the route; the auth + rate-limit gate (QA-05) is tested separately.
vi.mock("@/lib/nutrition/food-data/lookup-guard", () => ({ guardFoodLookup: async () => null }))

import { searchFood } from "../index"
import { getProductByBarcodeWithStatus } from "../open-food-facts"
import { resetProviderFetchState } from "../provider-fetch"
import { GET as searchRoute } from "@/app/api/nutrition/foods/search/route"
import { estimateMealFromPhoto } from "@/lib/nutrition/photo-estimate"
import { reviewFoodMatch } from "@/lib/nutrition/photo-match-review"

/**
 * FINAL-F WP-F1: NUT-EXT-01..08 fault injection at the provider boundary (fetch).
 * Every case uses its own query: both adapters keep an in-process cache.
 */

const dnsError = (code: "ENOTFOUND" | "EAI_AGAIN") =>
  Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error(`getaddrinfo ${code} api.nal.usda.gov`), { code }) })
const timeoutError = () => Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" })
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
const offProduct = (code: string, name: string) => ({
  code,
  product_name: name,
  nutriments: { "energy-kcal_100g": 400, proteins_100g: 10, carbohydrates_100g: 60, fat_100g: 12 },
})

type Handler = (url: URL, init?: RequestInit) => Promise<Response>
function stubProviders({ usda, off }: { usda: Handler; off: Handler }) {
  const fetchMock = vi.fn((input: string, init?: RequestInit) => {
    const url = new URL(String(input))
    return url.hostname.includes("nal.usda.gov") ? usda(url, init) : off(url, init)
  })
  vi.stubGlobal("fetch", fetchMock)
  const calls = (host: string) => fetchMock.mock.calls.filter(([u]) => String(u).includes(host)).length
  return { fetchMock, usdaCalls: () => calls("nal.usda.gov"), offCalls: () => calls("openfoodfacts") }
}

let warn: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  resetProviderFetchState()
  vi.stubEnv("USDA_FDC_API_KEY", "test-key")
  warn = vi.spyOn(console, "warn").mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  warn.mockRestore()
})

describe("1. USDA DNS failure while OFF works", () => {
  it("ENOTFOUND: one USDA attempt (no retry), OFF results returned, marked partial and attributed", async () => {
    const p = stubProviders({
      usda: async () => { throw dnsError("ENOTFOUND") },
      off: async () => Response.json({ products: [offProduct("111", "Zqa dns oats")] }),
    })
    const result = await searchFood("zqa dns oats")
    expect(result).toMatchObject({ status: "results", source: "open-food-facts", usedFallback: false, partial: true, providers: { usda: "error", "open-food-facts": "results" } })
    expect(result.foods[0]).toMatchObject({ source: "open-food-facts", sourceLabel: "Open Food Facts" })
    expect(result.warning).toBe("USDA was unavailable — results may be incomplete.")
    expect(p.usdaCalls()).toBe(1)
  })

  it("EAI_AGAIN is transient: retried once, and the retry's real answer is used", async () => {
    let n = 0
    const p = stubProviders({
      usda: async () => (n++ === 0 ? Promise.reject(dnsError("EAI_AGAIN")) : Response.json({ foods: [usdaRow(901, "Zqa retry rice raw")] })),
      off: async () => Response.json({ products: [] }),
    })
    const result = await searchFood("zqa retry rice raw")
    expect(result).toMatchObject({ status: "results", source: "usda", partial: false })
    expect(p.usdaCalls()).toBe(2)
  })

  it("the failure is one summary line, not a stack dump, and repeats inside a minute are counted not printed", async () => {
    stubProviders({ usda: async () => { throw dnsError("ENOTFOUND") }, off: async () => Response.json({ products: [] }) })
    await searchFood("zqa log one")
    await searchFood("zqa log two")
    await searchFood("zqa log three")
    const usdaLines = warn.mock.calls.filter(([line]) => String(line).startsWith("[USDA]"))
    expect(usdaLines).toEqual([["[USDA] search unavailable: dns ENOTFOUND"]])
  })
})

describe("2. OFF HTTP 503 while USDA works", () => {
  it("packaged query: OFF 503 is not retried, USDA answers, result is partial", async () => {
    const p = stubProviders({
      usda: async () => Response.json({ foods: [usdaRow(902, "Zqa protein bar")] }),
      off: async () => new Response("busy", { status: 503 }),
    })
    const result = await searchFood("zqa protein bar")
    expect(result).toMatchObject({ status: "results", source: "usda", partial: true, providers: { "open-food-facts": "error", usda: "results" } })
    expect(result.warning).toMatch(/Open Food Facts was unavailable/)
    expect(p.offCalls()).toBe(1)
  })

  it("503 with Retry-After (and any 429) pauses OFF: the next call fails fast without a request", async () => {
    const p = stubProviders({
      usda: async () => Response.json({ foods: [] }),
      off: async () => new Response("slow down", { status: 429, headers: { "Retry-After": "30" } }),
    })
    expect((await getProductByBarcodeWithStatus("4006381333931")).status).toBe("error")
    expect((await getProductByBarcodeWithStatus("4006381333931")).status).toBe("error")
    expect(p.offCalls()).toBe(1)
  })

  it("503 without Retry-After does not pause: recovery is picked up on the next call", async () => {
    let n = 0
    stubProviders({
      usda: async () => Response.json({ foods: [] }),
      off: async () => (n++ === 0 ? new Response("busy", { status: 503 }) : Response.json({ products: [offProduct("222", "Zqa recover snack")] })),
    })
    expect((await searchFood("zqa recover snack", "packaged")).status).toBe("provider_error")
    expect((await searchFood("zqa recover snack", "packaged")).status).toBe("results")
  })
})

describe("3. both providers unavailable", () => {
  it("never 'not found': provider_error, partial, local data labelled as local, honest when local is empty too", async () => {
    stubProviders({ usda: async () => { throw dnsError("ENOTFOUND") }, off: async () => new Response("busy", { status: 503 }) })
    const nothing = await searchFood("zqa nothing anywhere")
    expect(nothing).toMatchObject({ status: "provider_error", usedFallback: true, partial: true, foods: [] })
    expect(nothing.warning).toMatch(/isn't a confirmed "no match"\. No local fallback data either; try again shortly\./)

    const rice = await searchFood("white rice")
    expect(rice.status).toBe("provider_error")
    expect(rice.foods.length).toBeGreaterThan(0)
    // Local rows say what they are ("Local fallback", "USDA SR Legacy #… (offline copy)", "Curated estimate").
    expect(rice.foods.every((food) => food.source === "local" && /Local fallback|offline copy|Curated estimate/.test(food.sourceLabel))).toBe(true)
    expect(rice.warning).toMatch(/Showing local fallback data/)
  })

  it("the search route answers 200 with a truthful degraded body (local or empty), not a fake success", async () => {
    stubProviders({ usda: async () => { throw dnsError("ENOTFOUND") }, off: async () => new Response("busy", { status: 503 }) })
    const response = await searchRoute(new Request("http://localhost/api/nutrition/foods/search?q=zqa%20route%20down"))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, status: "provider_error", partial: true, usedFallback: true, foods: [] })
  })
})

describe("4. USDA malformed request / HTTP 400", () => {
  it("400 is 'rejected': never retried, never cached, reported as a failure, not as no-match", async () => {
    const p = stubProviders({ usda: async () => new Response("bad request", { status: 400 }), off: async () => Response.json({ products: [] }) })
    const first = await searchFood("zqa bad request")
    expect(first).toMatchObject({ status: "provider_error", providers: { usda: "rejected", "open-food-facts": "no_match" } })
    expect(first.warning).toMatch(/USDA rejected the search/)
    expect(p.usdaCalls()).toBe(1)
    await searchFood("zqa bad request")
    expect(p.usdaCalls()).toBe(2)
  })

  it("query-syntax characters are stripped before USDA sees them; Vietnamese letters are kept", async () => {
    const seen: string[] = []
    stubProviders({
      usda: async (url) => { seen.push(url.searchParams.get("query") ?? ""); return Response.json({ foods: [] }) },
      off: async () => Response.json({ products: [] }),
    })
    await searchFood('bánh "mì" (pate) [x]: ~1')
    expect(seen).toEqual(["bánh mì pate x 1"])
  })
})

describe("5. slow provider / timeout", () => {
  it("every request carries an abort signal (the time budget), and a timeout is provider_timeout, not retried", async () => {
    const signals: unknown[] = []
    const p = stubProviders({
      usda: async (_url, init) => { signals.push(init?.signal); throw timeoutError() },
      off: async (_url, init) => { signals.push(init?.signal); return Response.json({ products: [] }) },
    })
    const result = await searchFood("zqa slow lentils")
    expect(result).toMatchObject({ status: "provider_timeout", providers: { usda: "timeout" } })
    expect(signals.every((s) => s instanceof AbortSignal)).toBe(true)
    expect(p.usdaCalls()).toBe(1)
  })

  it("an aborted caller (browser left) starts no further provider request", async () => {
    const controller = new AbortController()
    const p = stubProviders({
      usda: async () => { controller.abort(); return Response.json({ foods: [] }) },
      off: async () => Response.json({ products: [] }),
    })
    await searchFood("zqa abandoned", "any", { signal: controller.signal })
    expect(p.usdaCalls()).toBe(1)
    expect(p.offCalls()).toBe(0)
  })
})

describe("6/7. rapid Vietnamese typing and concurrent identical searches", () => {
  it("one-character queries are refused before any provider call", async () => {
    const p = stubProviders({ usda: async () => Response.json({ foods: [] }), off: async () => Response.json({ products: [] }) })
    const response = await searchRoute(new Request("http://localhost/api/nutrition/foods/search?q=b"))
    expect(response.status).toBe(400)
    expect(p.fetchMock).not.toHaveBeenCalled()
  })

  it("five identical in-flight searches share one upstream request per provider", async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    const p = stubProviders({
      usda: async () => { await gate; return Response.json({ foods: [usdaRow(903, "Zqa pho noodles")] }) },
      off: async () => Response.json({ products: [] }),
    })
    const pending = Promise.all(Array.from({ length: 5 }, () => searchFood("zqa pho noodles")))
    release()
    const results = await pending
    expect(results.every((r) => r.status === "results" && r.foods[0]?.sourceId === "903")).toBe(true)
    expect(p.usdaCalls()).toBe(1)
  })
})

describe("9. photo estimate without external database matches", () => {
  it("an outage leaves the item unmatched with an outage status (never a made-up macro), and a partial hit is flagged", async () => {
    identifyFoodsInImage.mockResolvedValue({
      items: [
        { name: "zqa mystery stew", estimatedGrams: 300, confidence: "medium", preparation: "unknown", preparationCertain: false, dish: null },
      ],
    })
    stubProviders({ usda: async () => { throw dnsError("ENOTFOUND") }, off: async () => new Response("busy", { status: 503 }) })
    const down = await estimateMealFromPhoto("data:image/jpeg;base64,AA==")
    expect(down.status).toBe("ok")
    if (down.status !== "ok") return
    expect(down.items[0]).toMatchObject({ groundedFood: null, scaledMacros: null, searchStatus: "provider_error", searchPartial: true })

    const flags = reviewFoodMatch("oats", { id: "off-1", name: "Oats", source: "open-food-facts", sourceLabel: "Open Food Facts", preparationState: "packaged", per100g: { calories: 380, protein: 13, carbs: 60, fat: 7 } }, "results", true)
    expect(flags.map((f) => f.kind)).toContain("degraded_search")
  })
})

describe("10. cached valid result during a provider outage", () => {
  it("a USDA hit cached before the outage is served during it; failures are never cached", async () => {
    let down = false
    const p = stubProviders({
      usda: async () => (down ? Promise.reject(dnsError("ENOTFOUND")) : Response.json({ foods: [usdaRow(904, "Zqa cached millet raw")] })),
      off: async () => Response.json({ products: [] }),
    })
    expect((await searchFood("zqa cached millet raw")).source).toBe("usda")
    down = true
    const during = await searchFood("zqa cached millet raw")
    expect(during).toMatchObject({ status: "results", source: "usda", partial: false })
    expect(during.foods[0].sourceId).toBe("904")
    expect(p.usdaCalls()).toBe(1)
  })
})
