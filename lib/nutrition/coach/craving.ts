import { assembleDraft } from "./draft"
import { compareToOriginal } from "./claims"
import { getIngredient, isIngredientBlocked } from "./ingredients"
import { scaleItems, totalsFor } from "./macros"
import type { ActiveMealDraft, CoachContext, CravingInfo, CravingKey, DraftItem, MealConstraints, MealDraftSource } from "./types"

/* =========================================================
   CRAVING MAKEOVER — "Turn the food you want into a version that
   fits your goals." Not a medical/craving treatment.

   original food -> sensory targets -> calorie drivers -> keep the
   sensory experience -> swap the calorie-expensive parts -> raise
   protein -> deterministic recalculation -> Active Meal Draft.
========================================================= */

type Recipe = {
  key: CravingKey
  label: string
  draftName: string
  keywords: string[]
  sensoryTargets: string[]
  preserved: (items: DraftItem[]) => string[]
  items: DraftItem[]
  swaps: CravingInfo["swaps"]
  original: CravingInfo["original"]
}

export const CRAVING_RECIPES: Record<CravingKey, Recipe> = {
  chocolate_cereal: {
    key: "chocolate_cereal",
    label: "Chocolate Cereal",
    draftName: "Chocolate Crunch Protein Bowl",
    keywords: ["chocolate cereal", "cereal", "coco pops", "choco"],
    sensoryTargets: ["sweet", "chocolate", "crunch"],
    preserved: () => ["crunch (puffed rice)", "chocolate (cocoa)", "sweetness (banana)"],
    items: [
      { ingredientId: "puffed_rice", grams: 30 },
      { ingredientId: "cocoa_powder", grams: 8 },
      { ingredientId: "whey_protein", grams: 30 },
      { ingredientId: "skim_milk", grams: 200 },
      { ingredientId: "banana", grams: 60 },
    ],
    swaps: [
      { from: "Sugar-coated chocolate cereal", to: "Puffed rice + cocoa", why: "keeps the crunch and chocolate without added sugar" },
      { from: "Whole milk", to: "Skim milk", why: "removes most of the milk fat calories" },
      { from: "Added sugar for sweetness", to: "Banana", why: "natural sweetness with some fiber" },
      { from: "Low protein", to: "Whey protein", why: "raises protein substantially" },
    ],
    original: {
      description: "A typical bowl of sugar-coated chocolate cereal with whole milk",
      portion: "about 60–90 g cereal + 240–300 ml whole milk",
      caloriesRange: [350, 550],
      proteinRange: [6, 14],
      source: "ESTIMATED",
    },
  },
  real_cereal: {
    key: "real_cereal",
    label: "Real Coco Pops Bowl",
    draftName: "Real Coco Pops Protein Bowl",
    keywords: ["real coco pops", "real cereal"],
    sensoryTargets: ["sweet", "chocolate", "crunch"],
    preserved: () => ["the real cereal (a measured portion)", "chocolate and crunch", "sweetness"],
    items: [
      { ingredientId: "coco_pops", grams: 35 },
      { ingredientId: "whey_protein", grams: 30 },
      { ingredientId: "skim_milk", grams: 200 },
    ],
    swaps: [
      { from: "Large bowl of cereal", to: "Measured portion of the real cereal", why: "keeps the food you actually want at a portion that fits" },
      { from: "Whole milk", to: "Skim milk", why: "removes most of the milk fat calories" },
      { from: "Low protein", to: "Whey protein", why: "raises protein substantially" },
    ],
    original: {
      description: "A typical bowl of sugar-coated chocolate cereal with whole milk",
      portion: "about 60–90 g cereal + 240–300 ml whole milk",
      caloriesRange: [350, 550],
      proteinRange: [6, 14],
      source: "ESTIMATED",
    },
  },
  protein_ice_cream: {
    key: "protein_ice_cream",
    label: "Protein Ice Cream",
    draftName: "Chocolate Protein Ice Cream",
    keywords: ["ice cream", "icecream", "gelato", "protein ice"],
    sensoryTargets: ["creamy", "sweet", "cold", "chocolate"],
    preserved: () => ["creamy texture (Greek yogurt + blending)", "sweetness (frozen banana)", "chocolate (cocoa)", "cold (freeze/blend)"],
    items: [
      { ingredientId: "greek_yogurt", grams: 150 },
      { ingredientId: "whey_protein", grams: 20 },
      { ingredientId: "banana", grams: 80 },
      { ingredientId: "cocoa_powder", grams: 6 },
      { ingredientId: "skim_milk", grams: 60 },
    ],
    swaps: [
      { from: "Cream + sugar base", to: "Non-fat Greek yogurt + frozen banana", why: "creamy and sweet with far less fat and sugar" },
      { from: "Little protein", to: "Whey protein", why: "raises protein" },
      { from: "Fat for smoothness", to: "Optional guar or xanthan gum", why: "adds thickness if you already have it" },
    ],
    original: {
      description: "A typical bowl of regular chocolate ice cream",
      portion: "about 1–1.5 cups",
      caloriesRange: [300, 500],
      proteinRange: [4, 9],
      source: "ESTIMATED",
    },
  },
}

export { compareToOriginal, UNSAFE_CRAVING_CLAIMS } from "./claims"

export function detectCravingKey(text: string): CravingKey | null {
  const lower = text.toLowerCase()
  if (/ice[ -]?cream|gelato|protein ice/.test(lower)) return "protein_ice_cream"
  if (/(real|actual|regular|original).*(cereal|coco ?pops)/.test(lower)) return "real_cereal"
  if (/cereal|coco ?pops|choco(late)? (crunch|pops)/.test(lower)) return "chocolate_cereal"
  return null
}

/** Rebuilt server-side from the key + current items, so a client can never inject its own craving claims. */
export function buildCravingInfo(key: CravingKey, items: DraftItem[]): CravingInfo {
  const recipe = CRAVING_RECIPES[key]
  return {
    key,
    label: recipe.label,
    sensoryTargets: recipe.sensoryTargets,
    preserved: recipe.preserved(items),
    swaps: recipe.swaps,
    original: recipe.original,
    comparison: compareToOriginal(recipe.original, totalsFor(items)),
  }
}

export type CravingResult = { status: "OK"; draft: ActiveMealDraft } | { status: "BLOCKED"; reason: string }

export function buildCravingDraft(ctx: CoachContext, key: CravingKey, source: MealDraftSource = "craving_makeover"): CravingResult {
  const recipe = CRAVING_RECIPES[key]
  const blockedTerms = [...ctx.guards.allergies, ...ctx.guards.excludedFoods]
  const blocked = recipe.items.map((item) => getIngredient(item.ingredientId)).filter((i) => i && isIngredientBlocked(i, blockedTerms))
  if (blocked.length > 0) {
    return { status: "BLOCKED", reason: `I can't make the ${recipe.label} makeover because of your allergies/exclusions (${blocked.map((i) => i!.shortName).join(", ")}).` }
  }

  const remaining = ctx.snapshot.caloriesRemaining
  const constraints: MealConstraints = {
    calorieCeiling: remaining > 0 ? Math.round(remaining) : null,
    calorieCeilingStrict: false,
    calorieCeilingSource: "context",
    proteinTarget: null,
    proteinTargetSource: "context",
    maxPriceSgd: null,
    maxCookMinutes: null,
    availableIds: null,
  }

  // Only shrink if it doesn't fit the remaining calories — never inflate a craving.
  const base = recipe.items.map((item) => ({ ...item }))
  const items = constraints.calorieCeiling !== null && totalsFor(base).calories > constraints.calorieCeiling
    ? scaleItems(base, { mode: "PROPORTIONAL", targetCalories: constraints.calorieCeiling * 0.95 })
    : base

  const craving = buildCravingInfo(key, items)

  return { status: "OK", draft: assembleDraft({ ctx, name: recipe.draftName, family: "craving", source, items, constraints, craving }) }
}
