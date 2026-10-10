import { createHash } from "node:crypto"

import { requireIngredient } from "./ingredients"
import { totalsFor } from "./macros"
import type { DraftItem } from "./types"

/**
 * MEAL FINGERPRINT — similarity detection ONLY ("you logged a similar meal
 * earlier today"). It is NOT the idempotency key: retries are deduplicated by
 * the confirmed action UUID (dante_tool_actions.id) passed to createFoodLog,
 * and a legitimate second identical meal is never blocked — the user is just
 * asked first.
 *
 * Seasonings/fat (role flavor|fat) — including their calories — are left out so adding lime to a meal
 * doesn't make it a "different" meal; portions are bucketed to 10 g and
 * calories to 50 kcal.
 */
export const MEAL_FINGERPRINT_PREFIX = "mfmeal:"

export function mealFingerprint(items: DraftItem[]): string {
  const mainItems = items.filter((item) => !["flavor", "fat"].includes(requireIngredient(item.ingredientId).role))
  const main = mainItems.map((item) => `${item.ingredientId}@${Math.round(item.grams / 10) * 10}`).sort()
  const calories = Math.round(totalsFor(mainItems).calories / 50) * 50
  const hash = createHash("sha256").update(`${main.join("|")}#${calories}`).digest("hex").slice(0, 16)
  return `${MEAL_FINGERPRINT_PREFIX}${hash}`
}
