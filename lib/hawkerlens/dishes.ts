import type { HawkerDishId } from "@/lib/hawkerlens/types";
import type { NormalizedFoodMacros } from "@/lib/nutrition/food-data/types";

/**
 * Curated MVP dish registry (spec Part A §1, §6, §10).
 *
 * HONESTY NOTE, stated once here: these per100g figures are
 * INTERNALLY ESTIMATED from typical hawker-stall recipe composition,
 * cross-referenced against generic USDA-equivalent ingredients (rice,
 * poultry, coconut milk, fried noodles, etc.) — they are NOT sourced
 * from a verified, published Singapore-specific lab-tested database
 * (e.g. Singapore HPB's Energy & Nutrient Composition of Food
 * database was not available to consult in this environment). Treat
 * every number here the same way `local-fallback.ts` treats its
 * entries: a reasonable placeholder, confidence `"fallback"`, meant
 * to be replaced by a verified source before this is treated as
 * production-accurate. See docs/hawkerlens.md "Data sources".
 *
 * Every dish is modeled as a fixed list of typical COMPONENTS (not one
 * opaque "dish" macro total) so portion editing and component-level
 * confidence are possible — matching spec §6's requirement that mixed
 * meals be decomposed, not treated as one blob.
 */

export type DishComponentTemplate = {
  name: string;
  /** Typical grams for ONE regular portion — the anchor for portion-range estimation when the model's own visual read is low-confidence. */
  typicalGrams: number;
  per100g: NormalizedFoodMacros;
  /** Whether this component is essentially always present (vs. commonly but not always, e.g. chicken skin some people remove). */
  usuallyPresent: boolean;
};

export type DishTemplate = {
  id: HawkerDishId;
  displayName: string;
  aliases: string[];
  components: DishComponentTemplate[];
};

const RICE_HAINANESE = "Hainanese-style oily rice";

export const DISH_TEMPLATES: Record<HawkerDishId, DishTemplate> = {
  chicken_rice: {
    id: "chicken_rice",
    displayName: "Hainanese Chicken Rice",
    aliases: ["chicken rice", "hainanese chicken rice", "白鸡饭"],
    components: [
      {
        name: RICE_HAINANESE,
        typicalGrams: 220,
        per100g: { calories: 200, protein: 4.2, carbs: 33, fat: 5.5 },
        usuallyPresent: true,
      },
      {
        name: "Poached chicken with skin",
        typicalGrams: 130,
        per100g: { calories: 215, protein: 19, carbs: 0, fat: 15 },
        usuallyPresent: true,
      },
      {
        name: "Chili sauce",
        typicalGrams: 15,
        per100g: { calories: 110, protein: 1.2, carbs: 20, fat: 3 },
        usuallyPresent: true,
      },
      {
        name: "Dark soy & ginger sauce",
        typicalGrams: 10,
        per100g: { calories: 55, protein: 1, carbs: 10, fat: 0.5 },
        usuallyPresent: true,
      },
      {
        name: "Cucumber garnish",
        typicalGrams: 30,
        per100g: { calories: 15, protein: 0.7, carbs: 3.6, fat: 0.1 },
        usuallyPresent: true,
      },
      {
        name: "Clear soup",
        typicalGrams: 150,
        per100g: { calories: 10, protein: 1, carbs: 0.8, fat: 0.3 },
        usuallyPresent: false,
      },
    ],
  },
  cai_png: {
    id: "cai_png",
    displayName: "Cai Png (Economy Rice)",
    aliases: ["cai png", "economic rice", "economy rice", "mixed rice", "菜饭"],
    components: [
      {
        name: "White rice",
        typicalGrams: 200,
        per100g: { calories: 130, protein: 2.7, carbs: 28.2, fat: 0.3 },
        usuallyPresent: true,
      },
      {
        name: "Braised/stewed meat dish",
        typicalGrams: 100,
        per100g: { calories: 200, protein: 16, carbs: 4, fat: 13 },
        usuallyPresent: true,
      },
      {
        name: "Stir-fried vegetable dish",
        typicalGrams: 90,
        per100g: { calories: 65, protein: 2, carbs: 5, fat: 4 },
        usuallyPresent: true,
      },
      {
        name: "Egg dish",
        typicalGrams: 60,
        per100g: { calories: 155, protein: 10, carbs: 2, fat: 11 },
        usuallyPresent: false,
      },
      {
        name: "Curry gravy",
        typicalGrams: 30,
        per100g: { calories: 90, protein: 1.5, carbs: 5, fat: 7 },
        usuallyPresent: false,
      },
    ],
  },
  nasi_lemak: {
    id: "nasi_lemak",
    displayName: "Nasi Lemak",
    aliases: ["nasi lemak"],
    components: [
      {
        name: "Coconut rice",
        typicalGrams: 200,
        per100g: { calories: 180, protein: 3, carbs: 30, fat: 5.5 },
        usuallyPresent: true,
      },
      {
        name: "Fried anchovies & peanuts",
        typicalGrams: 25,
        per100g: { calories: 500, protein: 20, carbs: 20, fat: 38 },
        usuallyPresent: true,
      },
      {
        name: "Fried egg",
        typicalGrams: 55,
        per100g: { calories: 200, protein: 13, carbs: 1, fat: 16 },
        usuallyPresent: true,
      },
      {
        name: "Sambal chili",
        typicalGrams: 30,
        per100g: { calories: 120, protein: 1.5, carbs: 12, fat: 7 },
        usuallyPresent: true,
      },
      {
        name: "Fried chicken wing/cutlet",
        typicalGrams: 100,
        per100g: { calories: 260, protein: 18, carbs: 8, fat: 17 },
        usuallyPresent: false,
      },
      {
        name: "Cucumber garnish",
        typicalGrams: 30,
        per100g: { calories: 15, protein: 0.7, carbs: 3.6, fat: 0.1 },
        usuallyPresent: true,
      },
    ],
  },
  laksa: {
    id: "laksa",
    displayName: "Laksa",
    aliases: ["laksa", "curry laksa"],
    components: [
      {
        name: "Laksa noodles in coconut curry gravy",
        typicalGrams: 350,
        per100g: { calories: 140, protein: 4, carbs: 12, fat: 8.5 },
        usuallyPresent: true,
      },
      {
        name: "Prawns",
        typicalGrams: 40,
        per100g: { calories: 90, protein: 19, carbs: 0.5, fat: 1 },
        usuallyPresent: true,
      },
      {
        name: "Fish cake",
        typicalGrams: 30,
        per100g: { calories: 150, protein: 10, carbs: 8, fat: 8 },
        usuallyPresent: true,
      },
      {
        name: "Tofu puff",
        typicalGrams: 25,
        per100g: { calories: 180, protein: 12, carbs: 3, fat: 13 },
        usuallyPresent: false,
      },
      {
        name: "Beansprouts & garnish",
        typicalGrams: 30,
        per100g: { calories: 22, protein: 2, carbs: 4, fat: 0.2 },
        usuallyPresent: true,
      },
    ],
  },
  bak_chor_mee: {
    id: "bak_chor_mee",
    displayName: "Bak Chor Mee",
    aliases: ["bak chor mee", "minced meat noodle", "肉脞面"],
    components: [
      {
        name: "Noodles, dressed in vinegar-chili sauce",
        typicalGrams: 200,
        per100g: { calories: 150, protein: 5, carbs: 26, fat: 3 },
        usuallyPresent: true,
      },
      {
        name: "Minced pork",
        typicalGrams: 60,
        per100g: { calories: 200, protein: 18, carbs: 0, fat: 14 },
        usuallyPresent: true,
      },
      {
        name: "Meatballs & liver",
        typicalGrams: 50,
        per100g: { calories: 150, protein: 15, carbs: 3, fat: 9 },
        usuallyPresent: false,
      },
      {
        name: "Mushroom",
        typicalGrams: 20,
        per100g: { calories: 35, protein: 3, carbs: 5, fat: 0.5 },
        usuallyPresent: false,
      },
    ],
  },
  ban_mian: {
    id: "ban_mian",
    displayName: "Ban Mian",
    aliases: ["ban mian", "mee hoon kueh", "板面"],
    components: [
      {
        name: "Hand-made noodles in soup",
        typicalGrams: 350,
        per100g: { calories: 90, protein: 4, carbs: 14, fat: 2 },
        usuallyPresent: true,
      },
      {
        name: "Minced pork",
        typicalGrams: 50,
        per100g: { calories: 200, protein: 18, carbs: 0, fat: 14 },
        usuallyPresent: true,
      },
      {
        name: "Poached egg",
        typicalGrams: 55,
        per100g: { calories: 150, protein: 12.5, carbs: 1, fat: 10 },
        usuallyPresent: true,
      },
      {
        name: "Vegetables (leafy greens)",
        typicalGrams: 40,
        per100g: { calories: 20, protein: 2, carbs: 3, fat: 0.3 },
        usuallyPresent: true,
      },
      {
        name: "Anchovies",
        typicalGrams: 10,
        per100g: { calories: 200, protein: 30, carbs: 0, fat: 8 },
        usuallyPresent: false,
      },
    ],
  },
  char_kway_teow: {
    id: "char_kway_teow",
    displayName: "Char Kway Teow",
    aliases: ["char kway teow", "ckt", "炒粿条"],
    components: [
      {
        name: "Stir-fried flat rice noodles",
        typicalGrams: 250,
        per100g: { calories: 190, protein: 4.5, carbs: 24, fat: 9 },
        usuallyPresent: true,
      },
      {
        name: "Egg",
        typicalGrams: 55,
        per100g: { calories: 150, protein: 12.5, carbs: 1, fat: 10 },
        usuallyPresent: true,
      },
      {
        name: "Prawns & cockles",
        typicalGrams: 40,
        per100g: { calories: 100, protein: 18, carbs: 2, fat: 2 },
        usuallyPresent: true,
      },
      {
        name: "Chinese sausage (lap cheong)",
        typicalGrams: 25,
        per100g: { calories: 300, protein: 14, carbs: 8, fat: 24 },
        usuallyPresent: false,
      },
      {
        name: "Beansprouts & chives",
        typicalGrams: 30,
        per100g: { calories: 22, protein: 2, carbs: 4, fat: 0.2 },
        usuallyPresent: true,
      },
    ],
  },
  fish_soup: {
    id: "fish_soup",
    displayName: "Fish Soup",
    aliases: ["fish soup", "sliced fish soup", "fish soup bee hoon"],
    components: [
      {
        name: "Fish slices",
        typicalGrams: 130,
        per100g: { calories: 100, protein: 20, carbs: 0, fat: 2 },
        usuallyPresent: true,
      },
      {
        name: "Clear fish broth",
        typicalGrams: 300,
        per100g: { calories: 12, protein: 1.2, carbs: 1, fat: 0.4 },
        usuallyPresent: true,
      },
      {
        name: "Bee hoon / rice",
        typicalGrams: 150,
        per100g: { calories: 130, protein: 2.7, carbs: 28, fat: 0.3 },
        usuallyPresent: false,
      },
      {
        name: "Vegetables (lettuce, tomato)",
        typicalGrams: 40,
        per100g: { calories: 18, protein: 1, carbs: 3.5, fat: 0.2 },
        usuallyPresent: true,
      },
    ],
  },
  mee_goreng: {
    id: "mee_goreng",
    displayName: "Mee Goreng",
    aliases: ["mee goreng", "fried mee"],
    components: [
      {
        name: "Fried yellow noodles",
        typicalGrams: 250,
        per100g: { calories: 180, protein: 4.5, carbs: 24, fat: 8 },
        usuallyPresent: true,
      },
      {
        name: "Egg",
        typicalGrams: 55,
        per100g: { calories: 150, protein: 12.5, carbs: 1, fat: 10 },
        usuallyPresent: true,
      },
      {
        name: "Potato",
        typicalGrams: 50,
        per100g: { calories: 90, protein: 2, carbs: 20, fat: 0.5 },
        usuallyPresent: true,
      },
      {
        name: "Tofu",
        typicalGrams: 30,
        per100g: { calories: 120, protein: 10, carbs: 3, fat: 7 },
        usuallyPresent: false,
      },
      {
        name: "Tomato-chili sauce",
        typicalGrams: 20,
        per100g: { calories: 80, protein: 1.5, carbs: 15, fat: 1.5 },
        usuallyPresent: true,
      },
    ],
  },
  mala: {
    id: "mala",
    displayName: "Mala (Xiang Guo / hotpot-style)",
    aliases: ["mala", "mala xiang guo", "mala hotpot", "麻辣香锅"],
    components: [
      {
        name: "Mixed meat & vegetable ingredients (mala-tossed)",
        typicalGrams: 350,
        per100g: { calories: 180, protein: 12, carbs: 8, fat: 12 },
        usuallyPresent: true,
      },
      {
        name: "Mala oil & sauce coating",
        typicalGrams: 40,
        per100g: { calories: 450, protein: 2, carbs: 6, fat: 46 },
        usuallyPresent: true,
      },
      {
        name: "White rice",
        typicalGrams: 150,
        per100g: { calories: 130, protein: 2.7, carbs: 28.2, fat: 0.3 },
        usuallyPresent: false,
      },
    ],
  },
};

export function getDishTemplate(id: HawkerDishId): DishTemplate {
  return DISH_TEMPLATES[id];
}

export function findDishByAlias(text: string): HawkerDishId | null {
  const normalized = text.trim().toLowerCase();

  for (const template of Object.values(DISH_TEMPLATES)) {
    if (
      template.id === normalized ||
      template.displayName.toLowerCase() === normalized ||
      template.aliases.some((alias) => alias.toLowerCase() === normalized)
    ) {
      return template.id;
    }
  }

  return null;
}
