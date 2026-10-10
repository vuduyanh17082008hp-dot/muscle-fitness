import { requireIngredient } from "./ingredients"
import type {
  CoachIngredient,
  Confidence,
  DraftItem,
  IngredientRole,
  MacroTotals,
  MealConstraints,
  ScalingMode,
  Violation,
} from "./types"

/* =========================================================
   DETERMINISTIC MACROS — the only place a draft total is computed.
========================================================= */

const round1 = (value: number) => Math.round(value * 10) / 10

export function totalsFor(items: DraftItem[]): MacroTotals {
  let calories = 0
  let protein = 0
  let carbs = 0
  let fat = 0
  for (const item of items) {
    const ingredient = requireIngredient(item.ingredientId)
    const factor = item.grams / 100
    calories += ingredient.caloriesPer100g * factor
    protein += ingredient.proteinPer100g * factor
    carbs += ingredient.carbsPer100g * factor
    fat += ingredient.fatPer100g * factor
  }
  return { calories: round1(calories), protein: round1(protein), carbs: round1(carbs), fat: round1(fat) }
}

export function priceFor(items: DraftItem[]): number {
  const total = items.reduce((sum, item) => sum + (requireIngredient(item.ingredientId).priceEstimateSgd * item.grams) / 100, 0)
  return Math.round(total * 100) / 100
}

/** Longest single step — components are assumed to be prepared in parallel. */
export function cookMinutesFor(items: DraftItem[]): number {
  return items.reduce((max, item) => Math.max(max, requireIngredient(item.ingredientId).cookMinutes), 0)
}

function caloriesOf(item: DraftItem): number {
  return (requireIngredient(item.ingredientId).caloriesPer100g * item.grams) / 100
}

function proteinOf(item: DraftItem): number {
  return (requireIngredient(item.ingredientId).proteinPer100g * item.grams) / 100
}

/* =========================================================
   PORTION SCALING
========================================================= */

function roleOf(item: DraftItem): IngredientRole {
  return requireIngredient(item.ingredientId).role
}

function clampGrams(ingredient: CoachIngredient, grams: number): number {
  return Math.min(ingredient.maxGrams, Math.max(ingredient.minGrams, grams))
}

/** Practical kitchen rounding: 5 g steps for foods, 1 g (or 0.5 g) for flavor items. */
export function roundGrams(ingredient: CoachIngredient, grams: number): number {
  const clamped = clampGrams(ingredient, grams)
  const step = ingredient.role === "flavor" ? (ingredient.maxGrams <= 3 ? 0.5 : 1) : 5
  return Math.max(ingredient.minGrams, Math.round(clamped / step) * step)
}

/**
 * Scales a group of items so the group's calories (or protein) move by
 * the requested delta. Items hit their min/max bounds independently, so
 * we iterate and redistribute over the not-yet-clamped members.
 * Returns the delta that could NOT be applied.
 */
function adjustGroup(
  items: DraftItem[],
  inGroup: (item: DraftItem) => boolean,
  delta: number,
  metric: (item: DraftItem) => number,
): number {
  let remaining = delta
  for (let pass = 0; pass < 6 && Math.abs(remaining) > 0.5; pass += 1) {
    const free = items.filter((item) => {
      if (!inGroup(item)) return false
      const ingredient = requireIngredient(item.ingredientId)
      return remaining > 0 ? item.grams < ingredient.maxGrams - 1e-6 : item.grams > ingredient.minGrams + 1e-6
    })
    const base = free.reduce((sum, item) => sum + metric(item), 0)
    if (base <= 0) break
    const multiplier = Math.max(0.05, (base + remaining) / base)
    let applied = 0
    for (const item of free) {
      const ingredient = requireIngredient(item.ingredientId)
      const before = metric(item)
      item.grams = clampGrams(ingredient, item.grams * multiplier)
      applied += metric(item) - before
    }
    remaining -= applied
  }
  return remaining
}

export type ScaleRequest = {
  mode: ScalingMode
  targetCalories?: number | null
  targetProtein?: number | null
}

const isProtein = (item: DraftItem) => roleOf(item) === "protein"
const isCarb = (item: DraftItem) => roleOf(item) === "carb"
const isFat = (item: DraftItem) => roleOf(item) === "fat"
const isVolume = (item: DraftItem) => roleOf(item) === "volume"

/**
 * Deterministic portion scaling. Pure: returns new items, never mutates.
 *
 * AUTO (default):
 *   1. protein below target -> raise the protein components first;
 *   2. over the calorie target -> cut calorie-dense components first
 *      (added fat, then carbs) so protein is preserved, protein last;
 *   3. headroom left and protein already sufficient -> spend it on carbs,
 *      then volume.
 */
export function scaleItems(source: DraftItem[], request: ScaleRequest): DraftItem[] {
  const items = source.map((item) => ({ ...item }))
  const target = request.targetCalories ?? null
  const proteinTarget = request.targetProtein ?? null
  const calories = () => items.reduce((sum, item) => sum + caloriesOf(item), 0)
  const protein = () => items.reduce((sum, item) => sum + proteinOf(item), 0)

  switch (request.mode) {
    case "PROPORTIONAL": {
      if (target !== null && calories() > 0) {
        const multiplier = target / calories()
        for (const item of items) item.grams = clampGrams(requireIngredient(item.ingredientId), item.grams * multiplier)
      }
      break
    }
    case "CARB_ADJUST": {
      if (target !== null) adjustGroup(items, isCarb, target - calories(), caloriesOf)
      break
    }
    case "PROTEIN_ADJUST": {
      if (proteinTarget !== null) adjustGroup(items, isProtein, proteinTarget - protein(), proteinOf)
      else if (target !== null) adjustGroup(items, isProtein, target - calories(), caloriesOf)
      break
    }
    case "AUTO": {
      const wantProtein = proteinTarget ?? protein()
      if (protein() < wantProtein - 0.5) adjustGroup(items, isProtein, wantProtein - protein(), proteinOf)

      if (target !== null) {
        const over = calories() - target
        if (over > 0.5) {
          let left = adjustGroup(items, isFat, -over, caloriesOf)
          if (left < -0.5) left = adjustGroup(items, isCarb, left, caloriesOf)
          if (left < -0.5) left = adjustGroup(items, isProtein, left, caloriesOf)
          if (left < -0.5) adjustGroup(items, isVolume, left, caloriesOf)
        } else if (over < -0.5 && protein() >= wantProtein - 0.5) {
          const left = adjustGroup(items, isCarb, -over, caloriesOf)
          if (left > 0.5) adjustGroup(items, isVolume, left, caloriesOf)
        }
      }
      break
    }
  }

  return items.map((item) => ({ ingredientId: item.ingredientId, grams: roundGrams(requireIngredient(item.ingredientId), item.grams) }))
}

/* =========================================================
   CONSTRAINT VALIDATION
========================================================= */

const money = (value: number) => `S$${value.toFixed(2)}`

export function validateMeal(items: DraftItem[], constraints: MealConstraints): Violation[] {
  const totals = totalsFor(items)
  const violations: Violation[] = []

  if (constraints.calorieCeiling !== null && totals.calories > constraints.calorieCeiling + 0.5) {
    violations.push({
      constraint: "calorieCeiling",
      tier: constraints.calorieCeilingStrict ? "hard" : "medium",
      requested: constraints.calorieCeiling,
      actual: totals.calories,
      message: `This version is about ${Math.round(totals.calories)} kcal, above your ${Math.round(constraints.calorieCeiling)} kcal target.`,
    })
  }

  if (constraints.proteinTarget !== null && totals.protein < constraints.proteinTarget - 2) {
    violations.push({
      constraint: "protein",
      tier: "medium",
      requested: constraints.proteinTarget,
      actual: totals.protein,
      message: `This version falls ${Math.round(constraints.proteinTarget - totals.protein)}g short of your ${Math.round(constraints.proteinTarget)}g protein target.`,
    })
  }

  if (constraints.maxPriceSgd !== null) {
    const price = priceFor(items)
    if (price > constraints.maxPriceSgd + 0.005) {
      violations.push({
        constraint: "budget",
        tier: "soft",
        requested: constraints.maxPriceSgd,
        actual: price,
        message: `Closest match costs approximately ${money(price)} rather than ${money(constraints.maxPriceSgd)}.`,
      })
    }
  }

  if (constraints.maxCookMinutes !== null) {
    const minutes = cookMinutesFor(items)
    if (minutes > constraints.maxCookMinutes) {
      violations.push({
        constraint: "time",
        tier: "soft",
        requested: constraints.maxCookMinutes,
        actual: minutes,
        message: `Closest match takes about ${minutes} min rather than ${constraints.maxCookMinutes} min.`,
      })
    }
  }

  return violations
}

/** Lexicographic cost: any hard violation dominates medium, which dominates soft. */
export function violationCost(violations: Violation[]): number {
  return violations.reduce((sum, v) => {
    const relative = v.requested > 0 ? Math.abs(v.actual - v.requested) / v.requested : 1
    const weight = v.tier === "hard" ? 10_000 : v.tier === "medium" ? 100 : 1
    return sum + weight * (1 + relative)
  }, 0)
}

/* =========================================================
   CONFIDENCE — categorical, never a fake percentage.
========================================================= */

export type PreparationKind = "home" | "restaurant" | "packaged"

export function assessConfidence(
  items: DraftItem[],
  options: { preparedBy?: PreparationKind; portionsKnown?: boolean } = {},
): { confidence: Confidence; reasons: string[] } {
  const preparedBy = options.preparedBy ?? "home"
  const portionsKnown = options.portionsKnown ?? true
  const ingredients = items.map((item) => requireIngredient(item.ingredientId))
  const unknown = ingredients.filter((i) => i.source === "UNKNOWN")
  const estimated = ingredients.filter((i) => i.source === "ESTIMATED")
  const variable = ingredients.filter((i) => i.variableQuantity)

  if (preparedBy === "restaurant" || unknown.length > 0 || !portionsKnown) {
    const reasons: string[] = []
    if (preparedBy === "restaurant") reasons.push("Restaurant preparation and oil quantity are unknown")
    if (unknown.length > 0) reasons.push(`No nutrition data for: ${unknown.map((i) => i.shortName).join(", ")}`)
    if (!portionsKnown) reasons.push("Portion sizes are unclear")
    return { confidence: "LOW", reasons }
  }

  if (estimated.length > 0 || variable.length > 0 || preparedBy === "packaged") {
    const reasons: string[] = []
    if (estimated.length > 0) reasons.push(`Estimated values (vary by brand/cut): ${estimated.map((i) => i.shortName).join(", ")}`)
    if (variable.length > 0) reasons.push(`Home-cooking quantity varies: ${variable.map((i) => i.shortName).join(", ")}`)
    return { confidence: "MEDIUM", reasons }
  }

  return { confidence: "HIGH", reasons: ["Verified ingredient data", "Portions specified"] }
}
