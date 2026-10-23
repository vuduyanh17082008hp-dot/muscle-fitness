import type { FoodSearchStatus, NormalizedFood } from "@/lib/nutrition/food-data/types"

/**
 * Why a photo-detected food's database match deserves a second look before
 * it is logged. Pure and client-safe: the panel re-runs it whenever the user
 * picks a different candidate. It never scores accuracy — it only names
 * concrete, checkable reasons.
 */
export type MatchFlag =
  | { kind: "raw_record"; message: string }
  | { kind: "preparation_mismatch"; message: string }
  | { kind: "name_mismatch"; message: string }
  | { kind: "low_confidence_record"; message: string }
  | { kind: "degraded_search"; message: string }

const COOKED_WORDS = ["cooked", "grilled", "fried", "boiled", "roasted", "steamed", "baked", "stir-fried", "braised", "stewed", "poached"]
const STOP_WORDS = new Set(["and", "with", "the", "raw", "cooked", "plain", "fresh", "slice", "piece"])

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
}

/** Crude plural fold so "eggs"/"egg" or "noodles"/"noodle" count as shared. */
const stem = (word: string) => word.replace(/(es|s)$/, "")

export function reviewFoodMatch(
  detectedName: string,
  food: NormalizedFood,
  searchStatus?: FoodSearchStatus,
): MatchFlag[] {
  const flags: MatchFlag[] = []
  const detected = detectedName.toLowerCase()
  const detectedCooked = COOKED_WORDS.some((word) => detected.includes(word))

  if (food.preparationState === "raw") {
    flags.push(
      detectedCooked
        ? { kind: "preparation_mismatch", message: `Looks ${COOKED_WORDS.find((w) => detected.includes(w))}, but this record is for RAW food — raw and cooked calories per gram differ.` }
        : { kind: "raw_record", message: "This record is for RAW food. If the portion in the photo is cooked, pick a cooked match or adjust." },
    )
  }

  const detectedStems = new Set(words(detectedName).map(stem))
  const matchStems = words(`${food.name} ${food.rawDescription ?? ""}`).map(stem)
  if (detectedStems.size > 0 && !matchStems.some((word) => detectedStems.has(word))) {
    flags.push({ kind: "name_mismatch", message: `Matched record "${food.name}" shares no words with "${detectedName}" — check it's the same food.` })
  }

  if (food.isEstimated || food.confidence === "low" || food.confidence === "fallback") {
    flags.push({
      kind: "low_confidence_record",
      message: food.confidence === "fallback"
        ? "From the small local fallback table, not USDA / Open Food Facts."
        : "This record's nutrients are partly estimated by the source lookup.",
    })
  }

  if (searchStatus === "provider_timeout" || searchStatus === "provider_error") {
    flags.push({ kind: "degraded_search", message: "The food databases didn't respond, so better matches may exist." })
  }

  return flags
}

/** How a photographed food was prepared. "unknown" means the photo doesn't show it. */
export const COOKING_METHODS = ["boiled", "steamed", "grilled", "roasted", "baked", "stir_fried", "fried", "deep_fried", "air_fried", "raw", "unknown"] as const
export type CookingMethod = (typeof COOKING_METHODS)[number]

export const COOKING_METHOD_LABEL: Record<CookingMethod, string> = {
  boiled: "Boiled",
  steamed: "Steamed",
  grilled: "Grilled",
  roasted: "Roasted",
  baked: "Baked",
  stir_fried: "Stir-fried",
  fried: "Pan-fried",
  deep_fried: "Deep-fried",
  air_fried: "Air-fried",
  raw: "Raw",
  unknown: "Not sure",
}

// ponytail: flat oil-absorption guesses per method (share of the food's weight). Only a default the
// user edits — the photo never shows how much oil was used. Swap for per-food data if one is ever sourced.
const OIL_SHARE: Record<CookingMethod, number> = {
  boiled: 0, steamed: 0, raw: 0, unknown: 0,
  grilled: 0.03, roasted: 0.03, baked: 0.03,
  air_fried: 0.01, stir_fried: 0.06, fried: 0.08, deep_fried: 0.12,
}

/** The matched record already includes the fat from cooking (e.g. "fried rice"), so adding oil would count it twice. */
export function recordIncludesCookingFat(food: Pick<NormalizedFood, "name" | "rawDescription">): boolean {
  return /\b(fried|oil|butter|ghee|lard|margarine|tempura|battered|crispy|curry)\b/i.test(`${food.name} ${food.rawDescription ?? ""}`)
}

/**
 * Default grams of added cooking oil for a food of `grams` cooked by `method`; 0 when none is implied, when the
 * record already includes its cooking fat, or when the dish template says the record reflects its preparation.
 */
export function suggestedOilGrams(
  method: CookingMethod,
  grams: number,
  food: Pick<NormalizedFood, "name" | "rawDescription">,
  options: { noAddedOil?: boolean } = {},
): number {
  if (options.noAddedOil || recordIncludesCookingFat(food)) return 0
  const oil = grams * OIL_SHARE[method]
  return oil > 0 ? Math.max(1, Math.round(oil)) : 0
}

// Foods whose calories don't depend on how they were cooked here (staples are boiled/steamed, garnish is raw).
const METHOD_IMMATERIAL = /\b(rice|noodles?|vermicelli|pho|bun|broth|soup|porridge|congee|sauce|bread|baguette|lettuce|cucumber|herbs?|basil|cilantro|coriander|sprouts?|scallions?|lime|sugar|banana|apple|berr(y|ies))\b/i

/**
 * Preparation the photo can't confirm changes the oil default, so it is worth one question, but only when the
 * answer could change the numbers: never for a record that already includes its fat, a template part that adds
 * no oil, or a staple/garnish whose method doesn't matter.
 */
export function needsCookingQuestion(
  method: CookingMethod,
  certain: boolean,
  food?: Pick<NormalizedFood, "name" | "rawDescription"> | null,
  options: { noAddedOil?: boolean } = {},
): boolean {
  if (certain && method !== "unknown") return false
  if (!food) return true
  return !(options.noAddedOil || recordIncludesCookingFat(food) || METHOD_IMMATERIAL.test(food.name))
}

const isCookedState = (food: NormalizedFood) => food.preparationState === "cooked" || food.preparationState === "prepared"

/**
 * After the user changes the cooking method, the candidate whose raw/cooked state fits it: picking "raw" moves a
 * cooked match to a raw record of the same food, any cooking method moves a raw match to a cooked one. Keeps the
 * current match when it already fits, when no candidate fits, or for "unknown".
 */
export function candidateIndexForMethod(detectedName: string, candidates: NormalizedFood[], current: number, method: CookingMethod): number {
  const selected = candidates[current]
  if (!selected || method === "unknown") return current
  const wantRaw = method === "raw"
  if (wantRaw ? selected.preparationState === "raw" : !(selected.preparationState === "raw")) return current
  const fits = (food: NormalizedFood) => (wantRaw ? food.preparationState === "raw" : isCookedState(food))
  const sameFood = (food: NormalizedFood) => !reviewFoodMatch(detectedName, food).some((flag) => flag.kind === "name_mismatch")
  const index = candidates.findIndex((food) => fits(food) && sameFood(food))
  return index >= 0 ? index : current
}

/**
 * Where a component's nutrient values come from, in the five honest buckets the review shows. Maps onto the
 * existing food-log provenance fields; it is a label, never stored.
 */
export type NutrientProvenance = "VERIFIED_REFERENCE" | "CURATED_ESTIMATE" | "AI_ESTIMATE" | "USER_CORRECTED" | "UNKNOWN"

export const NUTRIENT_PROVENANCE_LABEL: Record<NutrientProvenance, string> = {
  VERIFIED_REFERENCE: "Reference data",
  CURATED_ESTIMATE: "Curated estimate",
  AI_ESTIMATE: "AI estimate",
  USER_CORRECTED: "Entered by you",
  UNKNOWN: "No nutrient data",
}

export function nutrientProvenance(
  food: Pick<NormalizedFood, "isEstimated" | "confidence"> & { source: string } | null | undefined,
): NutrientProvenance {
  if (!food) return "UNKNOWN"
  if (food.source === "user_provided") return "USER_CORRECTED"
  if (food.source === "ai_estimate") return "AI_ESTIMATE"
  if (food.isEstimated || food.confidence === "low" || food.confidence === "fallback") return "CURATED_ESTIMATE"
  return "VERIFIED_REFERENCE"
}

/** Grams actually eaten from a served portion. 0 % means nothing is logged. */
export function eatenGrams(servedGrams: number, eatenPercent: number): number {
  const pct = Math.min(100, Math.max(0, eatenPercent))
  return Math.round(servedGrams * pct) / 100
}

type DishPart = { name: string; dish: string | null }

/**
 * A whole dish and its own components must not both count. When the model lists
 * "chicken rice" AND components tagged dish "chicken rice", the components win.
 */
export function dropDecomposedComposites<T extends DishPart>(items: T[]): T[] {
  const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
  const decomposed = new Set(items.flatMap((item) => (item.dish ? [norm(item.dish)] : [])))
  return items.filter((item) => item.dish !== null || !decomposed.has(norm(item.name)))
}

/** Who set a component's eaten percentage. The user's own value is never overwritten by a photo suggestion. */
export type EatenSource = "default" | "after_photo" | "user"

export type EatenSuggestion = { id: string; eatenPercent: number | null; confidence: "high" | "medium" | "low"; note: string | null }

/**
 * Applies after-photo suggestions to reviewed components by their shared key. A null suggestion (the photos
 * couldn't tell) and a value the user already set leave the percentage alone; the suggestion is kept beside it.
 * Grams, matches and everything else stay as reviewed.
 */
export function applyEatenSuggestions<T extends { key: string; eatenPercent: number; eatenSource: EatenSource; suggestion?: EatenSuggestion | null }>(
  items: T[],
  suggestions: EatenSuggestion[],
): T[] {
  const byKey = new Map(suggestions.map((s) => [s.id, s]))
  return items.map((item) => {
    const suggestion = byKey.get(item.key)
    if (!suggestion) return item
    const apply = suggestion.eatenPercent !== null && item.eatenSource !== "user"
    return { ...item, suggestion, ...(apply ? { eatenPercent: suggestion.eatenPercent as number, eatenSource: "after_photo" as const } : {}) }
  })
}
