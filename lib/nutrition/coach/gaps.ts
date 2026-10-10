import { getIngredient, requireIngredient } from "./ingredients"
import { assessConfidence, roundGrams, totalsFor } from "./macros"
import { guardedPool } from "./optimizer"
import type { CoachContext, CoachIngredient, DraftItem, GapKind, GapSuggestion, MealConstraints } from "./types"

/* =========================================================
   GAP-FILLING INGREDIENT ENGINE
   Analyze the base meal, then suggest at most 1–3 high-leverage
   additions. A complete meal gets NO suggestions.
========================================================= */

export const MAX_SUGGESTIONS = 3

function mealFlavorRoles(items: DraftItem[]): Set<string> {
  return new Set(items.flatMap((item) => requireIngredient(item.ingredientId).flavorRoles))
}

function mealTextureRoles(items: DraftItem[]): Set<string> {
  return new Set(items.flatMap((item) => requireIngredient(item.ingredientId).textureRoles))
}

export function analyzeGaps(items: DraftItem[], constraints: MealConstraints): GapKind[] {
  const totals = totalsFor(items)
  const parts = items.map((item) => requireIngredient(item.ingredientId))
  const gaps: GapKind[] = []

  if (constraints.proteinTarget !== null && totals.protein < constraints.proteinTarget - 2) gaps.push("PROTEIN_GAP")

  const flavors = mealFlavorRoles(items)
  const seasoning = ["acid", "heat", "umami", "aromatic", "chocolate"]
  if (seasoning.filter((role) => flavors.has(role)).length < 1) gaps.push("FLAVOR_GAP")

  if (!["crunchy", "creamy", "crisp"].some((role) => mealTextureRoles(items).has(role))) gaps.push("TEXTURE_GAP")

  const hasVolume = parts.some((p) => p.role === "volume")
  const grams = items.reduce((sum, item) => sum + item.grams, 0)
  if (!hasVolume && totals.calories > 0 && totals.calories / Math.max(1, grams) > 1.2) gaps.push("VOLUME_GAP")

  const headroom = constraints.calorieCeiling === null ? 0 : constraints.calorieCeiling - totals.calories
  if (!parts.some((p) => p.role === "carb") && headroom >= 150 && gaps.indexOf("PROTEIN_GAP") === -1) gaps.push("BALANCE_GAP")

  return gaps
}

function suggestion(
  ingredient: CoachIngredient,
  gap: GapKind,
  necessity: GapSuggestion["necessity"],
  grams: number,
  reason: string,
  purpose: string,
  alternatives: CoachIngredient[],
): GapSuggestion {
  const rounded = roundGrams(ingredient, grams)
  return {
    ingredientId: ingredient.id,
    ingredientName: ingredient.name,
    gap,
    role: ingredient.role,
    necessity,
    reason,
    purpose,
    grams: rounded,
    impact: totalsFor([{ ingredientId: ingredient.id, grams: rounded }]),
    alternatives: alternatives.slice(0, 2).map((alt) => alt.id),
    confidence: assessConfidence([{ ingredientId: ingredient.id, grams: rounded }]).confidence,
  }
}

const FLAVOR_PICKS: Array<{ role: string; ids: string[]; purpose: string }> = [
  { role: "acid", ids: ["lime", "lemon"], purpose: "acidity and freshness" },
  { role: "heat", ids: ["chili"], purpose: "heat and flavor" },
  { role: "umami", ids: ["soy_sauce", "nutritional_yeast", "mustard"], purpose: "savory depth" },
  { role: "aromatic", ids: ["garlic"], purpose: "aroma and savory base" },
]

/** Suggest the highest-leverage additions for the gaps found. Required (protein) suggestions come first. */
export function suggestAdditions(ctx: CoachContext, items: DraftItem[], constraints: MealConstraints): GapSuggestion[] {
  const gaps = analyzeGaps(items, constraints)
  if (gaps.length === 0) return []

  const pool = guardedPool(ctx.guards, constraints.availableIds)
  const inMeal = new Set(items.map((item) => item.ingredientId))
  const free = pool.filter((item) => !inMeal.has(item.id))
  const totals = totalsFor(items)
  const headroom = constraints.calorieCeiling === null ? Infinity : constraints.calorieCeiling - totals.calories
  const out: GapSuggestion[] = []

  if (gaps.includes("PROTEIN_GAP") && constraints.proteinTarget !== null) {
    const need = constraints.proteinTarget - totals.protein
    const candidates = free
      .filter((item) => item.role === "protein")
      .map((item) => {
        const grams = Math.min(item.maxGrams, Math.max(item.minGrams, (need / item.proteinPer100g) * 100))
        const cals = (item.caloriesPer100g * grams) / 100
        return { item, grams, cals, efficiency: item.proteinPer100g / item.caloriesPer100g }
      })
      .filter((c) => c.cals <= headroom + 0.5)
      .sort((a, b) => b.efficiency - a.efficiency)
    const pick = candidates[0]
    if (pick) {
      out.push(
        suggestion(
          pick.item,
          "PROTEIN_GAP",
          "REQUIRED_FOR_TARGET",
          pick.grams,
          `Closes about ${Math.round(Math.min(need, (pick.item.proteinPer100g * pick.grams) / 100))}g of your ${Math.round(need)}g protein gap`,
          "extra protein",
          candidates.slice(1).map((c) => c.item),
        ),
      )
    }
  }

  const optional: GapSuggestion[] = []

  if (gaps.includes("VOLUME_GAP")) {
    const volumes = free.filter((item) => item.role === "volume")
    const pick = volumes.find((item) => item.id === "spinach") ?? volumes[0]
    if (pick && pick.caloriesPer100g * (pick.typicalGrams / 100) <= headroom) {
      optional.push(suggestion(pick, "VOLUME_GAP", "OPTIONAL_QUALITY_UPGRADE", pick.typicalGrams, "Adds volume and fiber for very few calories", "more filling", volumes.filter((v) => v !== pick)))
    }
  }

  if (gaps.includes("TEXTURE_GAP")) {
    const texture = free.filter((item) => item.textureRoles.some((role) => ["crunchy", "crisp", "creamy"].includes(role)) && item.role !== "protein" && item.role !== "flavor")
    const pick = texture.find((item) => item.id === "cucumber") ?? texture[0]
    if (pick && pick.caloriesPer100g * (pick.typicalGrams / 100) <= headroom) {
      optional.push(suggestion(pick, "TEXTURE_GAP", "OPTIONAL_QUALITY_UPGRADE", pick.typicalGrams, "Adds contrast so the meal isn't one soft texture", `${pick.textureRoles[0]} texture`, texture.filter((t) => t !== pick)))
    }
  }

  if (gaps.includes("FLAVOR_GAP")) {
    const flavors = mealFlavorRoles(items)
    for (const group of FLAVOR_PICKS) {
      if (flavors.has(group.role)) continue
      const options = free.filter((item) => group.ids.includes(item.id))
      const pick = options[0]
      if (!pick) continue
      optional.push(
        suggestion(pick, "FLAVOR_GAP", "OPTIONAL_QUALITY_UPGRADE", pick.typicalGrams, `Brings ${group.purpose} for minimal calories`, group.purpose, free.filter((item) => item.flavorRoles.includes(group.role) && item !== pick)),
      )
    }
  }

  if (gaps.includes("BALANCE_GAP")) {
    const carbs = free.filter((item) => item.role === "carb" && ["rice", "potatoes", "oats"].includes(item.id))
    const pick = carbs[0]
    if (pick && (pick.caloriesPer100g * pick.typicalGrams) / 100 <= headroom) {
      optional.push(suggestion(pick, "BALANCE_GAP", "OPTIONAL_QUALITY_UPGRADE", pick.typicalGrams, "Adds energy using your remaining calorie headroom", "balanced carbs", carbs.filter((c) => c !== pick)))
    }
  }

  // High-leverage first: cheap-in-calories suggestions, then the rest.
  optional.sort((a, b) => a.impact.calories - b.impact.calories)
  for (const item of optional) {
    if (out.length >= MAX_SUGGESTIONS) break
    // Keep within a strict ceiling after earlier additions.
    const withEarlier = totalsFor([...items, ...out.map((o) => ({ ingredientId: o.ingredientId, grams: o.grams })), { ingredientId: item.ingredientId, grams: item.grams }])
    if (constraints.calorieCeiling !== null && constraints.calorieCeilingStrict && withEarlier.calories > constraints.calorieCeiling + 0.5) continue
    if (getIngredient(item.ingredientId)) out.push(item)
  }

  return out
}

/** A thickener is useful for protein ice cream, but never assumed to be owned. */
export function suggestProteinIceCreamThickener(ctx: CoachContext, items: DraftItem[]): GapSuggestion[] {
  if (items.some((item) => item.ingredientId === "guar_gum" || item.ingredientId === "xanthan_gum")) return []

  const pool = guardedPool(ctx.guards, null)
  const guar = pool.find((item) => item.id === "guar_gum")
  if (!guar) return []
  const xanthan = pool.find((item) => item.id === "xanthan_gum")

  return [
    suggestion(
      guar,
      "TEXTURE_GAP",
      "OPTIONAL_QUALITY_UPGRADE",
      1,
      "Optional thickener — add it only if you already have it",
      "thicker, scoopable texture",
      xanthan ? [xanthan] : [],
    ),
  ]
}
