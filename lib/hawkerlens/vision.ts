import "server-only";

import { DISH_TEMPLATES, findDishByAlias } from "@/lib/hawkerlens/dishes";
import type {
  DetectedComponent,
  DishClassification,
  HawkerDishId,
  ImageQualityCheck,
  ImageQualityIssue,
} from "@/lib/hawkerlens/types";

/**
 * HawkerLens vision adapter (spec Part A §5, §6, §4).
 *
 * Deliberately ONE combined VLM call for image-quality assessment +
 * dish classification + component segmentation + rough per-component
 * portion, rather than three separate round trips — "do not
 * overengineer" (spec §5). This mirrors the existing
 * lib/ai/vision-client.ts pattern exactly (same env vars, same
 * "the model never returns a calorie/macro number" rule) and is
 * intentionally a SEPARATE prompt/function from it: that one is
 * open-ended ("identify any food"), this one is closed-set
 * ("classify into exactly one of these N Singapore dishes, or none").
 *
 * MODEL CHOICE, documented per spec §5: a general-purpose
 * vision-language model (the same Groq vision model already
 * configured for Photo Estimate via GROQ_VISION_MODEL), constrained
 * by prompt to the MVP dish list, rather than a fine-tuned CNN
 * classifier. There is no labeled Singapore-hawker-food image dataset
 * or training pipeline in this project to fine-tune one on — a VLM
 * with a closed-set prompt is the practical, honest MVP choice (spec
 * explicitly allows this: "vision-language model where appropriate").
 * See docs/hawkerlens.md for the full tradeoff discussion and what
 * would justify a fine-tuned model later (once real usage data + a
 * labeled dataset exist).
 */

const VISION_TIMEOUT_MS = 25000;

const DISH_LIST_FOR_PROMPT = Object.values(DISH_TEMPLATES)
  .map((d) => `- ${d.id}: ${d.displayName} (aka ${d.aliases.join(", ")})`)
  .join("\n");

const SYSTEM_PROMPT = `
You are a food photo analyzer specialized in ONLY these Singapore hawker dishes:

${DISH_LIST_FOR_PROMPT}

You do NOT know exact calories, protein, carbs or fat — a separate
nutrition database provides those from grams you estimate. You do NOT
identify any dish outside the list above — if the photo shows something
else, or you aren't reasonably confident, say so.

First assess IMAGE QUALITY:
- visibility: is the food clearly visible (not too dark, not too blurry)?
- obstructed: is part of the plate blocked (hand, utensil, another object)?
- angle: is the camera angle usable (not extreme, not from very far away)?
- multiplePlates: does the photo show more than one distinct meal/plate?
- unknownDish: does this look like food, but NOT one of the listed dishes?

Then, ONLY if image quality is usable and a listed dish is recognized,
identify the dish and its visible components (e.g. rice, chicken, sauce,
egg, vegetables) with a rough estimated portion weight in grams each.

Return ONLY valid JSON in exactly this shape, nothing else:

{
  "imageQuality": {
    "visibility": "good" | "poor",
    "obstructed": boolean,
    "angle": "good" | "poor",
    "multiplePlates": boolean,
    "unknownDish": boolean,
    "notes": "string (optional, short)"
  },
  "dish": "one of the dish ids above, or null",
  "dishConfidence": number (0 to 1),
  "components": [
    { "name": "string", "estimatedGrams": number, "confidence": "high" | "medium" | "low", "notes": "string (optional)" }
  ]
}

Rules:
- If unknownDish is true or you cannot recognize a listed dish, set "dish" to null and "components" to [].
- Never invent a dish id that isn't in the list above.
- Do not include calories or macronutrients in your response.
`.trim();

type RawVisionResponse = {
  imageQuality?: {
    visibility?: string;
    obstructed?: boolean;
    angle?: string;
    multiplePlates?: boolean;
    unknownDish?: boolean;
    notes?: string;
  };
  dish?: string | null;
  dishConfidence?: number;
  components?: Array<{
    name?: string;
    estimatedGrams?: number;
    confidence?: string;
    notes?: string;
  }>;
};

export type HawkerVisionResult = {
  imageQuality: ImageQualityCheck;
  dishClassification: DishClassification;
  components: DetectedComponent[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isHawkerLensConfigured(): boolean {
  return Boolean(process.env.GROQ_VISION_MODEL?.trim() && process.env.GROQ_API_KEY?.trim());
}

function buildImageQuality(raw: RawVisionResponse["imageQuality"]): ImageQualityCheck {
  const issues: ImageQualityIssue[] = [];

  const visibilityPoor = raw?.visibility === "poor";
  const anglePoor = raw?.angle === "poor";
  const obstructed = raw?.obstructed === true;
  const multiplePlates = raw?.multiplePlates === true;
  const unknownDish = raw?.unknownDish === true;

  if (visibilityPoor) issues.push("poor_visibility");
  if (obstructed) issues.push("obstructed");
  if (anglePoor) issues.push("bad_angle");
  if (multiplePlates) issues.push("multiple_plates");
  if (unknownDish) issues.push("unknown_dish");
  if (raw?.visibility === "poor") issues.push("poor_lighting");

  const penalties = [visibilityPoor, obstructed, anglePoor, multiplePlates].filter(Boolean).length;
  const qualityScore = Math.max(0, 1 - penalties * 0.25);

  return {
    usable: penalties === 0,
    issues: Array.from(new Set(issues)),
    qualityScore,
    notes: typeof raw?.notes === "string" ? raw.notes : null,
  };
}

function parseDish(raw: unknown): HawkerDishId | null {
  if (typeof raw !== "string") return null;
  return findDishByAlias(raw);
}

function parseComponents(raw: RawVisionResponse["components"]): DetectedComponent[] {
  if (!Array.isArray(raw)) return [];

  const components: DetectedComponent[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;

    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    const estimatedGrams =
      typeof entry.estimatedGrams === "number" ? entry.estimatedGrams : null;
    const confidence =
      entry.confidence === "high" || entry.confidence === "medium" || entry.confidence === "low"
        ? entry.confidence
        : "medium";

    if (!name || estimatedGrams === null || estimatedGrams <= 0) continue;

    components.push({
      name,
      visualEstimateGrams: Math.round(estimatedGrams),
      modelConfidence: confidence,
      notes: typeof entry.notes === "string" ? entry.notes : undefined,
    });
  }

  return components;
}

export async function analyzeHawkerPhoto(
  imageDataUrl: string,
): Promise<HawkerVisionResult | null> {
  const model = process.env.GROQ_VISION_MODEL?.trim();
  const apiKey = process.env.GROQ_API_KEY?.trim();

  if (!model || !apiKey) {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_completion_tokens: 1024,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Analyze this hawker food photo." },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      console.warn(`[HAWKERLENS] Groq vision request failed: HTTP ${response.status}`);
      return null;
    }

    const data: unknown = await response.json();

    if (!isRecord(data) || !Array.isArray(data.choices)) {
      return null;
    }

    const choice = data.choices[0];
    const message = isRecord(choice) ? choice.message : null;
    const text = isRecord(message) && typeof message.content === "string" ? message.content : null;

    if (!text) return null;

    let parsed: RawVisionResponse;

    try {
      parsed = JSON.parse(text) as RawVisionResponse;
    } catch {
      console.warn("[HAWKERLENS] Model did not return valid JSON.");
      return null;
    }

    const imageQuality = buildImageQuality(parsed.imageQuality);
    const dish = imageQuality.usable ? parseDish(parsed.dish) : null;

    const dishClassification: DishClassification = {
      dish,
      confidence:
        dish && typeof parsed.dishConfidence === "number"
          ? Math.max(0, Math.min(1, parsed.dishConfidence))
          : 0,
      signals: [
        imageQuality.usable
          ? `Image quality usable (score ${imageQuality.qualityScore.toFixed(2)}).`
          : `Image quality issues: ${imageQuality.issues.join(", ") || "unspecified"}.`,
      ],
    };

    const components = dish ? parseComponents(parsed.components) : [];

    return { imageQuality, dishClassification, components };
  } catch (error) {
    console.warn("[HAWKERLENS] analyzeHawkerPhoto error:", error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
