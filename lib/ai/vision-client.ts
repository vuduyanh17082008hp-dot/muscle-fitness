import "server-only"

/**
 * Vision adapter for Photo Meal Estimate — deliberately SEPARATE from
 * Dante's text model (lib/ai/client.ts / GROQ_MODEL). Dante's
 * configured model is a reasoning model, not assumed to support
 * images, and is never touched by this file.
 *
 * There is no hardcoded default vision model: `GROQ_VISION_MODEL`
 * must be explicitly set to a model ID you've verified supports image
 * input (see console.groq.com/docs/models). If it isn't set, Photo
 * Estimate reports itself as unconfigured rather than silently
 * failing or faking a result — every other tracking method (barcode,
 * search, manual entry) works fully without it.
 */

export function isVisionConfigured(): boolean {
  return Boolean(process.env.GROQ_VISION_MODEL?.trim())
}

export type DetectedFoodItem = {
  name: string
  /** Rough portion estimate in grams — inherently uncertain from a single photo. */
  estimatedGrams: number
  confidence: "high" | "medium" | "low"
  notes?: string
}

export type VisionEstimateResult = {
  items: DetectedFoodItem[]
}

const VISION_TIMEOUT_MS = 20000

const SYSTEM_PROMPT = `
You identify foods visible in a photo of a meal.

You do NOT know exact calories, protein, carbs or fat — a separate
nutrition database provides those. Only report:

- the food's common name (e.g. "grilled chicken breast", "cooked white rice", "steamed broccoli")
- a rough estimated portion weight in grams
- your confidence in that identification: "high", "medium", or "low"
- optionally, a short note about uncertainty (e.g. "partially hidden", "unclear if oiled")

Return ONLY valid JSON in exactly this shape, nothing else:

{
  "items": [
    { "name": "string", "estimatedGrams": number, "confidence": "high" | "medium" | "low", "notes": "string (optional)" }
  ]
}

Rules:
- List each distinct food separately. Do not merge a whole plate into one item.
- If you cannot identify any food, return { "items": [] }.
- Never invent a brand name that isn't visibly legible on packaging.
- Do not include calories or macronutrients in your response — you are not the source of that data.
`.trim()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseItems(raw: unknown): DetectedFoodItem[] {
  if (!isRecord(raw) || !Array.isArray(raw.items)) {
    return []
  }

  const items: DetectedFoodItem[] = []

  for (const entry of raw.items) {
    if (!isRecord(entry)) continue

    const name = typeof entry.name === "string" ? entry.name.trim() : ""
    const estimatedGrams = typeof entry.estimatedGrams === "number" ? entry.estimatedGrams : null
    const confidence =
      entry.confidence === "high" || entry.confidence === "medium" || entry.confidence === "low"
        ? entry.confidence
        : "medium"

    if (!name || estimatedGrams === null || estimatedGrams <= 0) continue

    items.push({
      name,
      estimatedGrams: Math.round(estimatedGrams),
      confidence,
      notes: typeof entry.notes === "string" ? entry.notes : undefined,
    })
  }

  return items
}

/**
 * Sends a photo (base64 data URL) to the configured Groq vision
 * model and asks it to identify foods + rough portions ONLY.
 * Returns `null` when vision isn't configured or the request fails —
 * callers must treat that as "unavailable", never as "no food found".
 */
export async function identifyFoodsInImage(
  imageDataUrl: string,
): Promise<VisionEstimateResult | null> {
  const model = process.env.GROQ_VISION_MODEL?.trim()
  const apiKey = process.env.GROQ_API_KEY?.trim()

  if (!model || !apiKey) {
    return null
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS)

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
              { type: "text", text: "Identify the foods in this photo." },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
      }),
    })

    if (!response.ok) {
      console.warn(`[VISION] Groq vision request failed: HTTP ${response.status}`)
      return null
    }

    const data: unknown = await response.json()

    if (!isRecord(data) || !Array.isArray(data.choices)) {
      return null
    }

    const content = data.choices[0]
    const message = isRecord(content) ? content.message : null
    const text = isRecord(message) && typeof message.content === "string" ? message.content : null

    if (!text) {
      return null
    }

    let parsed: unknown

    try {
      parsed = JSON.parse(text)
    } catch {
      console.warn("[VISION] Model did not return valid JSON.")
      return null
    }

    return { items: parseItems(parsed) }
  } catch (error) {
    console.warn("[VISION] identifyFoodsInImage error:", error)
    return null
  } finally {
    clearTimeout(timer)
  }
}
