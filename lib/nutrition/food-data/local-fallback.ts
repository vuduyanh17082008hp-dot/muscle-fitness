/**
 * Small, curated local fallback food table.
 *
 * This exists purely for resilience — used only when USDA/Open Food
 * Facts are unavailable, unconfigured, or a query matches nothing
 * useful. It is NOT a replacement for USDA FoodData Central and is
 * intentionally kept small (see docs/NUTRITION_DATA_SOURCES.md,
 * "Fallback strategy").
 *
 * Every entry states its preparationState explicitly so raw and
 * cooked values are never confused with each other.
 */

import type { NormalizedFood } from "./types"

const now = () => new Date().toISOString()

function localFood(
  input: Omit<NormalizedFood, "source" | "sourceLabel" | "confidence" | "retrievedAt">,
): NormalizedFood {
  return {
    ...input,
    // the stable id the server re-resolves a "local" log claim by (lib/nutrition/food-log/provenance.ts)
    sourceId: input.id,
    source: "local",
    sourceLabel: "Local fallback",
    confidence: "fallback",
    retrievedAt: now(),
  }
}

/**
 * A verbatim copy of one USDA SR Legacy record (values as published, FDC id in rawDescription), kept here so
 * common mixed-dish components stay usable when USDA is unreachable. Verified reference data, not an estimate.
 */
function usdaCopy(
  id: string,
  name: string,
  preparationState: NormalizedFood["preparationState"],
  fdcId: number,
  description: string,
  [calories, protein, carbs, fat, fiber, sodiumMg]: [number, number, number, number, number | null, number],
): NormalizedFood {
  return {
    ...localFood({ id, name, preparationState, rawDescription: `${description} (USDA FDC ${fdcId})`, per100g: { calories, protein, carbs, fat, fiber, sodiumMg } }),
    sourceLabel: `USDA SR Legacy #${fdcId} (offline copy)`,
    confidence: "high",
  }
}

/** No reference record exists for this food, so it borrows a stated proxy record's values and says so. */
function curatedEstimate(input: Omit<NormalizedFood, "source" | "sourceLabel" | "confidence" | "retrievedAt" | "isEstimated">, estimationReason: string): NormalizedFood {
  return { ...localFood(input), sourceLabel: "Curated estimate", confidence: "low", isEstimated: true, estimationReason }
}

export const LOCAL_FALLBACK_FOODS: NormalizedFood[] = [
  localFood({
    id: "local-oats-raw",
    name: "Oats",
    preparationState: "raw",
    rawDescription: "Rolled oats, dry",
    per100g: { calories: 389, protein: 16.9, carbs: 66.3, fat: 6.9, fiber: 10.6 },
  }),
  usdaCopy("local-white-rice-cooked", "White Rice — cooked", "cooked", 168878, "Rice, white, long-grain, regular, enriched, cooked", [130, 2.69, 28.2, 0.28, 0.4, 1]),
  localFood({
    id: "local-white-rice-raw",
    name: "White Rice — dry/raw",
    preparationState: "raw",
    per100g: { calories: 365, protein: 7.1, carbs: 80, fat: 0.7, fiber: 1.3 },
  }),
  localFood({
    id: "local-chicken-breast-raw",
    name: "Chicken Breast — raw",
    preparationState: "raw",
    per100g: { calories: 120, protein: 22.5, carbs: 0, fat: 2.6 },
  }),
  localFood({
    id: "local-chicken-breast-cooked",
    name: "Chicken Breast — cooked",
    preparationState: "cooked",
    per100g: { calories: 165, protein: 31, carbs: 0, fat: 3.6 },
  }),
  localFood({
    id: "local-cod-raw",
    name: "Cod — raw",
    preparationState: "raw",
    per100g: { calories: 82, protein: 18, carbs: 0, fat: 0.7, sodiumMg: 54 },
  }),
  localFood({
    id: "local-salmon-raw",
    name: "Salmon — raw",
    preparationState: "raw",
    per100g: { calories: 142, protein: 20, carbs: 0, fat: 6.3 },
  }),
  localFood({
    id: "local-egg-whole-raw",
    name: "Whole Egg — raw",
    preparationState: "raw",
    per100g: { calories: 155, protein: 13, carbs: 1.1, fat: 11 },
  }),
  localFood({
    id: "local-greek-yogurt-plain",
    name: "Greek Yogurt — plain",
    preparationState: "packaged",
    per100g: { calories: 59, protein: 10, carbs: 3.6, fat: 0.4, sugar: 3.6 },
  }),
  localFood({
    id: "local-whey-protein",
    name: "Whey Protein",
    preparationState: "packaged",
    per100g: { calories: 380, protein: 80, carbs: 7, fat: 4 },
  }),
  localFood({
    id: "local-banana-raw",
    name: "Banana — raw",
    preparationState: "raw",
    per100g: { calories: 89, protein: 1.1, carbs: 22.8, fat: 0.3, fiber: 2.6, sugar: 12.2 },
  }),
  localFood({
    id: "local-apple-raw",
    name: "Apple — raw",
    preparationState: "raw",
    per100g: { calories: 52, protein: 0.3, carbs: 13.8, fat: 0.2, fiber: 2.4, sugar: 10.4 },
  }),
  localFood({
    id: "local-blueberries-raw",
    name: "Blueberries — raw",
    preparationState: "raw",
    per100g: { calories: 57, protein: 0.7, carbs: 14.5, fat: 0.3, fiber: 2.4, sugar: 10 },
  }),
  localFood({
    id: "local-broccoli-raw",
    name: "Broccoli — raw",
    preparationState: "raw",
    per100g: { calories: 34, protein: 2.8, carbs: 6.6, fat: 0.4, fiber: 2.6 },
  }),
  localFood({
    id: "local-spinach-raw",
    name: "Spinach — raw",
    preparationState: "raw",
    per100g: { calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4, fiber: 2.2 },
  }),
  localFood({
    id: "local-potato-raw",
    name: "Potato — raw",
    preparationState: "raw",
    per100g: { calories: 77, protein: 2, carbs: 17.5, fat: 0.1, fiber: 2.2 },
  }),
  localFood({
    id: "local-olive-oil",
    name: "Olive Oil",
    preparationState: "packaged",
    per100g: { calories: 884, protein: 0, carbs: 0, fat: 100 },
  }),
  localFood({
    id: "local-honey",
    name: "Honey",
    preparationState: "packaged",
    per100g: { calories: 304, protein: 0.3, carbs: 82.4, fat: 0, sugar: 82.1 },
  }),
  localFood({
    id: "local-whole-wheat-bread",
    name: "Whole Wheat Bread",
    preparationState: "packaged",
    per100g: { calories: 247, protein: 13, carbs: 41, fat: 3.4, fiber: 6 },
  }),
  localFood({
    id: "local-peanut-butter",
    name: "Peanut Butter",
    preparationState: "packaged",
    per100g: { calories: 588, protein: 25, carbs: 20, fat: 50, fiber: 6 },
  }),
  localFood({
    id: "local-skim-milk",
    name: "Skim Milk",
    preparationState: "packaged",
    per100g: { calories: 34, protein: 3.4, carbs: 5, fat: 0.1, sugar: 5 },
  }),
  // Mixed-dish components (lib/nutrition/vietnamese-dishes.ts): USDA SR Legacy copies, looked up 2026-10-23.
  usdaCopy("local-rice-noodles-cooked", "Rice Noodles — cooked", "cooked", 168914, "Rice noodles, cooked", [108, 1.79, 24, 0.2, 1, 19]),
  usdaCopy("local-chicken-stewed", "Chicken — meat and skin, stewed", "cooked", 171051, "Chicken, broilers or fryers, meat and skin, cooked, stewed", [219, 24.7, 0, 12.6, 0, 67]),
  usdaCopy("local-chicken-roasted", "Chicken — meat only, roasted", "cooked", 171054, "Chicken, broilers or fryers, meat only, cooked, roasted", [190, 28.9, 0, 7.41, 0, 86]),
  usdaCopy("local-beef-lean-cooked", "Beef — lean, cooked", "cooked", 170634, 'Beef, round, eye of round roast, boneless, separable lean only, trimmed to 0" fat, choice, cooked, roasted', [166, 29.9, 0, 4.26, 0, 66]),
  usdaCopy("local-beef-brisket-braised", "Beef Brisket — braised", "cooked", 174741, "Beef, New Zealand, imported, brisket point end, separable lean and fat, cooked, braised", [250, 31.9, 0, 13.6, 0, 29]),
  usdaCopy("local-pork-shoulder-grilled", "Pork Shoulder — grilled", "cooked", 167851, "Pork, fresh, shoulder, blade, boston (steaks), separable lean and fat, cooked, broiled", [259, 25.6, 0, 16.6, 0, 69]),
  usdaCopy("local-pork-chop-grilled", "Pork Chop — grilled", "cooked", 167827, "Pork, fresh, loin, center loin (chops), bone-in, separable lean and fat, cooked, broiled", [209, 25.6, 0, 11.1, 0, 55]),
  usdaCopy("local-pork-ground-cooked", "Ground Pork — cooked", "cooked", 167903, "Pork, fresh, ground, cooked", [297, 25.7, 0, 20.8, 0, 73]),
  usdaCopy("local-pork-leg-roasted", "Pork Leg — roasted", "cooked", 168223, "Pork, fresh, leg (ham), whole, separable lean and fat, cooked, roasted", [273, 26.8, 0, 17.6, 0, 60]),
  usdaCopy("local-egg-fried", "Egg — fried", "cooked", 173423, "Egg, whole, cooked, fried", [196, 13.6, 0.83, 14.8, 0, 207]),
  usdaCopy("local-egg-boiled", "Egg — hard-boiled", "cooked", 173424, "Egg, whole, cooked, hard-boiled", [155, 12.6, 1.12, 10.6, 0, 124]),
  usdaCopy("local-shrimp-cooked", "Shrimp — cooked", "cooked", 175180, "Crustaceans, shrimp, cooked", [99, 24, 0.2, 0.28, null, 111]),
  usdaCopy("local-crab-cooked", "Crab — cooked", "cooked", 174205, "Crustaceans, crab, blue, cooked, moist heat", [83, 17.9, 0, 0.74, 0, 395]),
  usdaCopy("local-beef-broth", "Beef Broth", "prepared", 171538, "Soup, beef broth or bouillon canned, ready-to-serve", [7, 1.14, 0.04, 0.22, 0, 372]),
  usdaCopy("local-chicken-broth", "Chicken Broth", "prepared", 174536, "Soup, chicken broth, ready-to-serve", [6, 0.64, 0.44, 0.21, 0, 371]),
  usdaCopy("local-baguette", "French Bread (baguette)", "prepared", 172675, "Bread, french or vienna (includes sourdough)", [272, 10.8, 51.9, 2.42, 2.2, 602]),
  usdaCopy("local-lettuce-raw", "Lettuce — raw", "raw", 169249, "Lettuce, green leaf, raw", [15, 1.36, 2.87, 0.15, 1.3, 28]),
  usdaCopy("local-bean-sprouts-raw", "Bean Sprouts — raw", "raw", 169957, "Mung beans, mature seeds, sprouted, raw", [30, 3.04, 5.94, 0.18, 1.8, 6]),
  usdaCopy("local-cucumber-raw", "Cucumber — raw", "raw", 168409, "Cucumber, with peel, raw", [15, 0.65, 3.63, 0.11, 0.5, 2]),
  usdaCopy("local-tomato-raw", "Tomato — raw", "raw", 170457, "Tomatoes, red, ripe, raw, year round average", [18, 0.88, 3.89, 0.2, 1.2, 5]),
  usdaCopy("local-carrot-raw", "Carrot — raw", "raw", 170393, "Carrots, raw", [41, 0.93, 9.58, 0.24, 2.8, 69]),
  usdaCopy("local-onion-raw", "Onion — raw", "raw", 170000, "Onions, raw", [40, 1.1, 9.34, 0.1, 1.7, 4]),
  usdaCopy("local-scallion-raw", "Scallion — raw", "raw", 170005, "Onions, spring or scallions (includes tops and bulb), raw", [32, 1.83, 7.34, 0.19, 2.6, 16]),
  usdaCopy("local-basil-fresh", "Basil — fresh", "raw", 172232, "Basil, fresh", [23, 3.15, 2.65, 0.64, 1.6, 4]),
  usdaCopy("local-cilantro-raw", "Cilantro — raw", "raw", 169997, "Coriander (cilantro) leaves, raw", [23, 2.13, 3.67, 0.52, 2.8, 46]),
  usdaCopy("local-lime-juice", "Lime Juice", "raw", 168156, "Lime juice, raw", [25, 0.42, 8.42, 0.07, 0.4, 2]),
  usdaCopy("local-fish-sauce", "Fish Sauce", "packaged", 174531, "Sauce, fish, ready-to-serve", [35, 5.06, 3.64, 0.01, 0, 7850]),
  usdaCopy("local-hoisin-sauce", "Hoisin Sauce", "packaged", 172886, "Sauce, hoisin, ready-to-serve", [220, 3.31, 44.1, 3.39, 2.8, 1620]),
  usdaCopy("local-sugar", "Sugar — granulated", "packaged", 169655, "Sugars, granulated", [387, 0, 100, 0, 0, 1]),
  usdaCopy("local-peanuts-roasted", "Peanuts — dry-roasted", "prepared", 173806, "Peanuts, all types, dry-roasted, without salt", [587, 24.4, 21.3, 49.7, 8.4, 6]),
  usdaCopy("local-mayonnaise", "Mayonnaise", "packaged", 171009, "Salad dressing, mayonnaise, regular", [680, 0.96, 0.57, 74.8, 0, 635]),
  usdaCopy("local-vegetable-oil", "Vegetable Oil (soybean)", "packaged", 171411, "Oil, soybean, salad or cooking", [884, 0, 0, 100, 0, 0]),
  usdaCopy("local-liver-pate", "Liver Pâté", "packaged", 172930, "Pate, liver, not specified, canned", [319, 14.2, 1.5, 28, 0, 697]),
  curatedEstimate(
    { id: "local-rice-paper-dry", name: "Rice Paper — dry", preparationState: "raw", per100g: { calories: 364, protein: 5.95, carbs: 80.2, fat: 0.56, fiber: 1.6, sodiumMg: 182 } },
    'No USDA record for rice paper; values borrowed from "Rice noodles, dry" (USDA FDC 169742), the same rice-starch base.',
  ),
  curatedEstimate(
    { id: "local-rice-sheet-steamed", name: "Steamed Rice Sheets", preparationState: "cooked", per100g: { calories: 108, protein: 1.79, carbs: 24, fat: 0.2, fiber: 1, sodiumMg: 19 } },
    'No USDA record for steamed rice sheets (bánh cuốn / bánh ướt); values borrowed from "Rice noodles, cooked" (USDA FDC 168914), the same rice batter.',
  ),
  curatedEstimate(
    { id: "local-cha-lua", name: "Vietnamese Pork Roll (chả lụa)", preparationState: "prepared", per100g: { calories: 164, protein: 16.6, carbs: 3.63, fat: 8.8, fiber: 1.3, sodiumMg: 814 } },
    'No USDA record for chả lụa; values borrowed from "Ham, sliced, regular" (USDA FDC 173864), a comparable cooked pork product.',
  ),
]

/**
 * The word a name match must include, for records whose other name words describe a different food: "baked beans"
 * is not bean sprouts, "steamed vegetables" is not vegetable oil, "grilled fish" is not fish sauce.
 */
const LOCAL_HEAD_WORD: Record<string, string> = {
  "local-bean-sprouts-raw": "sprout",
  "local-fish-sauce": "sauce",
  "local-hoisin-sauce": "hoisin",
  "local-vegetable-oil": "oil",
  "local-beef-broth": "broth",
  "local-chicken-broth": "broth",
  "local-liver-pate": "pate",
  "local-rice-paper-dry": "paper",
  "local-rice-noodles-cooked": "noodle",
  "local-rice-sheet-steamed": "sheet",
  "local-baguette": "bread",
  "local-lime-juice": "lime",
  "local-cha-lua": "roll",
}

/**
 * Other names a record answers to (Vietnamese, menu English), searched with diacritics folded; the record's own
 * name is never rewritten. Only names for the SAME food: a proxy (pork leg for pork knuckle) is stated by the dish
 * template, never aliased here.
 */
const LOCAL_ALIASES: Record<string, string[]> = {
  "local-white-rice-cooked": ["cơm", "cơm trắng", "cơm tấm", "broken rice", "steamed rice"],
  "local-rice-noodles-cooked": ["bánh phở", "pho noodles", "bún", "rice vermicelli", "vermicelli", "hủ tiếu", "rice sticks", "mì quảng noodles"],
  "local-chicken-stewed": ["gà", "thịt gà", "gà luộc", "boiled chicken", "chicken with skin"],
  "local-chicken-roasted": ["gà nướng", "roast chicken"],
  "local-beef-lean-cooked": ["thịt bò", "bò tái", "bò chín", "sliced beef", "beef slices", "rare beef"],
  "local-beef-brisket-braised": ["nạm", "gầu", "bò nạm"],
  "local-pork-shoulder-grilled": ["thịt nướng", "thịt heo nướng", "thịt heo", "thịt lợn", "xá xíu", "bbq pork"],
  "local-pork-chop-grilled": ["sườn", "sườn nướng", "sườn cốt lết"],
  "local-pork-ground-cooked": ["thịt băm", "chả viên", "minced pork", "pork patty", "pork patties"],
  "local-egg-fried": ["trứng ốp la", "trứng chiên", "fried egg"],
  "local-egg-boiled": ["trứng luộc", "boiled egg"],
  "local-shrimp-cooked": ["tôm", "prawn", "prawns"],
  "local-crab-cooked": ["cua", "crab meat"],
  "local-beef-broth": ["nước dùng bò", "nước lèo", "pho broth", "beef soup"],
  "local-chicken-broth": ["nước dùng gà", "chicken soup"],
  "local-baguette": ["bánh mì", "baguette", "bread roll"],
  "local-lettuce-raw": ["xà lách", "rau sống"],
  "local-bean-sprouts-raw": ["giá", "giá đỗ", "mung bean sprouts"],
  "local-cucumber-raw": ["dưa leo", "dưa chuột"],
  "local-tomato-raw": ["cà chua"],
  "local-carrot-raw": ["cà rốt"],
  "local-onion-raw": ["hành tây"],
  "local-scallion-raw": ["hành lá", "green onion", "spring onion"],
  "local-basil-fresh": ["húng quế", "thai basil", "rau thơm", "herbs"],
  "local-cilantro-raw": ["ngò", "ngò rí", "rau mùi", "coriander"],
  "local-lime-juice": ["chanh", "lime"],
  "local-fish-sauce": ["nước mắm"],
  "local-hoisin-sauce": ["tương đen"],
  "local-sugar": ["đường"],
  "local-peanuts-roasted": ["đậu phộng", "lạc", "peanut"],
  "local-vegetable-oil": ["dầu ăn", "cooking oil", "mỡ hành", "scallion oil"],
  "local-liver-pate": ["pa tê", "pate"],
  "local-rice-paper-dry": ["bánh tráng"],
  "local-rice-sheet-steamed": ["bánh cuốn", "bánh ướt", "rice sheets"],
  "local-cha-lua": ["chả lụa", "giò lụa", "pork roll"],
}


function normalize(value: string): string {
  return value.toLowerCase().trim()
}

/** Comparison-only fold: lower case, Vietnamese diacritics and đ stripped ("Bún bò Huế" → "bun bo hue"). Never stored. */
export function foldText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().trim()
}

// Preparation/serving words say HOW a food was made, not WHICH food — "steamed chicken" should still find chicken.
const PREP_WORDS = new Set(["cooked", "steamed", "boiled", "grilled", "roasted", "baked", "fried", "stir", "poached", "braised", "stewed", "sauteed", "pan", "deep", "raw", "fresh", "plain", "sliced", "slices", "chopped", "diced", "shredded", "piece", "pieces", "of", "and", "with", "a"])
/** True for a word that says how a food was prepared, not which food it is ("braised", "sliced"). */
export function isPreparationWord(word: string): boolean {
  return PREP_WORDS.has(foldText(word))
}

const COOKED_QUERY = /\b(cooked|steamed|boiled|grilled|roasted|baked|fried|stir|poached|braised|stewed|sauteed)\b/
const stem = (word: string) => word.replace(/(es|s)$/, "")

/**
 * Every food-identifying query word must appear in the name ("cooked rice" → "White Rice — cooked").
 * When the query says the food is cooked, cooked records come first.
 */
export function searchLocalFallback(query: string): NormalizedFood[] {
  const normalizedQuery = foldText(query)

  if (!normalizedQuery) {
    return LOCAL_FALLBACK_FOODS
  }

  const words = normalizedQuery.split(/[^a-z]+/).filter((word) => word && !PREP_WORDS.has(word)).map(stem)
  if (words.length === 0) {
    return LOCAL_FALLBACK_FOODS.filter((food) => normalize(food.name).includes(normalizedQuery))
  }

  const matches = LOCAL_FALLBACK_FOODS.filter((food) => {
    const nameWords = foldText(food.name).split(/[^a-z]+/).map(stem)
    const head = LOCAL_HEAD_WORD[food.id]
    // prefix compare: the plural fold is crude ("noodles" → "noodl")
    const hasHead = !head || words.some((word) => head.startsWith(word) || word.startsWith(head))
    if (words.every((word) => nameWords.includes(word)) && hasHead) return true
    // An alias matches only as a whole: "bún" finds rice noodles, but "bò" alone never finds "bò nạm".
    return (LOCAL_ALIASES[food.id] ?? []).some((alias) => {
      const aliasWords = foldText(alias).split(/[^a-z]+/).filter((word) => word && !PREP_WORDS.has(word)).map(stem)
      return words.every((word) => aliasWords.includes(word)) && aliasWords.every((word) => words.includes(word))
    })
  })
  const wantsCooked = COOKED_QUERY.test(normalizedQuery)
  return wantsCooked ? [...matches].sort((a, b) => Number(b.preparationState === "cooked") - Number(a.preparationState === "cooked")) : matches
}

export function getLocalFallbackById(id: string): NormalizedFood | null {
  return LOCAL_FALLBACK_FOODS.find((food) => food.id === id) ?? null
}
