import { COACH_INGREDIENTS, getIngredient, isIngredientBlocked, requireIngredient } from "./ingredients"
import { cookMinutesFor, priceFor, scaleItems, totalsFor, validateMeal, violationCost } from "./macros"
import type {
  CoachContext,
  DraftItem,
  MealConstraints,
  OptimizerMode,
  ProfileGuards,
  Violation,
} from "./types"

/* =========================================================
   MACRO-CONSTRAINED OPTIMIZER — deterministic ranking/search.
   No solver dependency: ~100–1000 small candidates, scaled
   and scored in-process.
========================================================= */

type Weights = { protein: number; calories: number; efficiency: number; preference: number; taste: number; budget: number; convenience: number }

const MODE_WEIGHTS: Record<OptimizerMode, Weights> = {
  BALANCED: { protein: 3, calories: 2, efficiency: 0.5, preference: 1, taste: 1, budget: 0.7, convenience: 0.7 },
  LEANEST: { protein: 4, calories: 3, efficiency: 3, preference: 0.5, taste: 0.5, budget: 0.3, convenience: 0.3 },
  BUDGET: { protein: 3, calories: 1.5, efficiency: 0.3, preference: 0.5, taste: 0.5, budget: 3, convenience: 0.5 },
}

type Family = { key: string; label: string; proteins: string[]; carbs: string[][]; volumes: string[][] }

const FAMILIES: Family[] = [
  {
    key: "savory_bowl",
    label: "Bowl",
    proteins: ["chicken_breast", "lean_beef", "white_fish", "tuna", "egg_whites", "tofu"],
    carbs: [["rice"], ["potatoes"], ["wraps"], ["bread"]],
    volumes: [["broccoli"], ["bok_choy"], ["spinach"], ["cauliflower"], ["cucumber"], ["shirataki"]],
  },
  {
    key: "yogurt_bowl",
    label: "Yogurt Bowl",
    proteins: ["greek_yogurt", "cottage_cheese"],
    carbs: [["oats", "berries"], ["oats", "banana"]],
    volumes: [[]],
  },
]

export function guardedPool(guards: ProfileGuards, availableIds: string[] | null) {
  const terms = [...guards.allergies, ...guards.excludedFoods]
  return COACH_INGREDIENTS.filter((item) => !isIngredientBlocked(item, terms) && (availableIds === null || availableIds.includes(item.id)))
}

export function mealName(items: DraftItem[], family = "savory_bowl"): string {
  const parts = items.map((item) => requireIngredient(item.ingredientId))
  const protein = parts.find((p) => p.role === "protein")
  const carb = parts.find((p) => p.role === "carb")
  if (!protein) return "Custom Meal"
  // Every carb is named: oats + berries and oats + banana are different bowls, never both "Greek Yogurt Oats Bowl".
  const carbs = parts.filter((p) => p.role === "carb").map((p) => p.shortName).join(" & ")
  if (family === "yogurt_bowl") return `High-Protein ${protein.shortName} ${carbs ? `${carbs} ` : ""}Bowl`
  if (family === "choose") return `${protein.shortName}${carb ? ` & ${carb.shortName}` : ""} Plate`
  return `High-Protein ${protein.shortName}${carb ? ` ${carb.shortName}` : ""} Bowl`
}

export type ScoredCandidate = {
  items: DraftItem[]
  family: string
  violations: Violation[]
  score: number
  /** Set only when the template name would collide with another option in the same list (e.g. "… Bowl with Spinach"). */
  name?: string
}

/** Options for a multi-meal discovery: how many alternatives, which foods every option must contain, and which recipes (composition keys) were already shown. */
export type DiscoveryOptions = { alternatives?: number; requireIds?: string[]; avoidKeys?: ReadonlySet<string>; /** The meal slot's natural family ("breakfast" → yogurt_bowl): ranked first when it fits. */ preferFamily?: string }

/** Identity of a meal = its ingredient set (portions aside). Two options with the same set are the same recipe. */
export const compositionKey = (items: Array<{ ingredientId: string }>) => [...new Set(items.map((item) => item.ingredientId))].sort().join("+")
/**
 * What NAMES a meal: protein + carb ("High-Protein Tofu Bread Bowl"). A vegetable swap keeps the template name, so a later list
 * that only changed the vegetable would look like the old list repeated unless it is preferred last and named apart.
 */
const coreOfKey = (key: string) => compositionKey(key.split("+").map((ingredientId) => ({ ingredientId })).filter((item) => getIngredient(item.ingredientId)?.role !== "volume"))
const coreKey = (items: Array<{ ingredientId: string }>) => coreOfKey(compositionKey(items))

function scoreCandidate(items: DraftItem[], constraints: MealConstraints, guards: ProfileGuards, mode: OptimizerMode, selectedIds?: string[]): { score: number; violations: Violation[] } {
  const w = MODE_WEIGHTS[mode]
  const totals = totalsFor(items)
  const violations = validateMeal(items, constraints)
  const parts = items.map((item) => requireIngredient(item.ingredientId))

  const proteinFit = constraints.proteinTarget ? Math.min(1, totals.protein / constraints.proteinTarget) - (totals.protein > constraints.proteinTarget * 1.3 ? 0.1 : 0) : 1
  const calorieFit = constraints.calorieCeiling
    ? totals.calories <= constraints.calorieCeiling + 0.5
      ? 1 - ((constraints.calorieCeiling - totals.calories) / constraints.calorieCeiling) * 0.5
      : -1
    : 1
  const efficiency = totals.calories > 0 ? Math.min(1, totals.protein / totals.calories / 0.35) : 0

  const preferredTerms = guards.preferredFoods.map((term) => term.toLowerCase())
  const preferenceHits = parts.filter((p) => preferredTerms.some((term) => p.name.toLowerCase().includes(term) || term.includes(p.shortName.toLowerCase()))).length
  const preference = parts.length ? Math.min(1, preferenceHits / 2) : 0

  const textures = new Set(parts.flatMap((p) => p.textureRoles))
  const taste = Math.min(1, (textures.size + new Set(parts.flatMap((p) => p.flavorRoles)).size) / 5)

  const price = priceFor(items)
  const budget = constraints.maxPriceSgd ? Math.max(0, 1 - Math.max(0, price - constraints.maxPriceSgd) / constraints.maxPriceSgd) : 1 - Math.min(1, price / 8)
  const convenience = 1 - Math.min(1, cookMinutesFor(items) / 30)

  const recent = guards.recentFoodNames.map((name) => name.toLowerCase())
  const recencyPenalty = Math.min(0.3, parts.filter((p) => recent.some((name) => name.includes(p.shortName.toLowerCase()))).length * 0.1)
  const usage = selectedIds && selectedIds.length ? (items.length / selectedIds.length) * 0.15 : 0

  const score =
    w.protein * proteinFit + w.calories * calorieFit + w.efficiency * efficiency + w.preference * preference + w.taste * taste + w.budget * budget + w.convenience * convenience - recencyPenalty + usage
  return { score, violations }
}

function rank(candidates: ScoredCandidate[]): ScoredCandidate[] {
  return [...candidates].sort((a, b) => violationCost(a.violations) - violationCost(b.violations) || b.score - a.score)
}

export type BuildResult =
  | { status: "OK"; best: ScoredCandidate; alternatives: ScoredCandidate[]; relaxed: Violation[] }
  | { status: "NO_CANDIDATE"; reason: string }
  | { status: "INFEASIBLE_HARD"; reason: string; closest: ScoredCandidate }

/** Meals aim to land just under the ceiling so there is a little breathing room. */
const CALORIE_FILL_RATIO = 0.95

const roleOf = (c: ScoredCandidate, role: string) => c.items.map((item) => requireIngredient(item.ingredientId)).filter((p) => p.role === role).map((p) => p.id).join("+")

/**
 * Picks distinct alternatives in rank order, most novel first: a new protein, then a new carb, then a new vegetable — never
 * the same ingredient set twice (a renamed duplicate is still a duplicate), never one with a hard-constraint violation.
 */
function pickAlternatives(best: ScoredCandidate, ranked: ScoredCandidate[], limit: number, avoidKeys?: ReadonlySet<string>): ScoredCandidate[] {
  const seen = new Set([compositionKey(best.items), ...(avoidKeys ?? [])])
  const shownCores = new Set([...(avoidKeys ?? [])].map(coreOfKey))
  const pool = ranked.filter((c) => c !== best && !c.violations.some((v) => v.tier === "hard"))
  const picked: ScoredCandidate[] = []
  const used = { protein: new Set([roleOf(best, "protein")]), carb: new Set([roleOf(best, "carb")]), volume: new Set([roleOf(best, "volume")]) }
  // A meal never shown under this name comes first; an earlier list's protein + carb with a new vegetable only fills what is left.
  const unseenCore = (c: ScoredCandidate) => !shownCores.has(coreKey(c.items))
  const novel: Array<(c: ScoredCandidate) => boolean> = [
    (c) => unseenCore(c) && !used.protein.has(roleOf(c, "protein")),
    (c) => unseenCore(c) && !used.carb.has(roleOf(c, "carb")),
    (c) => unseenCore(c) && !used.volume.has(roleOf(c, "volume")),
    unseenCore,
    (c) => !used.protein.has(roleOf(c, "protein")),
    (c) => !used.carb.has(roleOf(c, "carb")),
    (c) => !used.volume.has(roleOf(c, "volume")),
    () => true,
  ]
  for (const test of novel) {
    for (const c of pool) {
      if (picked.length >= limit) return picked
      const key = compositionKey(c.items)
      if (seen.has(key) || !test(c)) continue
      seen.add(key)
      picked.push(c)
      used.protein.add(roleOf(c, "protein"))
      used.carb.add(roleOf(c, "carb"))
      used.volume.add(roleOf(c, "volume"))
    }
  }
  return picked
}

/** Same template name for different recipes ("High-Protein Beef Rice Bowl" ×2): name the vegetable that tells them apart. */
function nameDistinct(list: ScoredCandidate[], shownCores: ReadonlySet<string> = new Set()): ScoredCandidate[] {
  const counts = new Map<string, number>()
  for (const c of list) counts.set(mealName(c.items, c.family), (counts.get(mealName(c.items, c.family)) ?? 0) + 1)
  return list.map((c) => {
    const base = mealName(c.items, c.family)
    // Also when an earlier list showed this name: "High-Protein Tofu Bread Bowl" again would read as a repeat.
    if ((counts.get(base) ?? 0) < 2 && !shownCores.has(coreKey(c.items))) return c
    const veg = c.items.map((item) => requireIngredient(item.ingredientId)).filter((p) => p.role === "volume").map((p) => p.shortName)
    return veg.length ? { ...c, name: `${base} with ${veg.join(" & ")}` } : c
  })
}

function resolveBuild(candidates: ScoredCandidate[], constraints: MealConstraints, options: DiscoveryOptions = {}): BuildResult {
  if (candidates.length === 0) return { status: "NO_CANDIDATE", reason: "No allowed ingredients are left after your allergies, exclusions and available foods." }
  // Meal context (live S4-B: "high-protein breakfast" → a tuna bread bowl): the slot's natural family leads whenever it breaks no
  // hard constraint, even if it falls a little short of a soft target — the draft states that shortfall instead of hiding it.
  const preferred = (c: ScoredCandidate) => c.family === options.preferFamily && !c.violations.some((v) => v.tier === "hard")
  const ranked = options.preferFamily ? [...rank(candidates.filter(preferred)), ...rank(candidates.filter((c) => !preferred(c)))] : rank(candidates)
  // "More options": the best NEW meal leads; already-shown recipes are never offered again.
  const avoid = options.avoidKeys
  const shownCores = new Set([...(avoid ?? [])].map(coreOfKey))
  const best = (avoid?.size ? (ranked.find((c) => !avoid.has(compositionKey(c.items)) && !shownCores.has(coreKey(c.items))) ?? ranked.find((c) => !avoid.has(compositionKey(c.items)))) : undefined) ?? ranked[0]
  if (avoid?.has(compositionKey(best.items))) return { status: "NO_CANDIDATE", reason: "I've already shown every distinct meal the verified foods allow with these constraints." }
  const hard = best.violations.filter((v) => v.tier === "hard")
  if (hard.length > 0) {
    return { status: "INFEASIBLE_HARD", reason: `I couldn't build a meal that stays within your strict ${Math.round(constraints.calorieCeiling ?? 0)} kcal limit with the foods available.`, closest: best }
  }
  // Single-meal callers (no `alternatives` asked) keep the original pick: one alternative per family + lead ingredient.
  if (options.alternatives === undefined) {
    const alternatives = ranked.slice(1).filter((c, index, all) => all.findIndex((o) => o.family === c.family && o.items[0].ingredientId === c.items[0].ingredientId) === index).slice(0, 4)
    return { status: "OK", best, alternatives, relaxed: best.violations }
  }
  const alternatives = pickAlternatives(best, ranked, options.alternatives, options.avoidKeys)
  const [namedBest, ...namedAlternatives] = nameDistinct([best, ...alternatives], shownCores)
  return { status: "OK", best: namedBest, alternatives: namedAlternatives, relaxed: best.violations }
}

/** BUILD MY NEXT MEAL / SUGGESTED FOR YOU — generates template candidates and ranks them. */
export function buildMeal(ctx: CoachContext, constraints: MealConstraints, mode: OptimizerMode = "BALANCED", options: { excludeFirstProteins?: string[] } & DiscoveryOptions = {}): BuildResult {
  const pool = new Set(guardedPool(ctx.guards, constraints.availableIds).map((item) => item.id))
  const target = constraints.calorieCeiling === null ? null : constraints.calorieCeiling * CALORIE_FILL_RATIO
  const candidates: ScoredCandidate[] = []

  for (const family of FAMILIES) {
    for (const protein of family.proteins) {
      if (!pool.has(protein) || options.excludeFirstProteins?.includes(protein)) continue
      for (const carbs of family.carbs) {
        if (!carbs.every((id) => pool.has(id))) continue
        for (const volume of family.volumes) {
          if (!volume.every((id) => pool.has(id))) continue
          const ids = [protein, ...carbs, ...volume]
          // "with lean ground beef": every option must contain every requested food.
          if (options.requireIds?.some((id) => !ids.includes(id))) continue
          const items = scaleItems(
            ids.map((id) => ({ ingredientId: id, grams: requireIngredient(id).typicalGrams })),
            { mode: "AUTO", targetCalories: target, targetProtein: constraints.proteinTarget },
          )
          const scored = scoreCandidate(items, constraints, ctx.guards, mode)
          candidates.push({ items, family: family.key, ...scored })
        }
      }
    }
  }

  return resolveBuild(candidates, constraints, options)
}

/** CHOOSE MY FOOD — best subset of the user's selected foods (they need not all be used). */
export function buildFromSelection(ctx: CoachContext, constraints: MealConstraints, selectedIds: string[], mode: OptimizerMode = "BALANCED"): BuildResult {
  const allowed = guardedPool(ctx.guards, null).map((item) => item.id)
  const ids = [...new Set(selectedIds)].filter((id) => allowed.includes(id) && getIngredient(id)).slice(0, 10)
  if (ids.length === 0) return { status: "NO_CANDIDATE", reason: "None of the selected foods are available (allergies/exclusions or no nutrition data)." }

  const target = constraints.calorieCeiling === null ? null : constraints.calorieCeiling * CALORIE_FILL_RATIO
  const candidates: ScoredCandidate[] = []

  for (let mask = 1; mask < 1 << ids.length; mask += 1) {
    const subset = ids.filter((_, index) => mask & (1 << index))
    // Seasonings alone don't make a meal; need a protein/carb/volume/base anchor.
    if (subset.every((id) => requireIngredient(id).role === "flavor" || requireIngredient(id).role === "fat")) continue
    const hasProtein = subset.some((id) => requireIngredient(id).role === "protein")
    const anyProtein = ids.some((id) => requireIngredient(id).role === "protein")
    if (anyProtein && !hasProtein) continue
    const items = scaleItems(
      subset.map((id) => ({ ingredientId: id, grams: requireIngredient(id).typicalGrams })),
      { mode: "AUTO", targetCalories: target, targetProtein: constraints.proteinTarget },
    )
    candidates.push({ items, family: "choose", ...scoreCandidate(items, constraints, ctx.guards, mode, ids) })
  }

  return resolveBuild(candidates, constraints)
}
