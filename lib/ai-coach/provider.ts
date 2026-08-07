import OpenAI from "openai";

export type AiProviderName = "openrouter" | "openai";

export type AiProviderConfig = {
  name: AiProviderName;
  apiKey: string;
  baseURL?: string;
  model: string;
  summaryModel: string;
  /** OpenAI Responses API only works on native OpenAI. */
  usesResponsesApi: boolean;
  defaultHeaders?: Record<string, string>;
};

function normalizeProvider(
  value: string | undefined,
): AiProviderName {
  const normalized = (value || "openrouter")
    .trim()
    .toLowerCase();

  if (normalized === "openai") {
    return "openai";
  }

  return "openrouter";
}

export function getAiProviderConfig(): AiProviderConfig {
  const name = normalizeProvider(process.env.AI_PROVIDER);

  if (name === "openai") {
    const apiKey = process.env.OPENAI_API_KEY?.trim();

    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY is missing. Set it in .env.local or switch AI_PROVIDER=openrouter.",
      );
    }

    const model =
      process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini";

    return {
      name,
      apiKey,
      model,
      summaryModel:
        process.env.OPENAI_SUMMARY_MODEL?.trim() || model,
      usesResponsesApi: true,
    };
  }

  const apiKey =
    process.env.OPENROUTER_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is missing. Get a free key at https://openrouter.ai/keys",
    );
  }

  const model =
    process.env.OPENAI_MODEL?.trim() || "openrouter/free";

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "http://localhost:3000";

  return {
    name: "openrouter",
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    model,
    summaryModel:
      process.env.OPENAI_SUMMARY_MODEL?.trim() || model,
    usesResponsesApi: false,
    defaultHeaders: {
      "HTTP-Referer": siteUrl,
      "X-OpenRouter-Title": "Muscle Fitness AI Coach",
    },
  };
}

let cachedClient: OpenAI | null = null;
let cachedClientKey: string | null = null;

export function getAiClient(): OpenAI {
  const config = getAiProviderConfig();
  const cacheKey = [
    config.name,
    config.baseURL || "openai",
    config.apiKey.slice(0, 8),
  ].join("|");

  if (!cachedClient || cachedClientKey !== cacheKey) {
    cachedClient = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      defaultHeaders: config.defaultHeaders,
      timeout: 60_000,
      maxRetries: 2,
    });
    cachedClientKey = cacheKey;
  }

  return cachedClient;
}

export function getAiModel(): string {
  return getAiProviderConfig().model;
}

export function getAiSummaryModel(): string {
  return getAiProviderConfig().summaryModel;
}

export function usesResponsesApi(): boolean {
  return getAiProviderConfig().usesResponsesApi;
}
