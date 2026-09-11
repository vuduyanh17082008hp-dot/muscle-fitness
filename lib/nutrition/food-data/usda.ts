import "server-only"

/**
 * USDA FoodData Central adapter.
 *
 * Official docs: https://fdc.nal.usda.gov/api-guide
 * - Base URL: https://api.nal.usda.gov/fdc/v1/
 * - Auth: api_key query parameter (data.gov key). DEMO_KEY works but is
 *   heavily rate-limited (30/hour, 50/day) — a real key raises this to
 *   1,000 requests/hour per IP.
 * - Data types used here: "Foundation" and "SR Legacy" for raw/basic
 *   foods (USDA's most rigorously analyzed, least-processed records),
 *   with "Branded" available as a secondary option only.
 * - License: public domain (CC0 1.0). Attribution requested:
 *   "U.S. Department of Agriculture, Agricultural Research Service.
 *   FoodData Central, fdc.nal.usda.gov."
 *
 * This module never crashes the app if the key is missing or the
 * request fails — callers get an empty result and the caller decides
 * whether to fall back to local data.
 */

import type { FoodPreparationState, NormalizedFood } from "./types"

const USDA_BASE_URL = "https://api.nal.usda.gov/fdc/v1"

/** Raw/basic-food friendly data types, most reliable first. */
const RAW_FOOD_DATA_TYPES = ["Foundation", "SR Legacy"] as const

/**
 * USDA's legacy "nutrient number" scheme (the `nutrientNumber` field
 * on each foodNutrients entry) — NOT the same as `nutrientId`. Verified
 * directly against a live /foods/search response (see
 * docs/NUTRITION_DATA_SOURCES.md): protein is nutrientNumber "203",
 * not nutrientId 1003. Energy is reported as classic "208" on SR
 * Legacy/Branded/Survey records, but Foundation Foods report it under
 * "957"/"958" (Atwater General/Specific factors) instead — accept all
 * three.
 */
const NUTRIENT_NUMBERS = {
  calories: ["208", "957", "958"],
  protein: ["203"],
  fat: ["204"],
  carbs: ["205"],
  fiber: ["291"],
  sugar: ["269"],
  sodium: ["307"],
} as const

// Raw/basic foods change essentially never — cache them for a long time.
const RAW_FOOD_REVALIDATE_SECONDS = 60 * 60 * 24 * 30 // 30 days
const SEARCH_TIMEOUT_MS = 6000

function getApiKey(): string | null {
  const key = process.env.USDA_FDC_API_KEY?.trim()
  return key ? key : null
}

export function isUsdaConfigured(): boolean {
  return getApiKey() !== null
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      signal: controller.signal,
      next: { revalidate: RAW_FOOD_REVALIDATE_SECONDS },
    })
  } finally {
    clearTimeout(timer)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

type UsdaNutrientEntry = {
  nutrientNumber?: unknown
  nutrientName?: unknown
  value?: unknown
  unitName?: unknown
  nutrient?: { number?: unknown; name?: unknown; unitName?: unknown }
  amount?: unknown
}

function extractNutrientValue(
  nutrients: unknown,
  nutrientNumbers: readonly string[],
): number | null {
  if (!Array.isArray(nutrients)) {
    return null
  }

  for (const entry of nutrients as UsdaNutrientEntry[]) {
    if (!isRecord(entry)) continue

    const number =
      typeof entry.nutrientNumber === "string" || typeof entry.nutrientNumber === "number"
        ? String(entry.nutrientNumber)
        : typeof entry.nutrient?.number === "string" || typeof entry.nutrient?.number === "number"
          ? String(entry.nutrient.number)
          : null

    if (!number || !nutrientNumbers.includes(number)) continue

    const value = entry.value ?? entry.amount

    if (typeof value === "number" && Number.isFinite(value)) {
      return value
    }
  }

  return null
}

function inferPreparationState(
  description: string,
  dataType: string,
): FoodPreparationState {
  const text = description.toLowerCase()

  if (dataType === "Branded") {
    return "packaged"
  }

  if (/\braw\b/.test(text)) return "raw"

  if (
    /\b(cooked|boiled|roasted|grilled|baked|braised|steamed|poached|fried|pan-fried)\b/.test(
      text,
    )
  ) {
    return "cooked"
  }

  if (dataType === "Survey (FNDDS)") {
    return "prepared"
  }

  return "unknown"
}

type UsdaFoodItem = {
  fdcId?: unknown
  description?: unknown
  dataType?: unknown
  brandOwner?: unknown
  brandName?: unknown
  gtinUpc?: unknown
  foodNutrients?: unknown
  publishedDate?: unknown
}

function normalizeUsdaFood(item: UsdaFoodItem): NormalizedFood | null {
  const fdcId = typeof item.fdcId === "number" ? item.fdcId : null
  const description = typeof item.description === "string" ? item.description : null
  const dataType = typeof item.dataType === "string" ? item.dataType : "Unknown"

  if (fdcId === null || !description) {
    return null
  }

  const calories = extractNutrientValue(item.foodNutrients, NUTRIENT_NUMBERS.calories)
  const protein = extractNutrientValue(item.foodNutrients, NUTRIENT_NUMBERS.protein)
  const carbs = extractNutrientValue(item.foodNutrients, NUTRIENT_NUMBERS.carbs)
  const fat = extractNutrientValue(item.foodNutrients, NUTRIENT_NUMBERS.fat)

  if (calories === null || protein === null || carbs === null || fat === null) {
    return null
  }

  const brand =
    typeof item.brandOwner === "string"
      ? item.brandOwner
      : typeof item.brandName === "string"
        ? item.brandName
        : null

  return {
    id: `usda-${fdcId}`,
    name: description,
    source: "usda",
    sourceId: String(fdcId),
    sourceLabel: "USDA FoodData Central",
    preparationState: inferPreparationState(description, dataType),
    per100g: {
      calories,
      protein,
      carbs,
      fat,
      fiber: extractNutrientValue(item.foodNutrients, NUTRIENT_NUMBERS.fiber),
      sugar: extractNutrientValue(item.foodNutrients, NUTRIENT_NUMBERS.sugar),
      sodiumMg: extractNutrientValue(item.foodNutrients, NUTRIENT_NUMBERS.sodium),
    },
    brand,
    barcode: typeof item.gtinUpc === "string" ? item.gtinUpc : null,
    rawDescription: description,
    retrievedAt: new Date().toISOString(),
    confidence: dataType === "Foundation" || dataType === "SR Legacy" ? "high" : "medium",
  }
}

/* =========================================================
   RANKING (PHASE 7)
   Word overlap + data-type preference + raw/cooked keyword
   alignment + a penalty for prepared-dish / branded noise
   when the query looks like a basic food.
========================================================= */

const PREPARED_DISH_PENALTY_WORDS = [
  "sandwich",
  "dinner",
  "meal",
  "snack",
  "dessert",
  "flavored",
  "flavoured",
  "candy",
  "pie",
  "cake",
  "chip",
  "sauce",
  "soup",
  "pizza",
]

function scoreCandidate(
  item: UsdaFoodItem,
  queryWords: string[],
  wantsRaw: boolean,
  wantsCooked: boolean,
): number {
  const description = typeof item.description === "string" ? item.description.toLowerCase() : ""
  const dataType = typeof item.dataType === "string" ? item.dataType : ""

  if (!description) return -1000

  let score = 0

  for (const word of queryWords) {
    if (description.includes(word)) {
      score += 10
    }
  }

  if (dataType === "Foundation") score += 12
  else if (dataType === "SR Legacy") score += 10
  else if (dataType === "Survey (FNDDS)") score += 2
  else if (dataType === "Branded") score -= 4

  if (wantsRaw && /\braw\b/.test(description)) score += 15
  if (wantsCooked && /\b(cooked|boiled|roasted|grilled|baked)\b/.test(description)) score += 15

  // A query with no explicit prep keyword defaults to preferring "raw"
  // for whole/basic foods, matching how this app's meal-plan data is
  // built (see PHASE 5 note in lib/nutrition/plan.ts).
  if (!wantsRaw && !wantsCooked && /\braw\b/.test(description)) score += 6

  for (const word of PREPARED_DISH_PENALTY_WORDS) {
    if (description.includes(word) && !queryWords.includes(word)) {
      score -= 20
    }
  }

  // Prefer shorter, canonical descriptions over long branded/recipe ones.
  score -= Math.max(0, description.length - 40) * 0.05

  return score
}

/* =========================================================
   PUBLIC API
========================================================= */

export type UsdaSearchOptions = {
  /** Restrict to raw/basic-food data types (Foundation, SR Legacy). Default true. */
  preferRawFoodTypes?: boolean
  limit?: number
}

export async function searchFood(
  query: string,
  options: UsdaSearchOptions = {},
): Promise<NormalizedFood[]> {
  const apiKey = getApiKey()
  const trimmedQuery = query.trim()

  if (!apiKey || !trimmedQuery) {
    return []
  }

  const preferRawFoodTypes = options.preferRawFoodTypes ?? true
  const limit = Math.min(Math.max(options.limit ?? 5, 1), 20)

  const url = new URL(`${USDA_BASE_URL}/foods/search`)
  url.searchParams.set("api_key", apiKey)
  url.searchParams.set("query", trimmedQuery)
  url.searchParams.set("pageSize", "25")

  if (preferRawFoodTypes) {
    for (const dataType of RAW_FOOD_DATA_TYPES) {
      url.searchParams.append("dataType", dataType)
    }
  }

  try {
    const response = await fetchWithTimeout(url.toString(), SEARCH_TIMEOUT_MS)

    if (!response.ok) {
      console.warn(`[USDA] search failed: HTTP ${response.status}`)
      return []
    }

    const data: unknown = await response.json()

    if (!isRecord(data) || !Array.isArray(data.foods)) {
      return []
    }

    const queryWords = trimmedQuery
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 1)

    const wantsRaw = queryWords.includes("raw")
    const wantsCooked = queryWords.some((word) =>
      ["cooked", "boiled", "roasted", "grilled", "baked"].includes(word),
    )

    const ranked = (data.foods as UsdaFoodItem[])
      .map((item) => ({
        item,
        score: scoreCandidate(item, queryWords, wantsRaw, wantsCooked),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)

    const normalized: NormalizedFood[] = []

    for (const { item } of ranked) {
      const food = normalizeUsdaFood(item)
      if (food) normalized.push(food)
    }

    return normalized
  } catch (error) {
    console.warn("[USDA] search error:", error)
    return []
  }
}

export async function getFoodById(fdcId: string | number): Promise<NormalizedFood | null> {
  const apiKey = getApiKey()

  if (!apiKey) {
    return null
  }

  const url = new URL(`${USDA_BASE_URL}/food/${encodeURIComponent(String(fdcId))}`)
  url.searchParams.set("api_key", apiKey)

  try {
    const response = await fetchWithTimeout(url.toString(), SEARCH_TIMEOUT_MS)

    if (!response.ok) {
      console.warn(`[USDA] getFoodById failed: HTTP ${response.status}`)
      return null
    }

    const data: unknown = await response.json()

    if (!isRecord(data)) {
      return null
    }

    return normalizeUsdaFood(data as UsdaFoodItem)
  } catch (error) {
    console.warn("[USDA] getFoodById error:", error)
    return null
  }
}
