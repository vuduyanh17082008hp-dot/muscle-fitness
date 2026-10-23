import { foldText, getLocalFallbackById } from "@/lib/nutrition/food-data/local-fallback"
import type { NormalizedFood, NormalizedFoodMacros } from "@/lib/nutrition/food-data/types"
import { scaleMacrosToGrams } from "@/lib/nutrition/food-log-calculator"
import type { CookingMethod } from "@/lib/nutrition/photo-match-review"
import type { PhotoEstimateItem } from "@/lib/nutrition/photo-estimate"

/**
 * Curated Vietnamese dish templates. A dish has NO nutrient values of its own: it is a list of typical components,
 * each pointing at one record of the offline food table (lib/nutrition/food-data/local-fallback.ts, mostly verbatim
 * USDA SR Legacy copies). Totals are always the sum of the components, so a dish can never be counted on top of
 * its own parts.
 *
 * Grams are a practical single-bowl/plate default for review, not a claim that every stall makes the dish this way.
 * Pure and client-safe.
 */

export type DishComponent = {
  /** A local-fallback record id. */
  foodId: string
  /** What the part is in this dish. */
  label: string
  grams: number
  method: CookingMethod
  /** Common but not in every bowl: starts unticked so it is only counted when the user says so. */
  optional?: boolean
  /** Why this part deserves a look (proxy record, quantity varies widely). */
  note?: string
  /** The record already reflects how it is prepared, so no added-oil line is suggested. */
  noAddedOil?: boolean
}

export type VietnameseDish = {
  id: string
  nameVi: string
  nameEn: string
  /** Other menu / spoken names. Matched with diacritics folded. */
  aliases: string[]
  components: DishComponent[]
  /** Parts of the dish this template cannot price, said once. */
  notModeled?: string
}

const BROTH_NOTE = "Restaurant broth is usually richer than this broth record, so its fat may be undercounted. Lower it if you left most of the broth."
const DIP_NOTE = "Dipping sauce: count only what you ate."
const PICKLE_NOTE = "Pickled carrot/daikon, priced as raw carrot. The pickling sugar isn't counted."

const noodles = (grams: number, label = "Rice noodles"): DishComponent => ({ foodId: "local-rice-noodles-cooked", label, grams, method: "boiled", noAddedOil: true })
const raw = (foodId: string, label: string, grams: number, optional?: boolean): DishComponent => ({ foodId, label, grams, method: "raw", ...(optional ? { optional } : {}) })
const sauce = (foodId: string, label: string, grams: number, note?: string, optional?: boolean): DishComponent => ({ foodId, label, grams, method: "raw", noAddedOil: true, ...(note ? { note } : {}), ...(optional ? { optional } : {}) })
const broth = (foodId: string, grams: number, note = BROTH_NOTE): DishComponent => ({ foodId, label: "Broth", grams, method: "boiled", noAddedOil: true, note })

export const VIETNAMESE_DISHES: VietnameseDish[] = [
  {
    id: "pho_bo",
    nameVi: "Phở bò",
    nameEn: "Beef pho",
    aliases: ["pho", "pho bo", "beef pho", "beef noodle soup", "pho tai", "pho chin", "pho tai nam"],
    components: [
      noodles(200, "Rice noodles (bánh phở)"),
      { foodId: "local-beef-lean-cooked", label: "Sliced beef (tái / chín)", grams: 80, method: "boiled", noAddedOil: true },
      { foodId: "local-beef-brisket-braised", label: "Brisket (nạm)", grams: 40, method: "boiled", noAddedOil: true, optional: true },
      broth("local-beef-broth", 400),
      raw("local-bean-sprouts-raw", "Bean sprouts", 30),
      raw("local-basil-fresh", "Thai basil", 5),
      raw("local-onion-raw", "Onion", 15),
      raw("local-scallion-raw", "Scallion", 5),
      sauce("local-hoisin-sauce", "Hoisin sauce", 10, "Only if you added it.", true),
    ],
  },
  {
    id: "pho_ga",
    nameVi: "Phở gà",
    nameEn: "Chicken pho",
    aliases: ["pho ga", "chicken pho", "chicken noodle soup"],
    components: [
      noodles(200, "Rice noodles (bánh phở)"),
      { foodId: "local-chicken-stewed", label: "Poached chicken with skin", grams: 90, method: "boiled", noAddedOil: true },
      broth("local-chicken-broth", 400),
      raw("local-onion-raw", "Onion", 10),
      raw("local-scallion-raw", "Scallion", 5),
      raw("local-cilantro-raw", "Cilantro", 3),
      raw("local-bean-sprouts-raw", "Bean sprouts", 20, true),
    ],
  },
  {
    id: "bun_bo_hue",
    nameVi: "Bún bò Huế",
    nameEn: "Hue-style spicy beef noodle soup",
    aliases: ["bun bo hue", "bun bo", "hue beef noodle soup", "spicy beef noodle soup"],
    components: [
      noodles(220, "Thick rice vermicelli (bún)"),
      { foodId: "local-beef-brisket-braised", label: "Beef shank / brisket", grams: 70, method: "boiled", noAddedOil: true },
      { foodId: "local-pork-leg-roasted", label: "Pork knuckle (giò heo)", grams: 60, method: "boiled", noAddedOil: true, note: "Priced as roasted pork leg, the closest reference record. Knuckle has more skin and fat." },
      { foodId: "local-cha-lua", label: "Pork roll (chả)", grams: 25, method: "boiled", noAddedOil: true, optional: true },
      broth("local-beef-broth", 450),
      sauce("local-vegetable-oil", "Chili-lemongrass oil (sa tế)", 5, "Assumed topping. Raise it if the broth looked oily, or set it to 0."),
      raw("local-bean-sprouts-raw", "Bean sprouts", 20),
      raw("local-basil-fresh", "Herbs", 5),
      raw("local-onion-raw", "Onion", 10),
    ],
    notModeled: "Congealed pork blood (huyết) has no reference record here. Add it by hand if you ate it.",
  },
  {
    id: "bun_cha",
    nameVi: "Bún chả",
    nameEn: "Grilled pork with rice vermicelli",
    aliases: ["bun cha", "bun cha ha noi", "hanoi grilled pork noodles"],
    components: [
      noodles(200, "Rice vermicelli (bún)"),
      { foodId: "local-pork-ground-cooked", label: "Grilled pork patties (chả viên)", grams: 90, method: "grilled" },
      { foodId: "local-pork-shoulder-grilled", label: "Grilled pork belly/shoulder slices", grams: 70, method: "grilled" },
      sauce("local-fish-sauce", "Dipping sauce: fish sauce", 15, DIP_NOTE),
      sauce("local-sugar", "Dipping sauce: sugar", 10, DIP_NOTE),
      raw("local-carrot-raw", "Pickled carrot / green papaya", 20),
      raw("local-lettuce-raw", "Lettuce", 30),
      raw("local-basil-fresh", "Herbs", 5),
    ],
  },
  {
    id: "bun_thit_nuong",
    nameVi: "Bún thịt nướng",
    nameEn: "Grilled pork vermicelli bowl",
    aliases: ["bun thit nuong", "grilled pork vermicelli", "vermicelli bowl", "bun thit nuong cha gio"],
    components: [
      noodles(200, "Rice vermicelli (bún)"),
      { foodId: "local-pork-shoulder-grilled", label: "Grilled pork", grams: 110, method: "grilled" },
      raw("local-lettuce-raw", "Lettuce", 30),
      raw("local-cucumber-raw", "Cucumber", 30),
      raw("local-bean-sprouts-raw", "Bean sprouts", 20),
      raw("local-basil-fresh", "Herbs", 5),
      { ...raw("local-carrot-raw", "Pickled carrot / daikon", 15), note: PICKLE_NOTE },
      sauce("local-peanuts-roasted", "Crushed peanuts", 10),
      sauce("local-vegetable-oil", "Scallion oil (mỡ hành)", 5, "Priced as oil. Set to 0 if there was none."),
      sauce("local-fish-sauce", "Dressing: fish sauce", 10, DIP_NOTE),
      sauce("local-sugar", "Dressing: sugar", 8, DIP_NOTE),
    ],
    notModeled: "A fried spring roll (chả giò) on top isn't included. Add it if you had one.",
  },
  {
    id: "com_tam_suon",
    nameVi: "Cơm tấm sườn",
    nameEn: "Broken rice with grilled pork chop",
    aliases: ["com tam", "com tam suon", "com tam suon bi cha", "broken rice pork chop", "broken rice with pork chop"],
    components: [
      { foodId: "local-white-rice-cooked", label: "Broken rice (cơm tấm)", grams: 220, method: "steamed", noAddedOil: true, note: "Priced as cooked white rice. Broken rice is the same grain." },
      { foodId: "local-pork-chop-grilled", label: "Grilled pork chop (sườn)", grams: 120, method: "grilled" },
      { foodId: "local-egg-fried", label: "Fried egg (ốp la)", grams: 50, method: "fried", optional: true },
      { foodId: "local-cha-lua", label: "Steamed egg-pork meatloaf (chả trứng)", grams: 40, method: "steamed", noAddedOil: true, optional: true, note: "Priced as a pork-roll proxy." },
      raw("local-cucumber-raw", "Cucumber", 30),
      raw("local-tomato-raw", "Tomato", 20),
      { ...raw("local-carrot-raw", "Pickled carrot / daikon", 15), note: PICKLE_NOTE },
      sauce("local-vegetable-oil", "Scallion oil (mỡ hành)", 5, "Priced as oil. Set to 0 if there was none."),
      sauce("local-fish-sauce", "Sweet fish sauce: fish sauce", 15, DIP_NOTE),
      sauce("local-sugar", "Sweet fish sauce: sugar", 10, DIP_NOTE),
    ],
  },
  {
    id: "com_ga",
    nameVi: "Cơm gà",
    nameEn: "Vietnamese chicken rice",
    aliases: ["com ga", "com ga hoi an", "com ga xoi mo", "vietnamese chicken rice"],
    components: [
      { foodId: "local-white-rice-cooked", label: "Rice", grams: 220, method: "steamed", noAddedOil: true },
      sauce("local-vegetable-oil", "Chicken fat in the rice", 8, "Cơm gà rice is often cooked in chicken fat. Priced as oil. Tick it if the rice looked glossy.", true),
      { foodId: "local-chicken-stewed", label: "Poached chicken with skin", grams: 120, method: "boiled", noAddedOil: true },
      raw("local-cucumber-raw", "Cucumber", 30),
      raw("local-onion-raw", "Pickled onion", 15),
      raw("local-cilantro-raw", "Herbs", 3),
      { ...broth("local-chicken-broth", 200, "Side soup, only if it came with the plate."), optional: true },
    ],
  },
  {
    id: "banh_mi_thit",
    nameVi: "Bánh mì thịt",
    nameEn: "Vietnamese pork baguette",
    aliases: ["banh mi", "banh mi thit", "banh mi dac biet", "pork banh mi", "vietnamese sandwich"],
    components: [
      { foodId: "local-baguette", label: "Baguette", grams: 90, method: "baked", noAddedOil: true },
      { foodId: "local-pork-shoulder-grilled", label: "Roast / grilled pork", grams: 50, method: "roasted", noAddedOil: true, note: "Cold cuts vary a lot. Priced as grilled pork shoulder." },
      { foodId: "local-cha-lua", label: "Pork roll (chả lụa)", grams: 25, method: "boiled", noAddedOil: true },
      sauce("local-liver-pate", "Pâté", 15),
      sauce("local-mayonnaise", "Mayonnaise / butter spread", 10, "Spread amount varies. Edit if it was heavy or light."),
      { ...raw("local-carrot-raw", "Pickled carrot / daikon", 15), note: PICKLE_NOTE },
      raw("local-cucumber-raw", "Cucumber", 20),
      raw("local-cilantro-raw", "Cilantro", 3),
    ],
  },
  {
    id: "banh_mi_trung",
    nameVi: "Bánh mì trứng",
    nameEn: "Egg baguette",
    aliases: ["banh mi trung", "banh mi op la", "egg banh mi", "egg baguette"],
    components: [
      { foodId: "local-baguette", label: "Baguette", grams: 90, method: "baked", noAddedOil: true },
      { foodId: "local-egg-fried", label: "Fried eggs (2)", grams: 100, method: "fried" },
      sauce("local-mayonnaise", "Mayonnaise / butter spread", 5, undefined, true),
      raw("local-cucumber-raw", "Cucumber", 20),
      raw("local-cilantro-raw", "Cilantro", 3),
    ],
  },
  {
    id: "bun_rieu",
    nameVi: "Bún riêu",
    nameEn: "Crab and tomato noodle soup",
    aliases: ["bun rieu", "bun rieu cua", "crab noodle soup", "crab tomato noodle soup"],
    components: [
      noodles(200, "Rice vermicelli (bún)"),
      { foodId: "local-crab-cooked", label: "Crab paste (riêu cua)", grams: 50, method: "boiled", noAddedOil: true, note: "Riêu is crab mixed with egg and pork. Priced as plain cooked crab meat." },
      { foodId: "local-tomato-raw", label: "Tomato", grams: 60, method: "boiled", noAddedOil: true },
      broth("local-chicken-broth", 400, `Priced as chicken broth (no crab/pork-bone broth record). ${BROTH_NOTE}`),
      raw("local-bean-sprouts-raw", "Bean sprouts", 20),
      raw("local-lettuce-raw", "Lettuce / herbs", 20),
    ],
    notModeled: "Fried tofu and congealed blood, when served, aren't included. Add them by hand.",
  },
  {
    id: "hu_tieu",
    nameVi: "Hủ tiếu",
    nameEn: "Southern pork and shrimp noodle soup",
    aliases: ["hu tieu", "hu tieu nam vang", "hu tieu my tho", "hu tieu kho", "pork and shrimp noodle soup"],
    components: [
      noodles(200, "Rice noodles (hủ tiếu)"),
      { foodId: "local-pork-shoulder-grilled", label: "Sliced pork", grams: 60, method: "boiled", noAddedOil: true, note: "Priced as pork shoulder." },
      { foodId: "local-shrimp-cooked", label: "Shrimp", grams: 40, method: "boiled", noAddedOil: true },
      { foodId: "local-pork-ground-cooked", label: "Minced pork", grams: 20, method: "boiled", noAddedOil: true, optional: true },
      { foodId: "local-egg-boiled", label: "Quail eggs", grams: 20, method: "boiled", noAddedOil: true, optional: true },
      broth("local-chicken-broth", 400, `Priced as chicken broth (no pork-bone broth record). ${BROTH_NOTE}`),
      raw("local-bean-sprouts-raw", "Bean sprouts", 30),
      raw("local-scallion-raw", "Scallion", 5),
    ],
  },
  {
    id: "mi_quang",
    nameVi: "Mì Quảng",
    nameEn: "Quang-style turmeric noodles",
    aliases: ["mi quang", "quang noodles", "turmeric noodles"],
    components: [
      noodles(180, "Turmeric rice noodles"),
      { foodId: "local-pork-shoulder-grilled", label: "Pork", grams: 60, method: "boiled", noAddedOil: true },
      { foodId: "local-shrimp-cooked", label: "Shrimp", grams: 40, method: "boiled", noAddedOil: true },
      { foodId: "local-egg-boiled", label: "Quail eggs", grams: 25, method: "boiled", noAddedOil: true, optional: true },
      broth("local-chicken-broth", 120, "Mì Quảng has only a little broth. Priced as chicken broth."),
      sauce("local-vegetable-oil", "Annatto / pork-fat oil on top", 5, "Assumed topping. Set to 0 if the bowl wasn't oily."),
      sauce("local-peanuts-roasted", "Roasted peanuts", 10),
      { foodId: "local-rice-paper-dry", label: "Sesame rice cracker (bánh tráng)", grams: 15, method: "roasted", noAddedOil: true, optional: true, note: "Priced as dry rice paper." },
      raw("local-lettuce-raw", "Lettuce / herbs", 25),
    ],
  },
  {
    id: "goi_cuon",
    nameVi: "Gỏi cuốn",
    nameEn: "Fresh spring rolls (2 rolls)",
    aliases: ["goi cuon", "fresh spring rolls", "summer rolls", "fresh rolls", "salad rolls"],
    components: [
      { foodId: "local-rice-paper-dry", label: "Rice paper (dry weight)", grams: 20, method: "raw", noAddedOil: true },
      { foodId: "local-shrimp-cooked", label: "Shrimp", grams: 40, method: "boiled", noAddedOil: true },
      { foodId: "local-pork-shoulder-grilled", label: "Boiled pork slices", grams: 40, method: "boiled", noAddedOil: true, note: "Priced as pork shoulder." },
      noodles(60, "Rice vermicelli"),
      raw("local-lettuce-raw", "Lettuce", 20),
      raw("local-basil-fresh", "Herbs", 5),
      sauce("local-hoisin-sauce", "Hoisin dipping sauce", 20, DIP_NOTE),
      sauce("local-peanuts-roasted", "Peanuts in the sauce", 5, DIP_NOTE),
    ],
  },
  {
    id: "banh_cuon",
    nameVi: "Bánh cuốn",
    nameEn: "Steamed rice rolls",
    aliases: ["banh cuon", "steamed rice rolls", "rice rolls"],
    components: [
      { foodId: "local-rice-sheet-steamed", label: "Steamed rice sheets", grams: 250, method: "steamed", noAddedOil: true },
      { foodId: "local-pork-ground-cooked", label: "Minced pork & mushroom filling", grams: 40, method: "stir_fried" },
      { foodId: "local-cha-lua", label: "Pork roll (chả lụa)", grams: 30, method: "boiled", noAddedOil: true },
      sauce("local-fish-sauce", "Dipping sauce: fish sauce", 15, DIP_NOTE),
      sauce("local-sugar", "Dipping sauce: sugar", 8, DIP_NOTE),
      raw("local-bean-sprouts-raw", "Bean sprouts", 20),
      raw("local-cucumber-raw", "Cucumber", 20),
      raw("local-basil-fresh", "Herbs", 3),
    ],
    notModeled: "Fried shallots on top aren't included.",
  },
  {
    id: "chao_ga",
    nameVi: "Cháo gà",
    nameEn: "Chicken rice porridge",
    aliases: ["chao ga", "chicken congee", "chicken porridge", "chicken rice porridge"],
    components: [
      { foodId: "local-white-rice-cooked", label: "Rice in the porridge (as cooked rice)", grams: 150, method: "boiled", noAddedOil: true, note: "Porridge is rice simmered in broth. This is the cooked-rice share of the bowl. Thick porridge has more." },
      broth("local-chicken-broth", 250, "The liquid part of the porridge."),
      { foodId: "local-chicken-stewed", label: "Shredded chicken", grams: 70, method: "boiled", noAddedOil: true },
      raw("local-scallion-raw", "Scallion", 5),
      raw("local-cilantro-raw", "Cilantro", 3),
    ],
    notModeled: "Fried shallots or quẩy (fried dough) on the side aren't included.",
  },
]

const STOP = new Set(["a", "an", "the", "bowl", "plate", "of", "with", "vietnamese", "dish"])
const phrase = (text: string) => ` ${foldText(text).replace(/[^a-z0-9]+/g, " ").trim()} `
const dishPhrases = (dish: VietnameseDish) => [dish.nameVi, dish.nameEn, ...dish.aliases].map(phrase)

/** Dishes whose names contain every query word (diacritics optional): "bun bo" finds Bún bò Huế. */
export function searchVietnameseDishes(query: string): VietnameseDish[] {
  const words = phrase(query).trim().split(" ").filter((word) => word && !STOP.has(word))
  if (words.length === 0) return []
  return VIETNAMESE_DISHES.filter((dish) => dishPhrases(dish).some((name) => words.every((word) => name.includes(` ${word} `))))
}

/**
 * The catalog dish a free-text dish name refers to, or null. The longest catalog name found inside the text wins,
 * so "chicken pho" is Phở gà, not Phở bò.
 */
export function matchVietnameseDish(text: string | null | undefined): VietnameseDish | null {
  if (!text) return null
  const target = phrase(text)
  let best: { dish: VietnameseDish; length: number } | null = null
  for (const dish of VIETNAMESE_DISHES) {
    for (const name of dishPhrases(dish)) {
      if (target.includes(name) && (!best || name.length > best.length)) best = { dish, length: name.length }
    }
  }
  return best?.dish ?? null
}

export type ResolvedDishComponent = DishComponent & { food: NormalizedFood }

/** Components with their records, grams scaled by `portion` (1 = the template's bowl). */
export function resolveDishComponents(dish: VietnameseDish, portion = 1): ResolvedDishComponent[] {
  return dish.components.map((component) => {
    const food = getLocalFallbackById(component.foodId)
    if (!food) throw new Error(`Dish ${dish.id} references unknown food ${component.foodId}`)
    return { ...component, grams: Math.max(1, Math.round(component.grams * portion)), food }
  })
}

/** Sum of the given components' scaled macros: the only way a dish total is ever computed. */
export function sumComponentMacros(parts: Array<{ food: Pick<NormalizedFood, "per100g">; grams: number }>): NormalizedFoodMacros {
  const total = parts.reduce(
    (acc, part) => {
      const scaled = scaleMacrosToGrams(part.food.per100g, part.grams)
      return { calories: acc.calories + scaled.calories, protein: acc.protein + scaled.protein, carbs: acc.carbs + scaled.carbs, fat: acc.fat + scaled.fat }
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  )
  const round1 = (value: number) => Math.round(value * 10) / 10
  return { calories: Math.round(total.calories), protein: round1(total.protein), carbs: round1(total.carbs), fat: round1(total.fat) }
}

/** Default total for the dish: required components only (optional ones start unticked). */
export function dishDefaultTotals(dish: VietnameseDish, portion = 1): NormalizedFoodMacros {
  return sumComponentMacros(resolveDishComponents(dish, portion).filter((part) => !part.optional))
}

/**
 * A catalog dish's parts as review items, scaled so the required parts weigh about `seenGrams`. From a photo the
 * parts are flagged as not seen; when the user picked the dish themselves they are just the recipe.
 */
export function templateItems(dish: VietnameseDish, seenGrams: number, origin: "photo" | "picked" = "photo"): PhotoEstimateItem[] {
  const templateGrams = dish.components.filter((c) => !c.optional).reduce((sum, c) => sum + c.grams, 0)
  const portion = Math.min(2, Math.max(0.5, seenGrams / templateGrams))
  return resolveDishComponents(dish, portion).map((part) => ({
    detectedName: part.label,
    estimatedGrams: part.grams,
    detectionConfidence: "low",
    notes: [part.note, origin === "photo" ? "Typical part of this dish, not seen separately in the photo — untick it if it wasn't there." : null].filter(Boolean).join(" ") || undefined,
    preparation: part.method,
    preparationCertain: true,
    dish: dish.nameVi,
    groundedFood: part.food,
    scaledMacros: scaleMacrosToGrams(part.food.per100g, part.grams),
    candidates: [part.food],
    searchStatus: "results",
    fromTemplate: true,
    ...(part.optional ? { optional: true } : {}),
    ...(part.noAddedOil ? { noAddedOil: true } : {}),
  }))
}
