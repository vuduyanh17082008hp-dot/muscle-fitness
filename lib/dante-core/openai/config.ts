import "server-only";

/**
 * Dante LLM configuration — OpenAI only.
 *
 * Embeddings may use a separate key (DANTE_EMBEDDING_API_KEY) via
 * knowledge-brain/embedding-provider.ts; chat + tool-calling always
 * use OPENAI_API_KEY here.
 */

export const OPENAI_CHAT_BASE_URL = "https://api.openai.com/v1";

export function getOpenAiApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing from .env.local");
  }

  return apiKey;
}

export function isOpenAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function getDanteOpenAiModels(): string[] {
  const primary = process.env.DANTE_OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const fallback = process.env.DANTE_OPENAI_FALLBACK_MODEL?.trim() || "gpt-4o-mini";

  return Array.from(new Set([primary, fallback].filter(Boolean)));
}

export function getDanteOpenAiModel(): string {
  return getDanteOpenAiModels()[0] ?? "gpt-4o-mini";
}

/** Default request timeout for non-streaming calls. */
export const OPENAI_REQUEST_TIMEOUT_MS = 25_000;

/** Default request timeout for streaming chat. */
export const OPENAI_STREAM_TIMEOUT_MS = 60_000;
