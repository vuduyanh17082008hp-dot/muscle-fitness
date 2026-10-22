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
