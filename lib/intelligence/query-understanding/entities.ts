import {
  COUNT_UNITS, EXERCISE_ALIASES, FOOD_ALIASES, FOOD_VARIETY_WORDS, MASS_UNITS_TO_GRAMS, MUSCLE_ALIASES, PREPARATION, RESTAURANTS,
} from "./lexicon";
import type { EntityOrigin, QueryConstraints, QueryEntity, TimeRef } from "./types";

const B = "(?<![\\p{L}\\p{N}])";
const E = "(?![\\p{L}\\p{N}])";
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Unicode-aware whole-word test (diacritics intact: "ngu" never matches inside "ngủ"). */
export function hasTerm(text: string, term: string): boolean {
  return new RegExp(`${B}${escape(term)}${E}`, "iu").test(text);
}
export const hasAny = (text: string, terms: readonly string[]): boolean => terms.some((term) => hasTerm(text, term));

type AliasHit = { key: string; surface: string; index: number };

// Compiled once per alias table: this runs on every chat turn.
const compiled = new WeakMap<Record<string, string[]>, Array<{ key: string; re: RegExp }>>();
function compile(table: Record<string, string[]>): Array<{ key: string; re: RegExp }> {
  let hit = compiled.get(table);
  if (!hit) {
    hit = Object.entries(table)
      .flatMap(([key, aliases]) => aliases.map((alias) => ({ key, alias })))
      .sort((a, b) => b.alias.length - a.alias.length)
      .map(({ key, alias }) => ({ key, re: new RegExp(`${B}${escape(alias)}${E}`, "giu") }));
    compiled.set(table, hit);
  }
  return hit;
}

/** Longest-alias-first scan; overlapping shorter aliases are dropped ("chicken breast" beats "chicken"). */
function scanAliases(text: string, table: Record<string, string[]>): AliasHit[] {
  const taken: Array<[number, number]> = [];
  const hits: AliasHit[] = [];
  for (const { key, re } of compile(table)) {
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (taken.some(([s, e]) => start < e && end > s)) continue;
      taken.push([start, end]);
      hits.push({ key, surface: m[0], index: start });
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

const ASCII_PHRASE = /^[a-z' -]+$/;

export function extractFoods(text: string, origin: EntityOrigin = "CURRENT_TURN"): QueryEntity[] {
  return scanAliases(text, FOOD_ALIASES).map((hit) => {
    // Pull an immediately preceding variety word into the entity ("atlantic cod"); never drop words blindly.
    const before = text.slice(0, hit.index).trimEnd().split(/\s+/).pop() ?? "";
    const variety = FOOD_VARIETY_WORDS.includes(before) ? before : "";
    const phrase = hit.surface.toLowerCase();
    const base = hit.key.replace(/_/g, " ");
    // Vietnamese surface forms resolve to the canonical English key; English phrases are kept as typed.
    const canonical = ASCII_PHRASE.test(phrase) ? phrase : base;
    const value = variety && !canonical.startsWith(variety) ? `${variety} ${canonical}` : canonical;
    return { kind: "FOOD", value, base, surface: variety ? `${variety} ${hit.surface}` : hit.surface, origin };
  });
}

export function extractExercises(text: string, origin: EntityOrigin = "CURRENT_TURN"): QueryEntity[] {
  return scanAliases(text, EXERCISE_ALIASES).map((hit) => ({ kind: "EXERCISE" as const, value: hit.key, surface: hit.surface, origin }));
}
export function extractMuscles(text: string, origin: EntityOrigin = "CURRENT_TURN"): QueryEntity[] {
  return scanAliases(text, MUSCLE_ALIASES).map((hit) => ({ kind: "MUSCLE_GROUP" as const, value: hit.key, surface: hit.surface, origin }));
}
export function extractRestaurants(text: string): QueryEntity[] {
  return RESTAURANTS.filter((r) => hasTerm(text, r)).slice(0, 1).map((r) => ({ kind: "RESTAURANT" as const, value: r, surface: r, origin: "CURRENT_TURN" as const }));
}

export function extractPreparation(text: string): { state: "raw" | "cooked"; method?: string; surface: string } | null {
  for (const [word, info] of Object.entries(PREPARATION)) if (hasTerm(text, word)) return { ...info, surface: word };
  return null;
}

const NUM = "(\\d+(?:[.,]\\d+)?)";
const MACRO_WORD = "(?:protein|carbs?|fat|calories|kcal)";

export interface QuantityScan {
  entities: QueryEntity[];
  macroTargets: Partial<Record<"protein" | "carbs" | "fat", number>>;
}

/** "200g", "8 oz". "one fillet" is NOT guessed. "40g protein" is a macro target, not a food quantity. */
export function extractQuantities(text: string): QuantityScan {
  const macroTargets: QuantityScan["macroTargets"] = {};
  const stripped = text.replace(new RegExp(`${NUM}\\s*g(?:rams?)?\\s*(?:of\\s+)?(protein|carbs?|fat)${E}`, "giu"), (_m, n: string, w: string) => {
    const key = w.toLowerCase().startsWith("carb") ? "carbs" : (w.toLowerCase() as "protein" | "fat");
    macroTargets[key] = Number(n.replace(",", "."));
    return " ";
  });
  const units = [...Object.keys(MASS_UNITS_TO_GRAMS), ...COUNT_UNITS].sort((a, b) => b.length - a.length).map(escape).join("|");
  const re = new RegExp(`${B}${NUM}\\s*(${units})${E}(?!\\s*${MACRO_WORD})`, "giu");
  const entities: QueryEntity[] = [];
  for (const m of stripped.matchAll(re)) {
    entities.push({ kind: "QUANTITY", value: `${m[1]}${m[2]}`, surface: m[0], origin: "CURRENT_TURN", amount: Number(m[1].replace(",", ".")), unit: m[2].toLowerCase() });
  }
  return { entities, macroTargets };
}

/** Lifting load ("100kg", "push 220") and RPE/RIR. */
export function extractLoad(text: string): QueryEntity[] {
  const out: QueryEntity[] = [];
  for (const m of text.matchAll(new RegExp(`${B}${NUM}\\s*(kg|lbs?|kilos?)${E}`, "giu"))) {
    out.push({ kind: "LOAD", value: `${m[1]}${m[2]}`, surface: m[0], origin: "CURRENT_TURN", amount: Number(m[1].replace(",", ".")), unit: m[2].toLowerCase() });
  }
  const push = text.match(new RegExp(`${B}(?:push|hit|go|load|do|pull|lift)\\s+${NUM}${E}(?!\\s*(?:g|grams?|calories|kcal|reps?))`, "iu"));
  if (push && out.length === 0) out.push({ kind: "LOAD", value: push[1], surface: push[0], origin: "CURRENT_TURN", amount: Number(push[1].replace(",", ".")) });
  const rpe = text.match(new RegExp(`${B}(rpe|rir)\\s*${NUM}${E}`, "iu"));
  if (rpe) out.push({ kind: "EFFORT", value: `${rpe[1].toLowerCase()}${rpe[2]}`, surface: rpe[0], origin: "CURRENT_TURN", amount: Number(rpe[2].replace(",", ".")) });
  return out;
}

const TIME_TERMS: Array<[TimeRef, string[]]> = [
  ["AFTER_TRAINING", ["after training", "after workout", "post workout", "post-workout", "sau tập", "sau khi tập", "after legs", "after heavy legs", "after leg day"]],
  ["BEFORE_TRAINING", ["before training", "pre workout", "pre-workout", "trước tập"]],
  ["TONIGHT", ["tonight", "this evening", "tối nay"]],
  ["YESTERDAY", ["yesterday", "hôm qua"]],
  ["TOMORROW", ["tomorrow", "ngày mai"]],
  ["THIS_WEEK", ["this week", "tuần này"]],
  ["TODAY", ["today", "hôm nay", "nay"]],
];
/** First match in priority order: "after training" constrains an answer more than "today". */
export function extractTime(text: string): TimeRef | undefined {
  for (const [ref, terms] of TIME_TERMS) if (hasAny(text, terms)) return ref;
  return undefined;
}

const MEAL_MAP: Record<string, string> = { "bữa sáng": "breakfast", "bữa trưa": "lunch", "bữa tối": "dinner" };
export function extractMeal(text: string): string | undefined {
  const m = text.match(/(?<![\p{L}])(breakfast|lunch|dinner|snack|bữa sáng|bữa trưa|bữa tối)(?![\p{L}])/iu);
  return m ? MEAL_MAP[m[1].toLowerCase()] ?? m[1].toLowerCase() : undefined;
}

const KEEPABLE = "(protein|calories|calo|carbs?|fat|workout|intensity|volume|target|macros)";

/** Calorie / macro / adjustment constraints. Intake ("I ate 800 calories") is never confused with a target or ceiling. */
export function extractConstraints(text: string, scan: QuantityScan): QueryConstraints {
  const c: QueryConstraints = {};
  const first = scan.entities[0];
  if (first?.amount !== undefined) {
    c.quantity = first.amount;
    c.unit = first.unit;
  }
  Object.assign(c, scan.macroTargets);

  const kcal = text.match(new RegExp(`${NUM}\\s*(?:calories|kcal|calo)${E}`, "iu"));
  if (kcal) {
    const value = Number(kcal[1].replace(",", "."));
    const idx = kcal.index ?? 0;
    const before = text.slice(Math.max(0, idx - 28), idx);
    const ceiling = /(under|below|less than|max(?:imum)?|within|at most|no more than|dưới|tối đa|<=?)\s*$/iu.test(before);
    const intake = /(?<![\p{L}])(?:ate|eaten|had|consumed|ăn)(?![\p{L}])/iu.test(text.slice(0, idx));
    if (ceiling) {
      c.calories = value;
      (c.ceilings ??= []).push("calories");
    } else if (intake) c.intakeCalories = value;
    else c.calories = value;
  }

  const fewer = text.match(new RegExp(`${NUM}\\s*(?:fewer|less|lower|ít hơn)\\s*(?:calories|kcal|calo)${E}`, "iu"));
  if (fewer) {
    c.calorieDelta = -Number(fewer[1]);
    (c.reduce ??= []).push("calories");
  }

  for (const m of text.matchAll(new RegExp(`${B}(?:same|keep|maintain|giữ|don't change|do not change|không đổi|unchanged)\\s+(?:my\\s+|the\\s+)?${KEEPABLE}${E}`, "giu"))) {
    const word = m[1].toLowerCase();
    (c.keep ??= []).push(word === "calo" ? "calories" : word === "carb" ? "carbs" : word);
  }
  const reduce: Array<[RegExp, string]> = [
    [/(?<![\p{L}])(?:lower|less|fewer|reduce|giảm|cut|ít)\s+(?:the\s+|my\s+)?(?:calories|calorie|calo)(?![\p{L}])/iu, "calories"],
    [/(?<![\p{L}])(?:lighter|nhẹ hơn)(?![\p{L}])/iu, "calories"],
    [/(?<![\p{L}])(?:cheaper|rẻ hơn|less expensive)(?![\p{L}])/iu, "cost"],
    [/(?<![\p{L}])(?:less|reduce|lower|giảm)\s+(?:the\s+)?fatigue(?![\p{L}])/iu, "fatigue"],
    [/(?<![\p{L}])(?:reduce|lower|giảm|cut)\s+(?:my\s+|the\s+)?volume(?![\p{L}])/iu, "volume"],
  ];
  for (const [re, what] of reduce) if (re.test(text) && !(c.reduce ?? []).includes(what)) (c.reduce ??= []).push(what);
  if (/(?<![\p{L}])(?:high[- ]protein|more protein|lots of protein|nhiều protein|giàu protein)(?![\p{L}])/iu.test(text)) (c.preferenceRefs ??= []).push("high_protein");
  if (/(?<![\p{L}])(?:keep carbs high|high[- ]carbs?|more carbs)(?![\p{L}])/iu.test(text)) {
    (c.preferenceRefs ??= []).push("high_carbs");
    (c.increase ??= []).push("carbs");
  }
  if (/leg day/iu.test(text)) c.workout = "leg day";

  const time = extractTime(text);
  if (time) c.time = time;
  const meal = extractMeal(text);
  if (meal) c.meal = meal;
  return c;
}
