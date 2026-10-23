import type { MenuDish, MenuReading } from "@/lib/ai/vision-client"
import { foldText, isPreparationWord, searchLocalFallback } from "@/lib/nutrition/food-data/local-fallback"
import type { NormalizedFood } from "@/lib/nutrition/food-data/types"
import type { PhotoEstimateItem } from "@/lib/nutrition/photo-estimate"
import { needsCookingQuestion, suggestedOilGrams } from "@/lib/nutrition/photo-match-review"
import { matchVietnameseDish, resolveDishComponents, sumComponentMacros, templateItems } from "@/lib/nutrition/vietnamese-dishes"
import { scaleMacrosToGrams } from "@/lib/nutrition/food-log-calculator"

/**
 * Menu-to-Macro: which dishes on a photographed menu fit the athlete's day. The model only READS the menu (dish
 * names as printed, plus a guess of each dish's usual parts). Every number here comes from the offline reference
 * table or the Vietnamese dish catalog, is reported as a range, and is labelled an estimate. Ranking is
 * deterministic. Nothing here logs food: a pick can only be handed to the photo review as an editable prefill.
 */

export type MenuAthleteContext = {
  /** NutritionGoal from the plan ("fat_loss", "maintenance", "lean_bulk", ...), or null when unknown. */
  goal: string | null
  /** What is left of today's targets; null when the food log or targets could not be loaded. */
  remaining: { calories: number; protein: number } | null
  /** Allergies + excluded foods, free text. */
  excludedTerms: string[]
  /** False when the allergy settings couldn't be read: dishes are then NOT allergen-checked, and the result says so. */
  allergiesKnown: boolean
}

type Range = { low: number; high: number }

export type MenuEstimate = {
  calories: Range
  protein: Range
  /** "catalog": the curated recipe for this dish. "ingredients": priced from the model's guess of its parts. */
  basis: "catalog" | "ingredients"
  /** Guessed parts with no reference record (not counted). */
  unpriced: string[]
}

export type MenuOption = {
  /** Menu facts, exactly as read. */
  menu: Pick<MenuDish, "name" | "description" | "price">
  estimate: MenuEstimate | null
  /** Editable review items for "review as a meal estimate". Never logged by this module. */
  prefill: PhotoEstimateItem[]
  preparation: MenuDish["preparation"]
}

export type MenuSlot = "protein" | "balanced" | "calorie"

export type MenuRecommendation = {
  slot: MenuSlot
  label: string
  option: MenuOption
  why: string
  modifications: string[]
  uncertainty: string
}

export type MenuAnalysis = {
  readability: MenuReading["readability"]
  dishesRead: number
  recommendations: MenuRecommendation[]
  excluded: Array<{ name: string; term: string }>
  notEstimated: string[]
  limitations: string[]
}

const SLOT_LABEL: Record<MenuSlot, string> = {
  protein: "Best protein fit",
  balanced: "Best balanced option",
  calorie: "Best calorie-controlled option",
}

// Menu words for common allergy terms (folded). Over-matching is the safe direction for an allergy.
const ALLERGY_HINTS: Record<string, string[]> = {
  peanut: ["peanut", "dau phong", "lac rang", "sate"],
  nut: ["peanut", "dau phong", "cashew", "hat dieu", "almond", "walnut"],
  shellfish: ["shrimp", "prawn", "crab", "lobster", "squid", "clam", "mussel", "oyster", "tom", "cua", "rieu", "muc", "ngheu", "so diep"],
  seafood: ["shrimp", "prawn", "crab", "squid", "fish", "tom", "cua", "rieu", "muc", "nuoc mam", "mam"],
  fish: ["fish", "fish sauce", "nuoc mam", "mam", "ca loc", "ca basa", "ca hoi", "ca thu", "salmon", "tuna"],
  egg: ["egg", "trung", "op la", "mayonnaise"],
  dairy: ["milk", "cheese", "butter", "cream", "yogurt", "sua"],
  soy: ["soy", "tofu", "dau hu", "dau phu", "tuong", "hoisin"],
  gluten: ["wheat", "bread", "baguette", "banh mi", "mi y", "hoisin", "soy sauce"],
  wheat: ["wheat", "bread", "baguette", "banh mi"],
  beef: ["beef", "bo"],
  pork: ["pork", "heo", "lon", "suon", "cha lua", "xa xiu", "pate"],
  chicken: ["chicken", "ga"],
}

const phrase = (text: string) => ` ${foldText(text).replace(/[^a-z0-9]+/g, " ").trim()} `

/** The first excluded term a dish's menu text or priced parts mention, or null. */
export function allergyHit(text: string, terms: string[]): string | null {
  const haystack = phrase(text)
  for (const raw of terms) {
    const term = foldText(raw).replace(/[^a-z ]+/g, " ").trim()
    if (!term) continue
    const singular = term.endsWith("s") && term.length > 3 ? term.slice(0, -1) : term
    const hints = [term, singular, ...(ALLERGY_HINTS[term] ?? ALLERGY_HINTS[singular] ?? [])]
    if (hints.some((hint) => haystack.includes(phrase(hint)) || haystack.includes(phrase(`${hint}s`)))) return raw
  }
  return null
}

const roundTo = (value: number, step: number) => Math.round(value / step) * step
const range = (value: number, spread: number, step: number): Range => ({
  low: Math.max(0, roundTo(value * (1 - spread), step)),
  high: roundTo(value * (1 + spread), step),
})
const mid = (r: Range) => (r.low + r.high) / 2

/** Prices one menu dish: the catalog recipe when the name is a known dish, else the model's guessed parts. */
export function estimateMenuDish(dish: MenuDish): MenuOption {
  const menu = { name: dish.name, description: dish.description, price: dish.price }
  const catalog = matchVietnameseDish(dish.name)

  if (catalog) {
    const parts = resolveDishComponents(catalog).filter((part) => !part.optional)
    const oil = parts.reduce((sum, part) => sum + suggestedOilGrams(part.method, part.grams, part.food, { noAddedOil: part.noAddedOil }), 0)
    const total = sumComponentMacros([...parts, ...(oil > 0 ? [{ food: OIL, grams: oil }] : [])])
    const prefill = templateItems(catalog, parts.reduce((sum, part) => sum + part.grams, 0), "picked").map((item) => ({ ...item, notes: `From the menu: "${dish.name}". ${item.notes ?? ""}`.trim() }))
    return {
      menu,
      preparation: dish.preparation,
      estimate: { calories: range(total.calories, 0.25, 10), protein: range(total.protein, 0.25, 1), basis: "catalog", unpriced: [] },
      prefill,
    }
  }

  const priced = dish.components.map((component) => ({ component, food: pickRecord(component.name, dish.preparation) }))
  const totalGrams = priced.reduce((sum, p) => sum + p.component.grams, 0)
  const unpricedGrams = priced.filter((p) => !p.food).reduce((sum, p) => sum + p.component.grams, 0)
  const prefill: PhotoEstimateItem[] = priced.map(({ component, food }) => ({
    detectedName: component.name,
    estimatedGrams: component.grams,
    detectionConfidence: "low",
    notes: `From the menu: "${dish.name}". A guess of this dish's usual ingredients, not seen in a photo.`,
    preparation: dish.preparation,
    preparationCertain: false,
    dish: dish.name,
    groundedFood: food,
    scaledMacros: food ? scaleMacrosToGrams(food.per100g, component.grams) : null,
    candidates: food ? [food] : [],
    searchStatus: food ? "results" : "no_match",
  }))

  // More than a quarter of the dish unpriced: any total would be a guess dressed up as a number.
  if (totalGrams === 0 || unpricedGrams / totalGrams > 0.25) return { menu, preparation: dish.preparation, estimate: null, prefill }

  const parts = priced.flatMap((p) => (p.food ? [{ food: p.food, grams: p.component.grams }] : []))
  // The dish's method only adds oil to parts it matters for ("grilled beef & rice" oils the beef, not the rice).
  const oil = parts.reduce((sum, part) => sum + (needsCookingQuestion(dish.preparation, false, part.food) ? suggestedOilGrams(dish.preparation, part.grams, part.food) : 0), 0)
  const total = sumComponentMacros([...parts, ...(oil > 0 ? [{ food: OIL, grams: oil }] : [])])
  return {
    menu,
    preparation: dish.preparation,
    estimate: {
      calories: range(total.calories, 0.35, 10),
      protein: range(total.protein, 0.35, 1),
      basis: "ingredients",
      unpriced: priced.filter((p) => !p.food).map((p) => p.component.name),
    },
    prefill,
  }
}

const OIL = { per100g: { calories: 884, protein: 0, carbs: 0, fat: 100 } }

/**
 * Closest offline record for a guessed part. When the whole name finds nothing ("beef cubes"), single words are
 * tried from the last (usually the food noun: "water spinach" → spinach) to the first. Estimate-only: the photo
 * path never matches this loosely, and the prefill shows which record was used.
 */
function pickRecord(name: string, preparation: MenuDish["preparation"]): NormalizedFood | null {
  // "chili sauce" is not fish sauce and "braised fish" is not braised beef: a bare generic or preparation word
  // never stands in for a whole part.
  const words = name.split(/\s+/).reverse().filter((word) => !/^(sauce|dressing|soup|paste)$/i.test(word) && !isPreparationWord(word))
  for (const query of [name, ...(words.length > 1 ? words : [])]) {
    const hits = searchLocalFallback(query)
    const hit = preparation !== "raw" ? hits.find((food) => food.preparationState !== "raw") ?? hits[0] : hits[0]
    if (hit) return hit
  }
  return null
}

function modificationsFor(option: MenuOption, slot: MenuSlot): string[] {
  const names = option.prefill.map((item) => `${item.detectedName} ${item.groundedFood?.name ?? ""}`).join(" ").toLowerCase()
  const tips: string[] = []
  if (option.preparation === "fried" || option.preparation === "deep_fried") tips.push("Ask whether it can be grilled or steamed instead of fried.")
  if (/sauce|oil|mayonnaise|p[aâ]t[eé]|hoisin|dressing/.test(names)) tips.push("Ask for the sauce on the side and use only part of it.")
  if (slot === "calorie" && /rice|noodle|vermicelli|bread|baguette/.test(names)) tips.push("Ask for a smaller portion of rice or noodles.")
  if (slot === "protein") tips.push("If they offer it, ask for extra meat or an egg.")
  if (/broth/.test(names)) tips.push("Leave some of the broth: it carries most of the salt.")
  return tips.slice(0, 3)
}

function goalPhrase(goal: string | null, slot: MenuSlot): string {
  if (!goal) return ""
  if (goal === "fat_loss") return slot === "calorie" ? " Suits a fat-loss day." : ""
  if (goal === "lean_bulk") return slot === "protein" ? " Suits a muscle-gain day." : ""
  return ""
}

function explain(option: MenuOption, slot: MenuSlot, ctx: MenuAthleteContext): string {
  const e = option.estimate!
  const kcal = `about ${e.calories.low}–${e.calories.high} kcal`
  const protein = `${e.protein.low}–${e.protein.high} g protein`
  const left = ctx.remaining
  const share = left && left.protein > 0 ? ` (${Math.round((mid(e.protein) / left.protein) * 100)}% of the ${Math.round(left.protein)} g protein you still need today)` : ""
  const room = left ? (left.calories > 0 ? ` You have ${Math.round(left.calories)} kcal left today.` : " You're already at your calorie target today.") : ""
  const lead =
    slot === "protein" ? `Most protein of the dishes we could estimate: ${protein}${share}, ${kcal}.`
    : slot === "balanced" ? `Good protein for its calories: ${protein}${share}, ${kcal}.`
    : `Fewest calories with a useful amount of protein: ${kcal}, ${protein}${share}.`
  return `${lead}${room}${goalPhrase(ctx.goal, slot)}`
}

/** Ranks the estimable, allergy-safe dishes into up to three distinct picks. */
export function analyzeMenu(reading: MenuReading, ctx: MenuAthleteContext): MenuAnalysis {
  const options = reading.dishes.map(estimateMenuDish)
  const excluded: MenuAnalysis["excluded"] = []
  const safe = options.filter((option) => {
    if (!ctx.allergiesKnown || ctx.excludedTerms.length === 0) return true
    const text = [option.menu.name, option.menu.description, ...option.prefill.map((item) => `${item.detectedName} ${item.groundedFood?.name ?? ""}`)].join(" ")
    const term = allergyHit(text, ctx.excludedTerms)
    if (term) excluded.push({ name: option.menu.name, term })
    return !term
  })
  const estimable = safe.filter((option) => option.estimate)
  const notEstimated = safe.filter((option) => !option.estimate).map((option) => option.menu.name)

  const budget = ctx.remaining && ctx.remaining.calories > 0 ? ctx.remaining.calories : null
  const fitting = budget ? estimable.filter((option) => mid(option.estimate!.calories) <= budget * 1.1) : estimable
  const pool = fitting.length > 0 ? fitting : estimable
  const kcal = (o: MenuOption) => mid(o.estimate!.calories)
  const protein = (o: MenuOption) => mid(o.estimate!.protein)
  const density = (o: MenuOption) => protein(o) / Math.max(1, kcal(o))

  const chosen = new Set<MenuOption>()
  /** Best unchosen dish among the preferred ones, else among the whole pool. */
  const pick = (preferred: (o: MenuOption) => boolean, better: (a: MenuOption, b: MenuOption) => number) => {
    const open = pool.filter((o) => !chosen.has(o))
    const best = [...(open.some(preferred) ? open.filter(preferred) : open)].sort(better)[0]
    if (best) chosen.add(best)
    return best
  }
  const [lo, hi] = budget ? [budget * 0.3, budget * 0.7] : [400, 750]
  const picks: Array<[MenuSlot, MenuOption | undefined]> = []
  picks.push(["protein", pick(() => true, (a, b) => protein(b) - protein(a) || kcal(a) - kcal(b))])
  picks.push(["balanced", pick((o) => kcal(o) >= lo && kcal(o) <= hi, (a, b) => density(b) - density(a))])
  picks.push(["calorie", pick((o) => protein(o) >= 15, (a, b) => kcal(a) - kcal(b))])

  // A fat-loss goal leads with the calorie pick, a gain goal with protein; otherwise the fixed order.
  const order: MenuSlot[] = ctx.goal === "fat_loss" ? ["calorie", "balanced", "protein"] : ["protein", "balanced", "calorie"]
  const recommendations = picks
    .filter((entry): entry is [MenuSlot, MenuOption] => Boolean(entry[1]))
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([slot, option]) => ({
      slot,
      label: SLOT_LABEL[slot],
      option,
      why: explain(option, slot, ctx),
      modifications: modificationsFor(option, slot),
      uncertainty: option.estimate!.basis === "catalog"
        ? "Priced from a typical recipe for this dish, not this restaurant's. Portion size and oil can easily shift it by a quarter or more."
        : `Priced from a guess of this dish's usual ingredients; the restaurant's recipe and portion are unknown.${option.estimate!.unpriced.length ? ` Not counted: ${option.estimate!.unpriced.join(", ")}.` : ""}`,
    }))

  const limitations: string[] = []
  if (reading.readability === "partial") limitations.push("Only part of the menu was readable. Dishes that couldn't be read weren't considered.")
  if (!ctx.remaining) limitations.push("Today's remaining calories and protein couldn't be loaded, so dishes are ranked on their own, not against your day.")
  if (!ctx.goal) limitations.push("No nutrition goal is set, so the ranking isn't tailored to one.")
  if (!ctx.allergiesKnown) limitations.push("Your allergy settings couldn't be loaded, so dishes were NOT checked for allergens.")
  else if (ctx.excludedTerms.length > 0) limitations.push(`Checked against your allergies/exclusions (${ctx.excludedTerms.join(", ")}) using the menu text and typical recipes only. That can't prove a dish is free of them, so ask the staff.`)
  if (budget && fitting.length === 0 && estimable.length > 0) limitations.push("Every dish we could estimate is above what's left of today's calories. These are the closest options.")
  if (recommendations.length < 3 && reading.dishes.length > 0) limitations.push(`Only ${recommendations.length} dish${recommendations.length === 1 ? "" : "es"} on this menu could be estimated and recommended.`)

  return { readability: reading.readability, dishesRead: reading.dishes.length, recommendations, excluded, notEstimated, limitations }
}
