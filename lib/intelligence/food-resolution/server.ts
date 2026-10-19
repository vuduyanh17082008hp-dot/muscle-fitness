import "server-only"

import { findIngredientByText } from "@/lib/nutrition/coach/ingredients"
import { isUsdaConfigured, searchFood as searchUsdaRaw } from "@/lib/nutrition/food-data/usda"
import type { NormalizedFood } from "@/lib/nutrition/food-data/types"

import { resolveFoodEntity } from "./resolver"
import type { FoodCandidate, LocalFoodHit, ResolvedFood, ResolveRequest, ResolverDeps } from "./types"

/**
 * Server wiring for the shared resolver: local curated table + the EXISTING USDA adapter (key stays server-side,
 * never in a prompt or a client bundle). USDA is a deterministic data source, not an AI provider.
 */

const singular = (t: string) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t)
const words = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1).map(singular)

/** `findIngredientByText` is deliberately loose; require a real word overlap so "pork" can never land on a substring hit. */
export function searchLocalCanonical(base: string): LocalFoodHit | null {
  const found = findIngredientByText(base)
  if (!found) return null
  const q = words(base)
  const have = new Set(words(`${found.name} ${found.shortName} ${found.id.replace(/_/g, " ")}`))
  if (!q.some((t) => have.has(t))) return null
  return {
    id: found.id,
    name: found.name,
    basis: found.measurementBasis === "RAW" ? "raw" : found.measurementBasis === "COOKED" ? "cooked" : "unknown",
    per100g: { calories: found.caloriesPer100g, protein: found.proteinPer100g, carbs: found.carbsPer100g, fat: found.fatPer100g },
    verification: found.source === "VERIFIED" ? "VERIFIED" : "ESTIMATED",
    confidence: "fallback",
  }
}

function toCandidate(food: NormalizedFood): FoodCandidate {
  return {
    id: food.id,
    name: food.name,
    basis: food.preparationState,
    per100g: { ...food.per100g },
    confidence: food.confidence,
    brand: food.brand ?? null,
  }
}

export const serverResolverDeps: ResolverDeps = {
  searchLocal: searchLocalCanonical,
  searchUsda: async (query) => {
    if (!isUsdaConfigured()) return { foods: [], configured: false }
    const foods = await searchUsdaRaw(query, { limit: 10 })
    return { foods: foods.map(toCandidate), configured: true }
  },
}

export function resolveFood(req: ResolveRequest, deps: ResolverDeps = serverResolverDeps): Promise<ResolvedFood> {
  return resolveFoodEntity(req, deps)
}
