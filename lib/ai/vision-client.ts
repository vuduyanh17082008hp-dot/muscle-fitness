import "server-only";

/**
 * Vision adapter for Photo Meal Estimate — OpenAI only.
 *
 * Separate from Dante's text chat model. Uses OPENAI_API_KEY and
 * DANTE_OPENAI_VISION_MODEL (defaults to gpt-4o-mini).
 */

import { getOpenAiApiKey, OPENAI_CHAT_BASE_URL } from "@/lib/dante-core/openai/config";
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
- dish: when the foods together form a known dish (Hainanese chicken rice, pho, fried rice, nasi lemak, com tam, mixed rice plate, noodles with meat), that dish name on EVERY one of its components; otherwise null
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
    const dish = typeof entry.dish === "string" && entry.dish.trim() ? entry.dish.trim().slice(0, 80) : null;
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
  if (!isVisionConfigured()) {
    return null;
  }

  const model = getVisionModel();
  const apiKey = getOpenAiApiKey();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);

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
        max_tokens: 1024,
        response_format: RESPONSE_FORMAT,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Identify the foods in this photo." },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
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

    const content = data.choices[0];
    const message = isRecord(content) ? content.message : null;
    const text = isRecord(message) && typeof message.content === "string" ? message.content : null;

    if (!text) {
      return null;
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(text);
    } catch {
      console.warn("[VISION] Model did not return valid JSON.");
      return null;
    }

    return { items: parseItems(parsed) };
  } catch (error) {
    console.warn("[VISION] identifyFoodsInImage error:", error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
