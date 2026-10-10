import type { CoachIngredient, DataProvenance, DataSource, IngredientRole, MeasurementBasis } from "./types"

/**
 * Canonical ingredient table for Nutrition Coach V1 (~40 foods, on purpose
 * NOT a food database). Values are per 100 g in the state the food is eaten
 * (cooked/as-served), hand-curated from USDA reference values and common
 * label data. Where a value varies materially by brand or cut it is marked
 * ESTIMATED so the confidence model can say so. Foods that already exist in
 * `FOOD_TEMPLATES` (lib/nutrition/plan.ts) use identical numbers.
 */

const BOUNDS: Record<IngredientRole, { min: number; max: number }> = {
  protein: { min: 60, max: 300 },
  carb: { min: 30, max: 400 },
  volume: { min: 50, max: 300 },
  flavor: { min: 1, max: 30 },
  fat: { min: 0, max: 20 },
  base: { min: 20, max: 300 },
}

type Spec = {
  id: string
  name: string
  short?: string
  role: IngredientRole
  per100: [calories: number, protein: number, carbs: number, fat: number]
  price: number
  typical: number
  source?: DataSource
  tags?: string[]
  allergens?: string[]
  cooking?: string[]
  flavor?: string[]
  texture?: string[]
  cook?: number
  min?: number
  max?: number
  variable?: boolean
  basis?: MeasurementBasis
  provenance?: DataProvenance
}

function ing(spec: Spec): CoachIngredient {
  const bounds = BOUNDS[spec.role]
  return {
    id: spec.id,
    name: spec.name,
    shortName: spec.short ?? spec.name,
    role: spec.role,
    caloriesPer100g: spec.per100[0],
    proteinPer100g: spec.per100[1],
    carbsPer100g: spec.per100[2],
    fatPer100g: spec.per100[3],
    priceEstimateSgd: spec.price,
    tags: spec.tags ?? [],
    allergens: spec.allergens ?? [],
    cookingMethods: spec.cooking ?? [],
    flavorRoles: spec.flavor ?? [],
    textureRoles: spec.texture ?? [],
    cookMinutes: spec.cook ?? 0,
    typicalGrams: spec.typical,
    minGrams: spec.min ?? bounds.min,
    maxGrams: spec.max ?? bounds.max,
    variableQuantity: spec.variable,
    source: spec.source ?? "VERIFIED",
    measurementBasis: spec.basis ?? "AS_SERVED",
    provenance: spec.provenance ?? (spec.source === "ESTIMATED" ? "CURATED_ESTIMATE" : "USDA_REFERENCE"),
  }
}

export const COACH_INGREDIENTS: CoachIngredient[] = [
  // LEAN PROTEIN
  ing({ id: "chicken_breast", name: "Chicken Breast", short: "Chicken", role: "protein", per100: [165, 31, 0, 3.6], price: 0.9, typical: 150, basis: "COOKED", tags: ["lean", "meat"], allergens: ["poultry", "meat"], cooking: ["grill", "pan", "bake"], flavor: ["savory"], texture: ["chewy"], cook: 15 }),
  ing({ id: "lean_beef", name: "Lean Beef", short: "Beef", role: "protein", per100: [180, 28, 0, 7], price: 1.8, typical: 150, source: "ESTIMATED", basis: "COOKED", tags: ["lean", "meat"], allergens: ["beef", "meat"], cooking: ["grill", "pan"], flavor: ["savory", "rich"], texture: ["chewy"], cook: 12 }),
  ing({ id: "white_fish", name: "White Fish (cod)", short: "Fish", role: "protein", per100: [105, 23, 0, 0.9], price: 1.4, typical: 150, basis: "COOKED", tags: ["lean", "seafood"], allergens: ["fish"], cooking: ["steam", "pan", "bake"], flavor: ["mild"], texture: ["flaky"], cook: 10 }),
  ing({ id: "tuna", name: "Tuna (canned in water)", short: "Tuna", role: "protein", per100: [116, 26, 0, 0.8], price: 1.0, typical: 120, tags: ["lean", "seafood"], allergens: ["fish"], cooking: ["none"], flavor: ["savory"], texture: ["flaky"], cook: 0, max: 250 }),
  ing({ id: "egg_whites", name: "Egg Whites", short: "Egg White", role: "protein", per100: [52, 11, 0.7, 0.2], price: 0.5, typical: 200, basis: "RAW", tags: ["lean"], allergens: ["egg"], cooking: ["scramble", "pan"], flavor: ["mild"], texture: ["fluffy"], cook: 5, min: 60, max: 400 }),
  ing({ id: "whole_eggs", name: "Whole Eggs", short: "Egg", role: "protein", per100: [155, 13, 1.1, 11], price: 0.5, typical: 110, basis: "RAW", tags: [], allergens: ["egg"], cooking: ["boil", "scramble", "pan"], flavor: ["rich"], texture: ["creamy"], cook: 6, min: 50, max: 250 }),
  ing({ id: "greek_yogurt", name: "Non-fat Greek Yogurt", short: "Greek Yogurt", role: "protein", per100: [59, 10.2, 3.6, 0.4], price: 0.7, typical: 200, tags: ["lean", "dairy"], allergens: ["dairy"], cooking: ["none"], flavor: ["tangy", "creamy"], texture: ["creamy"], cook: 0, min: 50, max: 450 }),
  ing({ id: "cottage_cheese", name: "Low-fat Cottage Cheese", short: "Cottage Cheese", role: "protein", per100: [72, 12.4, 2.7, 1], price: 0.8, typical: 200, tags: ["lean", "dairy"], allergens: ["dairy"], cooking: ["none"], flavor: ["mild", "tangy"], texture: ["creamy"], cook: 0, min: 50, max: 400 }),
  ing({ id: "whey_protein", name: "Whey Protein", short: "Whey", role: "protein", per100: [380, 80, 7, 4], price: 3.5, typical: 30, source: "ESTIMATED", tags: ["powder", "dairy"], allergens: ["dairy"], cooking: ["blend"], flavor: ["sweet"], texture: ["smooth"], cook: 1, min: 15, max: 60 }),
  ing({ id: "casein", name: "Casein Protein", short: "Casein", role: "protein", per100: [360, 78, 8, 2], price: 3.8, typical: 30, source: "ESTIMATED", tags: ["powder", "dairy"], allergens: ["dairy"], cooking: ["blend"], flavor: ["mild"], texture: ["thick", "creamy"], cook: 1, min: 15, max: 60 }),
  ing({ id: "tofu", name: "Firm Tofu", short: "Tofu", role: "protein", per100: [120, 13, 2.5, 7], price: 0.4, typical: 200, source: "ESTIMATED", tags: ["plant"], allergens: ["soy"], cooking: ["pan", "bake", "steam"], flavor: ["mild"], texture: ["soft"], cook: 8, max: 400 }),

  // CARBS
  ing({ id: "rice", name: "Rice", short: "Rice", role: "carb", per100: [130, 2.7, 28, 0.3], price: 0.2, typical: 180, basis: "COOKED", tags: ["staple"], cooking: ["boil", "steam"], flavor: ["neutral"], texture: ["soft"], cook: 15 }),
  ing({ id: "oats", name: "Oats", short: "Oats", role: "carb", per100: [389, 16.9, 66, 6.9], price: 0.3, typical: 40, basis: "RAW", tags: ["staple"], allergens: ["gluten"], cooking: ["soak", "boil"], flavor: ["nutty"], texture: ["chewy"], cook: 5, min: 20, max: 120 }),
  ing({ id: "potatoes", name: "Potatoes", short: "Potato", role: "carb", per100: [87, 1.9, 20, 0.1], price: 0.25, typical: 250, basis: "COOKED", tags: ["staple"], cooking: ["boil", "bake"], flavor: ["neutral"], texture: ["soft"], cook: 20 }),
  ing({ id: "wraps", name: "Flour Wrap", short: "Wrap", role: "carb", per100: [310, 8, 52, 7], price: 0.8, typical: 60, source: "ESTIMATED", tags: [], allergens: ["gluten"], cooking: ["none"], flavor: ["neutral"], texture: ["soft"], cook: 0, min: 30, max: 150 }),
  ing({ id: "bread", name: "Wholegrain Bread", short: "Bread", role: "carb", per100: [247, 13, 41, 3.4], price: 0.4, typical: 70, tags: [], allergens: ["gluten"], cooking: ["toast"], flavor: ["nutty"], texture: ["crunchy"], cook: 2, min: 30, max: 160 }),
  ing({ id: "banana", name: "Banana", short: "Banana", role: "carb", per100: [89, 1.1, 22.8, 0.3], price: 0.3, typical: 100, basis: "RAW", tags: ["fruit"], cooking: ["none", "freeze"], flavor: ["sweet"], texture: ["creamy"], cook: 0, min: 40, max: 250 }),
  ing({ id: "berries", name: "Mixed Berries", short: "Berries", role: "carb", per100: [50, 0.7, 12, 0.3], price: 1.5, typical: 80, tags: ["fruit"], cooking: ["none"], flavor: ["sweet", "acid"], texture: ["juicy"], cook: 0, min: 30, max: 250 }),
  ing({ id: "puffed_rice", name: "Puffed Rice Cereal", short: "Puffed Rice", role: "carb", per100: [380, 6, 87, 0.6], price: 0.8, typical: 30, source: "ESTIMATED", tags: ["cereal"], cooking: ["none"], flavor: ["neutral"], texture: ["crunchy"], cook: 0, min: 15, max: 80 }),

  ing({ id: "coco_pops", name: "Chocolate Rice Cereal (Coco Pops-style)", short: "Coco Pops", role: "carb", per100: [380, 5, 85, 2], price: 1.0, typical: 30, source: "ESTIMATED", tags: ["cereal"], allergens: ["gluten"], cooking: ["none"], flavor: ["sweet", "chocolate"], texture: ["crunchy"], cook: 0, min: 15, max: 80 }),

  // VOLUME
  ing({ id: "broccoli", name: "Broccoli", short: "Broccoli", role: "volume", per100: [35, 2.4, 7, 0.4], price: 0.5, typical: 120, basis: "COOKED", tags: ["veg"], cooking: ["steam", "boil"], flavor: ["green"], texture: ["crisp"], cook: 6 }),
  ing({ id: "bok_choy", name: "Bok Choy", short: "Bok Choy", role: "volume", per100: [12, 1.6, 1.8, 0.2], price: 0.4, typical: 120, basis: "COOKED", tags: ["veg"], cooking: ["steam", "stir-fry"], flavor: ["green"], texture: ["crisp"], cook: 4 }),
  ing({ id: "spinach", name: "Spinach", short: "Spinach", role: "volume", per100: [23, 2.9, 3.6, 0.4], price: 0.6, typical: 80, basis: "RAW", tags: ["veg"], cooking: ["wilt", "raw"], flavor: ["green"], texture: ["tender"], cook: 2 }),
  ing({ id: "cucumber", name: "Cucumber", short: "Cucumber", role: "volume", per100: [15, 0.7, 3.6, 0.1], price: 0.3, typical: 100, basis: "RAW", tags: ["veg"], cooking: ["raw"], flavor: ["fresh"], texture: ["crunchy"], cook: 0 }),
  ing({ id: "cauliflower", name: "Cauliflower", short: "Cauliflower", role: "volume", per100: [23, 1.8, 4.1, 0.5], price: 0.4, typical: 120, basis: "COOKED", tags: ["veg"], cooking: ["steam", "roast"], flavor: ["mild"], texture: ["tender"], cook: 6 }),
  ing({ id: "shirataki", name: "Shirataki Noodles", short: "Shirataki", role: "volume", per100: [9, 0.1, 3, 0], price: 1.2, typical: 150, source: "ESTIMATED", tags: ["noodle"], cooking: ["rinse", "pan"], flavor: ["neutral"], texture: ["chewy"], cook: 2 }),

  // FLAVOR / TEXTURE
  ing({ id: "garlic", name: "Garlic", short: "Garlic", role: "flavor", per100: [149, 6.4, 33, 0.5], price: 0.6, typical: 5, tags: ["aromatic"], flavor: ["aromatic", "savory"], cook: 1, max: 20 }),
  ing({ id: "chili", name: "Fresh Chili", short: "Chili", role: "flavor", per100: [40, 1.9, 8.8, 0.4], price: 1.0, typical: 5, tags: ["spice"], flavor: ["heat"], cook: 1, max: 20 }),
  ing({ id: "lime", name: "Lime Juice", short: "Lime", role: "flavor", per100: [25, 0.4, 8.4, 0.1], price: 0.8, typical: 15, tags: ["citrus"], flavor: ["acid", "fresh"], cook: 0, max: 40 }),
  ing({ id: "lemon", name: "Lemon Juice", short: "Lemon", role: "flavor", per100: [22, 0.4, 6.9, 0.2], price: 0.8, typical: 15, tags: ["citrus"], flavor: ["acid", "fresh"], cook: 0, max: 40 }),
  ing({ id: "mustard", name: "Mustard", short: "Mustard", role: "flavor", per100: [66, 4.4, 5.8, 4], price: 0.6, typical: 10, tags: ["condiment"], flavor: ["tang", "sharp"], cook: 0, max: 30 }),
  ing({ id: "soy_sauce", name: "Soy Sauce", short: "Soy Sauce", role: "flavor", per100: [53, 8.1, 4.9, 0.6], price: 0.5, typical: 10, tags: ["condiment", "high-sodium"], allergens: ["soy", "gluten"], flavor: ["umami", "salty"], cook: 0, max: 30 }),
  ing({ id: "nutritional_yeast", name: "Nutritional Yeast", short: "Nutritional Yeast", role: "flavor", per100: [360, 50, 36, 5], price: 3.0, typical: 5, source: "ESTIMATED", tags: ["plant"], flavor: ["umami", "cheesy"], cook: 0, max: 20 }),
  ing({ id: "xanthan_gum", name: "Xanthan Gum", short: "Xanthan Gum", role: "flavor", per100: [333, 0, 77, 0], price: 12, typical: 1, source: "ESTIMATED", tags: ["thickener"], flavor: [], texture: ["thickening", "creamy"], cook: 0, min: 0.5, max: 3 }),
  ing({ id: "guar_gum", name: "Guar Gum", short: "Guar Gum", role: "flavor", per100: [330, 5, 78, 0], price: 10, typical: 1, source: "ESTIMATED", tags: ["thickener"], flavor: [], texture: ["thickening", "creamy"], cook: 0, min: 0.5, max: 3 }),

  // BASES / EXTRAS (craving makeovers, cooking fat)
  ing({ id: "skim_milk", name: "Skim Milk", short: "Skim Milk", role: "base", per100: [34, 3.4, 5, 0.1], price: 0.25, typical: 200, tags: ["dairy"], allergens: ["dairy"], flavor: ["creamy"], texture: ["smooth"], cook: 0, min: 50, max: 400 }),
  ing({ id: "cocoa_powder", name: "Unsweetened Cocoa Powder", short: "Cocoa", role: "flavor", per100: [228, 19.6, 58, 13.7], price: 2.5, typical: 8, tags: ["chocolate"], flavor: ["chocolate", "bitter"], cook: 0, min: 3, max: 25 }),
  ing({ id: "cooking_oil", name: "Cooking Oil", short: "Oil", role: "fat", per100: [884, 0, 0, 100], price: 0.4, typical: 5, tags: ["fat"], cooking: ["pan"], flavor: ["rich"], cook: 0, variable: true }),
]

const BY_ID = new Map(COACH_INGREDIENTS.map((item) => [item.id, item]))

export const COACH_INGREDIENT_IDS = COACH_INGREDIENTS.map((item) => item.id)

export function getIngredient(id: string): CoachIngredient | undefined {
  return BY_ID.get(id)
}

/** Throws on an unknown id — callers validate ids with the zod schema first. */
export function requireIngredient(id: string): CoachIngredient {
  const found = BY_ID.get(id)
  if (!found) throw new Error(`Unknown coach ingredient: ${id}`)
  return found
}

/* ---------- exclusion / allergy matching ---------- */

const TERM_ALIASES: Record<string, string[]> = {
  milk: ["dairy"],
  lactose: ["dairy"],
  cheese: ["dairy"],
  yogurt: ["dairy"],
  yoghurt: ["dairy"],
  whey: ["dairy"],
  eggs: ["egg"],
  egg: ["egg"],
  seafood: ["fish", "shellfish"],
  fish: ["fish"],
  shellfish: ["shellfish"],
  nuts: ["tree_nut", "peanut"],
  nut: ["tree_nut", "peanut"],
  peanut: ["peanut"],
  soy: ["soy"],
  soya: ["soy"],
  gluten: ["gluten"],
  wheat: ["gluten"],
  chicken: ["poultry"],
  poultry: ["poultry"],
  beef: ["beef"],
  meat: ["meat"],
  dairy: ["dairy"],
}

function normalizeTerm(term: string): string {
  return term.toLowerCase().trim().replace(/[^a-z0-9 _-]/g, "").replace(/\s+/g, " ")
}

/** True when a free-text allergy/exclusion matches the ingredient's name, tags or allergen groups. */
export function isIngredientBlocked(ingredient: CoachIngredient, terms: string[]): boolean {
  const name = ingredient.name.toLowerCase()
  const groups = new Set([...ingredient.allergens, ...ingredient.tags].map((tag) => tag.toLowerCase()))

  return terms.some((raw) => {
    const term = normalizeTerm(raw)
    if (!term) return false
    const singular = term.endsWith("s") && term.length > 3 ? term.slice(0, -1) : term
    if (name.includes(term) || name.includes(singular) || ingredient.id === term.replace(/ /g, "_")) return true
    const aliases = TERM_ALIASES[term] ?? TERM_ALIASES[singular] ?? []
    return aliases.some((alias) => groups.has(alias)) || groups.has(term) || groups.has(singular)
  })
}

/** Resolves free text ("chicken", "greek yogurt", "fish") to a canonical ingredient, or undefined — never guesses. */
export function findIngredientByText(text: string): CoachIngredient | undefined {
  const query = normalizeTerm(text)
  if (!query) return undefined
  const aliases: Record<string, string> = {
    fish: "white_fish",
    cod: "white_fish",
    beef: "lean_beef",
    steak: "lean_beef",
    egg: "whole_eggs",
    eggs: "whole_eggs",
    "egg white": "egg_whites",
    "egg whites": "egg_whites",
    yogurt: "greek_yogurt",
    yoghurt: "greek_yogurt",
    "greek yogurt": "greek_yogurt",
    whey: "whey_protein",
    potato: "potatoes",
    wrap: "wraps",
    tortilla: "wraps",
    toast: "bread",
    oat: "oats",
    oatmeal: "oats",
    berry: "berries",
    veg: "broccoli",
    vegetables: "broccoli",
    noodles: "shirataki",
    xanthan: "xanthan_gum",
    guar: "guar_gum",
    "soy sauce": "soy_sauce",
    cereal: "puffed_rice",
    "coco pops": "coco_pops",
    cocopops: "coco_pops",
    milk: "skim_milk",
    cocoa: "cocoa_powder",
    oil: "cooking_oil",
  }
  const direct = aliases[query]
  if (direct) return BY_ID.get(direct)
  return COACH_INGREDIENTS.find((item) => {
    const name = item.name.toLowerCase()
    const short = item.shortName.toLowerCase()
    return query === item.id || query === short || query === name || name.includes(query) || query.includes(short)
  })
}
