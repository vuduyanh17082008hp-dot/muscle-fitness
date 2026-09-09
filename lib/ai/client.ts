import "server-only"

import Groq from "groq-sdk"

/**
 * Single Groq client for the whole application.
 *
 * Groq is the API provider. GROQ_MODEL is the model ID running on Groq
 * (the default, "openai/gpt-oss-120b", is an open-weights model hosted by
 * Groq — it does not mean the OpenAI API is used anywhere).
 *
 * This module is server-only. GROQ_API_KEY must never reach the browser.
 */

export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b"

export type GroqRunResult = {
  ok: boolean
  content: string
  model: string
  /** Present when the call failed; safe to show in server logs. */
  error?: string
}

export function getGroqModel(): string {
  return process.env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL
}

export function isGroqConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim())
}

let cachedClient: Groq | null = null
let cachedKey: string | null = null

function getGroqClient(): Groq | null {
  const apiKey = process.env.GROQ_API_KEY?.trim()

  if (!apiKey) {
    return null
  }

  if (!cachedClient || cachedKey !== apiKey) {
    cachedClient = new Groq({
      apiKey,
      timeout: 30_000,
      maxRetries: 1,
    })

    cachedKey = apiKey
  }

  return cachedClient
}

export type GroqJsonRequest = {
  system: string
  user: string
  temperature?: number
  maxTokens?: number
}

/**
 * Ask Groq for a JSON object.
 *
 * Never throws: a missing key, a network failure or a provider error all
 * resolve to `{ ok: false }` so callers can fall back to deterministic
 * output rather than failing the business dashboard.
 */
export async function runGroqJson(
  request: GroqJsonRequest,
): Promise<GroqRunResult> {
  const model = getGroqModel()
  const client = getGroqClient()

  if (!client) {
    return {
      ok: false,
      content: "",
      model,
      error: "GROQ_API_KEY is not configured.",
    }
  }

  try {
    const completion = await client.chat.completions.create({
      model,
      temperature: request.temperature ?? 0.4,
      max_completion_tokens: request.maxTokens ?? 1200,
      response_format: { type: "json_object" },

      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
      ],
    })

    const content =
      completion.choices[0]?.message?.content?.trim() ?? ""

    if (!content) {
      return {
        ok: false,
        content: "",
        model,
        error: "Groq returned an empty response.",
      }
    }

    return { ok: true, content, model }
  } catch (error) {
    return {
      ok: false,
      content: "",
      model,
      error:
        error instanceof Error
          ? error.message
          : "Unknown Groq request failure.",
    }
  }
}

export function getSafeAiProviderInfo(): {
  provider: "groq"
  model: string
  configured: boolean
} {
  return {
    provider: "groq",
    model: getGroqModel(),
    configured: isGroqConfigured(),
  }
}
