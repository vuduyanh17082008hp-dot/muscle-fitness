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

import { classifyProviderError, type FoodPreparationState, type NormalizedFood, type ProviderOutcome } from "./types"
import { fillMissingMacrosFromUsda, type PartialMacros } from "./estimate"
import { logProviderFailure, providerFetch, sharedInFlight } from "./provider-fetch"

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

const inFlight = new Map<string, Promise<ProviderOutcome<NormalizedFood[]>>>()

function fetchOff(url: string, acceptStatus?: number[]): Promise<Response> {
  return providerFetch("OpenFoodFacts", url, { timeoutMs: REQUEST_TIMEOUT_MS, headers: { "User-Agent": getUserAgent() }, acceptStatus })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function toNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null
}

/** Volumes are not masses: never prefill ml as grams without a density. */
function servingGrams(product: Record<string, unknown>): number | null {
  const raw = product.serving_quantity
  const amount = toNumberOrNull(typeof raw === "string" && /^\d+(?:\.\d+)?$/.test(raw.trim()) ? Number(raw) : raw)
  const unit = product.serving_quantity_unit
  return amount !== null && amount > 0 && unit === "g" ? amount : null
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
    servingSizeGrams: servingGrams(product),
    rawDescription: typeof product.generic_name === "string" ? product.generic_name : name,
    retrievedAt: new Date().toISOString(),
    confidence: "medium",
  }
}

export async function searchPackagedFood(
  query: string,
  limit = 5,
): Promise<NormalizedFood[]> {
  return (await searchPackagedFoodWithStatus(query, limit)).value
}

export async function searchPackagedFoodWithStatus(
  query: string,
  limit = 5,
): Promise<ProviderOutcome<NormalizedFood[]>> {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) return { status: "no_match", value: [] }

  const cacheKey = `search:${trimmedQuery.toLowerCase()}:${limit}`
  const cached = getCached<NormalizedFood[]>(cacheKey)
  if (cached) return { status: cached.length > 0 ? "results" : "no_match", value: cached }

  return sharedInFlight(inFlight, cacheKey, () => fetchOffSearch(trimmedQuery, limit, cacheKey))
}

async function fetchOffSearch(trimmedQuery: string, limit: number, cacheKey: string): Promise<ProviderOutcome<NormalizedFood[]>> {
  const url = new URL(SEARCH_URL)
  url.searchParams.set("search_terms", trimmedQuery)
  url.searchParams.set("search_simple", "1")
  url.searchParams.set("action", "process")
  url.searchParams.set("json", "1")
  url.searchParams.set("page_size", String(Math.min(Math.max(limit, 1), 20)))
  url.searchParams.set(
    "fields",
    "code,product_name,generic_name,brands,nutriments,serving_quantity,serving_quantity_unit",
  )

  try {
    // Failures throw and are never cached: a provider outage must not read as "no such food" for the cache TTL.
    const response = await fetchOff(url.toString())
    const data: unknown = await response.json()

    if (!isRecord(data) || !Array.isArray(data.products)) {
      return { status: "error", value: [] }
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
    return { status: results.length > 0 ? "results" : "no_match", value: results }
  } catch (error) {
    logProviderFailure("OpenFoodFacts", "search", error)
    return { status: classifyProviderError(error), value: [] }
  }
}

type PartialProduct = {
  name: string
  brand: string | null
  rawDescription: string | null
  servingSizeGrams: number | null
  macros: PartialMacros
}

/**
 * Like `normalizeProduct`, but never discards a product just because
 * some macro fields are missing — the caller decides whether/how to
 * fill the gaps (see `getProductByBarcode`'s USDA-grounded fallback).
 * Returns null only when the product has no usable name at all.
 */
function extractPartialProduct(product: Record<string, unknown>): PartialProduct | null {
  const name = typeof product.product_name === "string" ? product.product_name.trim() : ""

  if (!name) {
    return null
  }

  const nutriments = isRecord(product.nutriments) ? product.nutriments : {}
  const sodiumGrams = toNumberOrNull(nutriments["sodium_100g"])

  return {
    name,
    brand: typeof product.brands === "string" ? product.brands.split(",")[0]?.trim() ?? null : null,
    rawDescription: typeof product.generic_name === "string" ? product.generic_name : name,
    servingSizeGrams: servingGrams(product),
    macros: {
      calories: toNumberOrNull(nutriments["energy-kcal_100g"]),
      protein: toNumberOrNull(nutriments["proteins_100g"]),
      carbs: toNumberOrNull(nutriments["carbohydrates_100g"]),
      fat: toNumberOrNull(nutriments["fat_100g"]),
      fiber: toNumberOrNull(nutriments["fiber_100g"]),
      sugar: toNumberOrNull(nutriments["sugars_100g"]),
      sodiumMg: sodiumGrams === null ? null : Math.round(sodiumGrams * 1000),
    },
  }
}

export async function getProductByBarcode(barcode: string): Promise<NormalizedFood | null> {
  return (await getProductByBarcodeWithStatus(barcode)).value
}

export async function getProductByBarcodeWithStatus(barcode: string): Promise<ProviderOutcome<NormalizedFood | null>> {
  const trimmedBarcode = barcode.trim()
  if (!trimmedBarcode) return { status: "no_match", value: null }

  const cacheKey = `barcode:${trimmedBarcode}`
  const cached = getCached<NormalizedFood | null>(cacheKey)
  if (cached !== undefined) return { status: cached ? "results" : "no_match", value: cached }

  const url = new URL(`${PRODUCT_URL_V3}/${encodeURIComponent(trimmedBarcode)}.json`)
  url.searchParams.set(
    "fields",
    "code,product_name,generic_name,brands,nutriments,serving_quantity,serving_quantity_unit",
  )

  try {
    // 404 is OFF's real "unknown product" answer; any other failure is an
    // outage, thrown by fetchOff, and is neither cached nor reported as not-found.
    const response = await fetchOff(url.toString(), [404])

    if (response.status === 404) {
      setCached(cacheKey, null)
      return { status: "no_match", value: null }
    }

    const data: unknown = await response.json()

    if (!isRecord(data) || !isRecord(data.product)) {
      setCached(cacheKey, null)
      return { status: "no_match", value: null }
    }

    const partial = extractPartialProduct(data.product)

    if (!partial) {
      setCached(cacheKey, null)
      return { status: "no_match", value: null }
    }

    // Missing Macro Data fallback: fill gaps from a comparable USDA
    // match rather than dropping the product or showing zero.
    const estimation = await fillMissingMacrosFromUsda(partial.name, partial.macros)

    if (!estimation) {
      setCached(cacheKey, null)
      return { status: "no_match", value: null }
    }

    const normalized: NormalizedFood = {
      id: `off-${trimmedBarcode}`,
      name: partial.name,
      source: "open-food-facts",
      sourceId: trimmedBarcode,
      sourceLabel: "Open Food Facts",
      preparationState: inferPreparationState(),
      per100g: estimation.macros,
      brand: partial.brand,
      barcode: trimmedBarcode,
      servingSizeGrams: partial.servingSizeGrams,
      rawDescription: partial.rawDescription,
      retrievedAt: new Date().toISOString(),
      confidence: estimation.isEstimated ? estimation.confidence : "medium",
      isEstimated: estimation.isEstimated,
      estimatedFrom: estimation.estimatedFrom,
      estimationReason: estimation.estimationReason,
    }

    setCached(cacheKey, normalized)
    return { status: "results", value: normalized }
  } catch (error) {
    logProviderFailure("OpenFoodFacts", "barcode lookup", error)
    return { status: classifyProviderError(error), value: null }
  }
}
