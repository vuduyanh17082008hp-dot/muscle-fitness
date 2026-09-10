import "server-only"

/**
 * Open Food Facts adapter — used for packaged / branded foods only
 * (see docs/NUTRITION_DATA_SOURCES.md for the raw-vs-packaged source
 * hierarchy).
 *
 * Official docs: https://openfoodfacts.github.io/openfoodfacts-server/api/
 * - Barcode lookup uses API v3 (current recommended version):
 *   GET https://world.openfoodfacts.org/api/v3/product/{barcode}.json
 * - Text search uses the long-standing search endpoint
 *   (world.openfoodfacts.org/cgi/search.pl?...&json=1), the same
 *   endpoint already used by app/api/chatbot/route.ts's Dante
 *   integration — reused here rather than introducing a second
 *   search implementation.
 * - No authentication for reads; a descriptive User-Agent is
 *   required instead ("AppName/Version (contact)").
 * - Rate limits: ~10 req/min for search, ~15 req/min for product
 *   reads, per IP. This module never fires on every keystroke —
 *   callers must use an explicit search action and results are
 *   cached (see CACHE_TTL_MS below).
 * - License: Open Database License (ODbL) for data. Attribution is
 *   required and surfaced in the app's Nutrition Data Sources
 *   section.
 */

import type { FoodPreparationState, NormalizedFood } from "./types"

const SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl"
const PRODUCT_URL_V3 = "https://world.openfoodfacts.org/api/v3/product"

const REQUEST_TIMEOUT_MS = 7000
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes — avoid hammering OFF for repeat queries.

function getUserAgent(): string {
  return (
    process.env.OPENFOODFACTS_USER_AGENT?.trim() ||
    "MuscleFitness/1.0 (info@musclefitness.app)"
  )
}

type CacheEntry = { expiresAt: number; value: NormalizedFood[] | NormalizedFood | null }
const cache = new Map<string, CacheEntry>()

function getCached<T>(key: string): T | undefined {
  const entry = cache.get(key)
  if (!entry) return undefined
  if (entry.expiresAt < Date.now()) {
    cache.delete(key)
    return undefined
  }
  return entry.value as T
}

function setCached(key: string, value: NormalizedFood[] | NormalizedFood | null): void {
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value })
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": getUserAgent() },
      cache: "no-store",
    })
  } finally {
    clearTimeout(timer)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function toNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function inferPreparationState(): FoodPreparationState {
  // Every Open Food Facts product is, by definition, a packaged/branded item.
  return "packaged"
}

function normalizeProduct(
  code: string,
  product: Record<string, unknown>,
): NormalizedFood | null {
  const name = typeof product.product_name === "string" ? product.product_name.trim() : ""
  const nutriments = isRecord(product.nutriments) ? product.nutriments : {}

  const calories = toNumberOrNull(nutriments["energy-kcal_100g"])
  const protein = toNumberOrNull(nutriments["proteins_100g"])
  const carbs = toNumberOrNull(nutriments["carbohydrates_100g"])
  const fat = toNumberOrNull(nutriments["fat_100g"])

  if (!name || calories === null || protein === null || carbs === null || fat === null) {
    return null
  }

  const sodiumGrams = toNumberOrNull(nutriments["sodium_100g"])

  return {
    id: `off-${code}`,
    name,
    source: "open-food-facts",
    sourceId: code,
    sourceLabel: "Open Food Facts",
    preparationState: inferPreparationState(),
    per100g: {
      calories,
      protein,
      carbs,
      fat,
      fiber: toNumberOrNull(nutriments["fiber_100g"]),
      sugar: toNumberOrNull(nutriments["sugars_100g"]),
      sodiumMg: sodiumGrams === null ? null : Math.round(sodiumGrams * 1000),
    },
    brand: typeof product.brands === "string" ? product.brands.split(",")[0]?.trim() ?? null : null,
    barcode: code,
    rawDescription: typeof product.generic_name === "string" ? product.generic_name : name,
    retrievedAt: new Date().toISOString(),
    confidence: "medium",
  }
}

export async function searchPackagedFood(
  query: string,
  limit = 5,
): Promise<NormalizedFood[]> {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) return []

  const cacheKey = `search:${trimmedQuery.toLowerCase()}:${limit}`
  const cached = getCached<NormalizedFood[]>(cacheKey)
  if (cached) return cached

  const url = new URL(SEARCH_URL)
  url.searchParams.set("search_terms", trimmedQuery)
  url.searchParams.set("search_simple", "1")
  url.searchParams.set("action", "process")
  url.searchParams.set("json", "1")
  url.searchParams.set("page_size", String(Math.min(Math.max(limit, 1), 20)))
  url.searchParams.set(
    "fields",
    "code,product_name,generic_name,brands,nutriments",
  )

  try {
    const response = await fetchWithTimeout(url.toString())

    if (!response.ok) {
      console.warn(`[OpenFoodFacts] search failed: HTTP ${response.status}`)
      setCached(cacheKey, [])
      return []
    }

    const data: unknown = await response.json()

    if (!isRecord(data) || !Array.isArray(data.products)) {
      setCached(cacheKey, [])
      return []
    }

    const results: NormalizedFood[] = []

    for (const product of data.products) {
      if (!isRecord(product)) continue
      const code = typeof product.code === "string" ? product.code : null
      if (!code) continue

      const normalized = normalizeProduct(code, product)
      if (normalized) results.push(normalized)

      if (results.length >= limit) break
    }

    setCached(cacheKey, results)
    return results
  } catch (error) {
    console.warn("[OpenFoodFacts] search error:", error)
    return []
  }
}

export async function getProductByBarcode(barcode: string): Promise<NormalizedFood | null> {
  const trimmedBarcode = barcode.trim()
  if (!trimmedBarcode) return null

  const cacheKey = `barcode:${trimmedBarcode}`
  const cached = getCached<NormalizedFood | null>(cacheKey)
  if (cached !== undefined) return cached

  const url = new URL(`${PRODUCT_URL_V3}/${encodeURIComponent(trimmedBarcode)}.json`)
  url.searchParams.set(
    "fields",
    "code,product_name,generic_name,brands,nutriments",
  )

  try {
    const response = await fetchWithTimeout(url.toString())

    if (!response.ok) {
      console.warn(`[OpenFoodFacts] barcode lookup failed: HTTP ${response.status}`)
      setCached(cacheKey, null)
      return null
    }

    const data: unknown = await response.json()

    if (!isRecord(data) || !isRecord(data.product)) {
      setCached(cacheKey, null)
      return null
    }

    const normalized = normalizeProduct(trimmedBarcode, data.product)
    setCached(cacheKey, normalized)
    return normalized
  } catch (error) {
    console.warn("[OpenFoodFacts] barcode lookup error:", error)
    return null
  }
}
