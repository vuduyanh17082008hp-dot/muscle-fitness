import "server-only";

/**
 * Vision adapter for Photo Meal Estimate — OpenAI only.
 *
 * Separate from Dante's text chat model. Uses OPENAI_API_KEY and
 * DANTE_OPENAI_VISION_MODEL (defaults to gpt-4o-mini).
 */

import { getOpenAiApiKey, OPENAI_CHAT_BASE_URL } from "@/lib/dante-core/openai/config";
import { foldText } from "@/lib/nutrition/food-data/local-fallback";
import { COOKING_METHODS, type CookingMethod } from "@/lib/nutrition/photo-match-review";

export function isVisionConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function getVisionModel(): string {
  return (
    process.env.DANTE_OPENAI_VISION_MODEL?.trim() ||
    process.env.OPENAI_VISION_MODEL?.trim() ||
    "gpt-4o-mini"
  );
}

/**
 * Menu reading needs a model that says "unreadable" instead of guessing: on a blurred menu (2026-10-23 probe)
 * gpt-4o-mini invented whole menus every run, while gpt-4.1-mini returned no dishes. Still OpenAI, same key.
 */
export function getMenuVisionModel(): string {
  return process.env.OPENAI_MENU_VISION_MODEL?.trim() || "gpt-4.1-mini";
}

export type DetectedFoodItem = {
  name: string;
  estimatedGrams: number;
  confidence: "high" | "medium" | "low";
  notes?: string;
  /** How it looks prepared; "unknown" when the photo doesn't show it. */
  preparation: CookingMethod;
  /** False when the preparation is a guess (e.g. can't tell grilled-with-oil from boiled). */
  preparationCertain: boolean;
  /** The mixed dish this is one component of ("chicken rice", "pho"), or null for a standalone food. */
  dish: string | null;
};

export type VisionEstimateResult = {
  items: DetectedFoodItem[];
};

const VISION_TIMEOUT_MS = 20000;

const SYSTEM_PROMPT = `
You identify foods visible in a photo of a meal.

You do NOT know exact calories, protein, carbs or fat — a separate
nutrition database provides those. For each food report only:

- name: the food's common name including how it is cooked when visible (e.g. "grilled chicken breast", "cooked white rice", "steamed broccoli")
- estimatedGrams: a rough portion weight in grams of what is on the plate
- confidence: "high", "medium" or "low" for the identification
- preparation: one of ${COOKING_METHODS.join(", ")} ("unknown" if you cannot tell)
- preparationCertain: give your best guess for preparation; set false only when the photo cannot tell methods apart that differ in added oil or fat (e.g. grilled-with-oil vs boiled chicken). Plain rice or noodles are boiled/steamed and certain.
- dish: when the foods together form a known dish (Hainanese chicken rice, pho, fried rice, nasi lemak, com tam, mixed rice plate, noodles with meat), that dish name on EVERY one of its components; otherwise null. For a Vietnamese dish use its Vietnamese name (phở bò, phở gà, bún bò Huế, bún chả, bún thịt nướng, cơm tấm sườn, cơm gà, bánh mì thịt, bánh mì trứng, bún riêu, hủ tiếu, mì Quảng, gỏi cuốn, bánh cuốn, cháo gà)
- notes: a short uncertainty note, or "" (e.g. "partially hidden", "sauce amount unclear")

Rules:
- Break a mixed dish into its visible components (rice or noodles, protein, vegetables, sauce/broth), each tagged with the same dish name. Do NOT also list the whole dish.
- If a dish cannot be broken down reliably, list it once as a single item with dish null and say so in notes.
- List a sauce, dressing or broth only if it is visible; never invent unseen oil or sauce.
- If there is no food in the photo, return { "items": [] }.
- Never invent a brand name that isn't visibly legible on packaging.
- Do not include calories or macronutrients — you are not the source of that data.
`.trim();

// Strict structured output; the parser below still treats the reply as untrusted.
const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "meal_photo_items",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["items"],
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "estimatedGrams", "confidence", "preparation", "preparationCertain", "dish", "notes"],
            properties: {
              name: { type: "string" },
              estimatedGrams: { type: "number" },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
              preparation: { type: "string", enum: [...COOKING_METHODS] },
              preparationCertain: { type: "boolean" },
              dish: { type: ["string", "null"] },
              notes: { type: "string" },
            },
          },
        },
      },
    },
  },
} as const;

// A plate never holds more than this many separate foods; anything beyond is noise.
const MAX_ITEMS = 12;
const MAX_GRAMS = 2000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseItems(raw: unknown): DetectedFoodItem[] {
  if (!isRecord(raw) || !Array.isArray(raw.items)) {
    return [];
  }

  const items: DetectedFoodItem[] = [];

  for (const entry of raw.items) {
    if (!isRecord(entry)) continue;

    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    const estimatedGrams = typeof entry.estimatedGrams === "number" ? entry.estimatedGrams : null;
    const confidence =
      entry.confidence === "high" || entry.confidence === "medium" || entry.confidence === "low"
        ? entry.confidence
        : "medium";

    if (!name || estimatedGrams === null || !Number.isFinite(estimatedGrams) || estimatedGrams <= 0) continue;

    const preparation = COOKING_METHODS.find((method) => method === entry.preparation) ?? "unknown";
    // The model sometimes writes the word "null" instead of a JSON null.
    const dish = typeof entry.dish === "string" && entry.dish.trim() && !/^(null|none|n\/a)$/i.test(entry.dish.trim()) ? entry.dish.trim().slice(0, 80) : null;
    const notes = typeof entry.notes === "string" && entry.notes.trim() ? entry.notes.trim().slice(0, 160) : undefined;

    items.push({
      name: name.slice(0, 80),
      estimatedGrams: Math.min(MAX_GRAMS, Math.round(estimatedGrams)),
      confidence,
      notes,
      preparation,
      preparationCertain: entry.preparationCertain === true && preparation !== "unknown",
      dish,
    });
  }

  return items.slice(0, MAX_ITEMS);
}

export async function identifyFoodsInImage(imageDataUrl: string): Promise<VisionEstimateResult | null> {
  const parsed = await visionJson(SYSTEM_PROMPT, RESPONSE_FORMAT, 1024, [
    { type: "text", text: "Identify the foods in this photo." },
    { type: "image_url", image_url: { url: imageDataUrl } },
  ]);
  return parsed === null ? null : { items: parseItems(parsed) };
}

type VisionContent = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

/** One structured-output vision call. Returns the parsed JSON (still untrusted) or null on any failure. */
async function visionJson(
  system: string,
  responseFormat: unknown,
  maxTokens: number,
  content: VisionContent[],
  timeoutMs = VISION_TIMEOUT_MS,
  model = getVisionModel(),
): Promise<unknown | null> {
  if (!isVisionConfigured()) {
    return null;
  }

  const apiKey = getOpenAiApiKey();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${OPENAI_CHAT_BASE_URL}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: maxTokens,
        response_format: responseFormat,
        messages: [
          { role: "system", content: system },
          { role: "user", content },
        ],
      }),
    });

    if (!response.ok) {
      console.warn(`[VISION] OpenAI vision request failed: HTTP ${response.status}`);
      return null;
    }

    const data: unknown = await response.json();

    if (!isRecord(data) || !Array.isArray(data.choices)) {
      return null;
    }

    const choice = data.choices[0];
    const message = isRecord(choice) ? choice.message : null;
    const text = isRecord(message) && typeof message.content === "string" ? message.content : null;

    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch {
      console.warn("[VISION] Model did not return valid JSON.");
      return null;
    }
  } catch (error) {
    console.warn("[VISION] vision request error:", error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Before / after plate ────────────────────────────────────────────────────

export type LeftoverComponent = { id: string; name: string; servedGrams: number };

export type LeftoverEstimate = {
  id: string;
  /** Share of the served portion still visible after the meal; null when the photos can't tell. */
  remainingPercent: number | null;
  confidence: "high" | "medium" | "low";
  note?: string;
};

export type LeftoverComparison = { sameMeal: boolean; reason?: string; components: LeftoverEstimate[] };

const LEFTOVER_PROMPT = `
You compare two photos of ONE meal: the first image is BEFORE eating, the second is AFTER.
The user already reviewed the BEFORE meal into the listed components (id, name, served grams).

For each listed component estimate remainingPercent: roughly what share of that component is still on the
plate in the AFTER photo (0 = none left, 100 = untouched). This is a visual guess, not a measurement.

Rules:
- Use only the listed ids. Never add components.
- remainingPercent null when you cannot judge it: hidden or covered, mixed into other food, a liquid or
  broth whose level you can't see, a very different camera angle, or not visible in either photo.
- confidence "high", "medium" or "low" for each judgement. note: a short reason, or "".
- sameMeal false only when the AFTER photo clearly shows a different meal, or is not a photo of a plate,
  bowl or food at all. An empty or nearly empty plate/bowl of the same meal IS the same meal.
- reason: a short explanation when sameMeal is false, otherwise "".
- Never report grams, calories or nutrients.
`.trim();

const LEFTOVER_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "plate_leftovers",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["sameMeal", "reason", "components"],
      properties: {
        sameMeal: { type: "boolean" },
        reason: { type: "string" },
        components: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "remainingPercent", "confidence", "note"],
            properties: {
              id: { type: "string" },
              remainingPercent: { type: ["number", "null"] },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
              note: { type: "string" },
            },
          },
        },
      },
    },
  },
} as const;

/** Untrusted model output → one estimate per requested id (unknown ids dropped, missing ids = can't tell). */
export function parseLeftovers(raw: unknown, ids: string[]): LeftoverComparison | null {
  if (!isRecord(raw) || typeof raw.sameMeal !== "boolean" || !Array.isArray(raw.components)) return null;

  const byId = new Map<string, LeftoverEstimate>();
  for (const entry of raw.components) {
    if (!isRecord(entry) || typeof entry.id !== "string" || !ids.includes(entry.id) || byId.has(entry.id)) continue;
    const pct = typeof entry.remainingPercent === "number" && Number.isFinite(entry.remainingPercent)
      ? Math.min(100, Math.max(0, Math.round(entry.remainingPercent / 5) * 5))
      : null;
    const confidence = entry.confidence === "high" || entry.confidence === "medium" ? entry.confidence : "low";
    const note = typeof entry.note === "string" && entry.note.trim() ? entry.note.trim().slice(0, 160) : undefined;
    byId.set(entry.id, { id: entry.id, remainingPercent: pct, confidence, note });
  }

  const reason = typeof raw.reason === "string" && raw.reason.trim() ? raw.reason.trim().slice(0, 200) : undefined;
  return {
    sameMeal: raw.sameMeal,
    reason,
    components: ids.map((id) => byId.get(id) ?? { id, remainingPercent: null, confidence: "low" as const, note: "Not judged from the photos." }),
  };
}

export async function compareLeftovers(
  beforeDataUrl: string,
  afterDataUrl: string,
  components: LeftoverComponent[],
): Promise<LeftoverComparison | null> {
  const list = components.map((c) => `- id "${c.id}": ${c.name}, about ${Math.round(c.servedGrams)} g served`).join("\n");
  const parsed = await visionJson(LEFTOVER_PROMPT, LEFTOVER_FORMAT, 1024, [
    { type: "text", text: `Reviewed BEFORE components:\n${list}\n\nImage 1 is BEFORE, image 2 is AFTER.` },
    { type: "image_url", image_url: { url: beforeDataUrl } },
    { type: "image_url", image_url: { url: afterDataUrl } },
  ], 30000);
  return parsed === null ? null : parseLeftovers(parsed, components.map((c) => c.id));
}

// ── Restaurant menu ─────────────────────────────────────────────────────────

export type MenuDish = {
  /** Exactly as printed. */
  name: string;
  description: string;
  price: string;
  preparation: CookingMethod;
  /** The model's guess of a standard portion's main parts. Only ever priced as an estimate. */
  components: Array<{ name: string; grams: number }>;
};

export type MenuReading = { isMenu: boolean; readability: "full" | "partial" | "unreadable"; dishes: MenuDish[] };

const MENU_PROMPT = `
You read a photo of a restaurant or stall menu. Transcribe first, then list dishes.

- legibleLines: every line of menu text you can actually read letter by letter, copied exactly as printed
  (original language and diacritics). Leave out any text that is blurred, cut off or too small to read:
  never guess or reconstruct it, even when you can imagine what a typical menu would say.
- illegibleEntries: how many menu entries you can see but cannot read.
- dishes: only dishes whose names appear in legibleLines.
  - name: copied exactly as printed. description: the printed description, or "". price: the printed price, or "".
  - Never add, rename or invent dishes. Include drinks only if they are printed as menu items.
  - components: your best guess of the main parts of ONE standard restaurant portion of that dish
    (starch, protein, vegetables, sauce/broth/oil), 1–6 items with a rough gram weight each. This is a guess
    used only for a labelled estimate.
  - preparation: the dish's main cooking method, one of ${COOKING_METHODS.join(", ")} ("unknown" if unclear).
- readability: "full" only if illegibleEntries is 0, "partial" if some entries can't be read, "unreadable" if no
  dish name is legible.
- isMenu: false if the photo is not a menu at all (for example a plate of food or a street scene).
Never include calories or nutrients.
`.trim();

const MENU_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "menu_reading",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["isMenu", "legibleLines", "illegibleEntries", "readability", "dishes"],
      properties: {
        isMenu: { type: "boolean" },
        legibleLines: { type: "array", items: { type: "string" } },
        illegibleEntries: { type: "number" },
        readability: { type: "string", enum: ["full", "partial", "unreadable"] },
        dishes: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "description", "price", "preparation", "components"],
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              price: { type: "string" },
              preparation: { type: "string", enum: [...COOKING_METHODS] },
              components: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["name", "grams"],
                  properties: { name: { type: "string" }, grams: { type: "number" } },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

const MAX_MENU_DISHES = 30;
const foldLine = (text: string) => foldText(text).replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Untrusted menu reading → dishes that are provably on the page. A dish survives only when its name appears in a
 * line the model transcribed as legible; anything else counts as unreadable (and makes the reading "partial").
 */
export function parseMenu(raw: unknown): MenuReading | null {
  if (!isRecord(raw) || typeof raw.isMenu !== "boolean" || !Array.isArray(raw.dishes) || !Array.isArray(raw.legibleLines)) return null;
  if (!raw.isMenu) return { isMenu: false, readability: "unreadable", dishes: [] };

  const lines = raw.legibleLines.flatMap((line) => (typeof line === "string" && line.trim() ? [foldLine(line)] : []));
  const onPage = (name: string) => {
    const folded = foldLine(name);
    return folded.length > 0 && lines.some((line) => line.includes(folded));
  };

  const seen = new Set<string>();
  const dishes: MenuDish[] = [];
  let unproven = 0;
  for (const entry of raw.dishes) {
    if (!isRecord(entry) || typeof entry.name !== "string") continue;
    const name = entry.name.trim().slice(0, 80);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    if (!onPage(name)) {
      unproven++;
      continue;
    }
    const components = (Array.isArray(entry.components) ? entry.components : [])
      .flatMap((c) => {
        if (!isRecord(c) || typeof c.name !== "string" || !c.name.trim()) return [];
        const grams = typeof c.grams === "number" && Number.isFinite(c.grams) ? Math.round(c.grams) : 0;
        return grams >= 1 && grams <= 800 ? [{ name: c.name.trim().slice(0, 60), grams }] : [];
      })
      .slice(0, 6);
    dishes.push({
      name,
      description: typeof entry.description === "string" ? entry.description.trim().slice(0, 200) : "",
      price: typeof entry.price === "string" ? entry.price.trim().slice(0, 30) : "",
      preparation: COOKING_METHODS.find((method) => method === entry.preparation) ?? "unknown",
      components,
    });
    if (dishes.length >= MAX_MENU_DISHES) break;
  }

  const illegible = typeof raw.illegibleEntries === "number" && raw.illegibleEntries > 0;
  const readability = dishes.length === 0 ? "unreadable" : illegible || unproven > 0 || raw.readability !== "full" ? "partial" : "full";
  return { isMenu: true, readability, dishes };
}

/**
 * Two independent readings must agree on a dish. On an illegible menu the model's invented dishes differ from run
 * to run (2026-10-23 probe: a different made-up menu every time), while printed text reads the same both times.
 */
export function agreeReadings(a: MenuReading, b: MenuReading): MenuReading {
  const other = b.dishes.map((dish) => foldLine(dish.name));
  const dishes = a.dishes.filter((dish) => other.includes(foldLine(dish.name)));
  if (dishes.length === 0) return { isMenu: a.isMenu && b.isMenu, readability: "unreadable", dishes: [] };
  const agreed = dishes.length === a.dishes.length && dishes.length === b.dishes.length;
  return { isMenu: true, readability: agreed && a.readability === "full" && b.readability === "full" ? "full" : "partial", dishes };
}

export async function readMenuImage(imageDataUrl: string): Promise<MenuReading | null> {
  const read = async () => {
    const parsed = await visionJson(MENU_PROMPT, MENU_FORMAT, 3000, [
      { type: "text", text: "Read the dishes on this menu." },
      { type: "image_url", image_url: { url: imageDataUrl } },
    ], 45000, getMenuVisionModel());
    return parsed === null ? null : parseMenu(parsed);
  };
  const [a, b] = await Promise.all([read(), read()]);
  return a && b ? agreeReadings(a, b) : null;
}
