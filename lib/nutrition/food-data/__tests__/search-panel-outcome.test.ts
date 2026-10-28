import { afterEach, describe, expect, it, vi } from "vitest"

import { searchFood } from "../index"
import { readFoodSearchResponse } from "../types"

/**
 * NUT-EXT-09: what the food search panel shows for a real searchFood() answer.
 * An unconfigured provider never searched, so an empty answer must read as
 * "couldn't search everything", not "No matches found". Queries are unique
 * per test because both adapters keep an in-process cache.
 */

const timeoutError = () => Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" })
const offProduct = (name: string) => ({
  code: "8801234",
  product_name: name,
  nutriments: { "energy-kcal_100g": 250, proteins_100g: 20, carbohydrates_100g: 10, fat_100g: 14 },
})

function stubProviders({ usda, off }: { usda: () => Promise<Response>; off: () => Promise<Response> }) {
  const fetchMock = vi.fn((url: string) => (String(url).includes("nal.usda.gov") ? usda() : off()))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

const panel = async (query: string) => readFoodSearchResponse(await searchFood(query))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("food search panel outcome", () => {
  it("USDA unconfigured, OFF empty, no local result → unavailable state, provider warning kept", async () => {
    vi.stubEnv("USDA_FDC_API_KEY", "")
    const fetchMock = stubProviders({ usda: async () => Response.json({ foods: [] }), off: async () => Response.json({ products: [] }) })

    const result = await searchFood("zzqx raw grain alpha")
    expect(result).toMatchObject({ status: "no_match", foods: [], providers: { usda: "unconfigured", "open-food-facts": "no_match" } })
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("nal.usda.gov"))).toBe(false)

    const outcome = readFoodSearchResponse(result)
    expect(outcome.state).toBe("error")
    expect(outcome.notice?.degraded).toBe(true)
    expect(outcome.notice?.text).toContain("USDA_FDC_API_KEY is not configured")
    expect(outcome.notice?.text).toContain(`isn't a confirmed "no match"`)
  })

  it("USDA unconfigured, OFF has results → results, flagged as possibly incomplete", async () => {
    vi.stubEnv("USDA_FDC_API_KEY", "")
    stubProviders({ usda: async () => Response.json({ foods: [] }), off: async () => Response.json({ products: [offProduct("Zzqx kimchi beta")] }) })

    const outcome = await panel("zzqx kimchi beta")
    expect(outcome.state).toBe("results")
    expect(outcome.notice).toEqual({ degraded: true, text: "USDA isn't set up here, so results may be incomplete." })
  })

  it("USDA times out, OFF has results → results with the server's degraded warning (unchanged)", async () => {
    vi.stubEnv("USDA_FDC_API_KEY", "test-key")
    stubProviders({ usda: async () => { throw timeoutError() }, off: async () => Response.json({ products: [offProduct("Zzqx kimchi gamma")] }) })

    const outcome = await panel("zzqx kimchi gamma")
    expect(outcome.state).toBe("results")
    expect(outcome.notice?.degraded).toBe(true)
    expect(outcome.notice?.text).toMatch(/USDA timed out — results may be incomplete\.$/)
  })

  it("all providers answered, nothing found → genuine no-match (empty, not degraded)", async () => {
    vi.stubEnv("USDA_FDC_API_KEY", "test-key")
    stubProviders({ usda: async () => Response.json({ foods: [] }), off: async () => Response.json({ products: [] }) })

    const outcome = await panel("zzqx raw grain delta")
    expect(outcome.state).toBe("empty")
    expect(outcome.notice?.degraded ?? false).toBe(false)
  })

  it("USDA unconfigured and OFF errors → unavailable, both gaps named", async () => {
    vi.stubEnv("USDA_FDC_API_KEY", "")
    stubProviders({ usda: async () => Response.json({ foods: [] }), off: async () => new Response("err", { status: 500 }) })

    const result = await searchFood("zzqx raw grain epsilon")
    expect(result.providers).toEqual({ usda: "unconfigured", "open-food-facts": "error" })
    const outcome = readFoodSearchResponse(result)
    expect(outcome.state).toBe("error")
    expect(outcome.notice?.degraded).toBe(true)
    expect(outcome.notice?.text).toContain(`Open Food Facts was unavailable — this isn't a confirmed "no match".`)
    expect(outcome.notice?.text).toMatch(/USDA isn't set up here\.$/)
  })

  it("timeout and error with no results keep the server warning verbatim (unchanged behavior)", async () => {
    vi.stubEnv("USDA_FDC_API_KEY", "test-key")
    stubProviders({ usda: async () => { throw timeoutError() }, off: async () => new Response("err", { status: 500 }) })

    const result = await searchFood("zzqx raw grain zeta")
    expect(result.status).toBe("provider_timeout")
    expect(readFoodSearchResponse(result)).toEqual({ state: "error", notice: { text: result.warning, degraded: true } })

    stubProviders({ usda: async () => new Response("err", { status: 500 }), off: async () => new Response("err", { status: 500 }) })
    const errored = await searchFood("zzqx raw grain eta")
    expect(errored.status).toBe("provider_error")
    expect(readFoodSearchResponse(errored)).toEqual({ state: "error", notice: { text: errored.warning, degraded: true } })
  })
})
