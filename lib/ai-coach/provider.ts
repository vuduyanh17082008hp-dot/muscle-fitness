import OpenAI from "openai";

export type AiProviderName = "self_hosted" | "openrouter" | "openai";

export type AiTransportMode = "responses" | "chat_completions";

export type AiProviderConfig = {
  name: AiProviderName;
  apiKey: string;
  baseURL?: string;
  model: string;
  summaryModel: string;
  transport: AiTransportMode;
  defaultHeaders?: Record<string, string>;
};

export class AiProviderConfigError extends Error {
  readonly code:
    | "not_configured"
    | "invalid_production_url"
    | "missing_model"
    | "missing_key";

  constructor(
    code: AiProviderConfigError["code"],
    message: string,
  ) {
    super(message);
    this.name = "AiProviderConfigError";
    this.code = code;
  }
}

function normalizeProvider(
  value: string | undefined,
): AiProviderName {
  // Default: OpenRouter free models (avoids OpenAI billing 429s).
  const normalized = (value || "openrouter").trim().toLowerCase();

  if (normalized === "openai") {
    return "openai";
  }

  if (
    normalized === "self_hosted" ||
    normalized === "self-hosted" ||
    normalized === "local" ||
    normalized === "vllm" ||
    normalized === "ollama"
  ) {
    return "self_hosted";
  }

  return "openrouter";
}

function resolveModelId(fallback?: string): string {
  return (
    process.env.AI_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    fallback ||
    ""
  );
}

function resolveSummaryModel(model: string): string {
  return (
    process.env.AI_SUMMARY_MODEL?.trim() ||
    process.env.OPENAI_SUMMARY_MODEL?.trim() ||
    model
  );
}

function isLocalBaseUrl(baseURL: string): boolean {
  try {
    const url = new URL(baseURL);
    const host = url.hostname.toLowerCase();

    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1"
    );
  } catch {
    const lower = baseURL.toLowerCase();
    return (
      lower.includes("localhost") ||
      lower.includes("127.0.0.1") ||
      lower.includes("0.0.0.0")
    );
  }
}

function assertProductionBaseUrl(baseURL: string): void {
  if (process.env.VERCEL === "1" && isLocalBaseUrl(baseURL)) {
    throw new AiProviderConfigError(
      "invalid_production_url",
      "Production AI_BASE_URL must be a publicly reachable HTTPS endpoint.",
    );
  }
}

function resolveTransport(
  name: AiProviderName,
): AiTransportMode {
  const forced = process.env.AI_TRANSPORT?.trim().toLowerCase();

  if (forced === "responses") {
    return "responses";
  }

  if (forced === "chat" || forced === "chat_completions") {
    return "chat_completions";
  }

  // Native OpenAI supports Responses; open-source OpenAI-compatible
  // servers typically expose chat/completions only.
  return name === "openai" ? "responses" : "chat_completions";
}

export function getAiProviderConfig(): AiProviderConfig {
  const name = normalizeProvider(process.env.AI_PROVIDER);
  const transport = resolveTransport(name);

  if (name === "openai") {
    const apiKey = process.env.OPENAI_API_KEY?.trim();

    if (!apiKey) {
      throw new AiProviderConfigError(
        "missing_key",
        "OPENAI_API_KEY is missing for AI_PROVIDER=openai.",
      );
    }

    const model = resolveModelId();

    if (!model) {
      throw new AiProviderConfigError(
        "missing_model",
        "AI_MODEL (or OPENAI_MODEL) is required for AI_PROVIDER=openai.",
      );
    }

    return {
      name,
      apiKey,
      model,
      summaryModel: resolveSummaryModel(model),
      transport,
    };
  }

  if (name === "openrouter") {
    const apiKey =
      process.env.OPENROUTER_API_KEY?.trim() ||
      process.env.AI_API_KEY?.trim() ||
      process.env.OPENAI_API_KEY?.trim();

    if (!apiKey) {
      throw new AiProviderConfigError(
        "missing_key",
        "OPENROUTER_API_KEY is missing. Get a free key at https://openrouter.ai/keys",
      );
    }

    const model = resolveModelId("openrouter/free");

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
      "http://localhost:3000";

    return {
      name,
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      model,
      summaryModel: resolveSummaryModel(model),
      transport,
      defaultHeaders: {
        "HTTP-Referer": siteUrl,
        "X-OpenRouter-Title": "Muscle Fitness AI Coach",
      },
    };
  }

  const baseURL =
    process.env.AI_BASE_URL?.trim() ||
    process.env.OPENAI_BASE_URL?.trim();

  if (!baseURL) {
    throw new AiProviderConfigError(
      "not_configured",
      "AI inference server is not configured. Set AI_BASE_URL for AI_PROVIDER=self_hosted.",
    );
  }

  assertProductionBaseUrl(baseURL);

  const apiKey =
    process.env.AI_API_KEY?.trim() ||
    process.env.VLLM_API_KEY?.trim() ||
    "local-dev-token";

  const model = resolveModelId();

  if (!model) {
    throw new AiProviderConfigError(
      "missing_model",
      "AI_MODEL is required for AI_PROVIDER=self_hosted.",
    );
  }

  return {
    name: "self_hosted",
    apiKey,
    baseURL,
    model,
    summaryModel: resolveSummaryModel(model),
    transport,
  };
}

let cachedClient: OpenAI | null = null;
let cachedClientKey: string | null = null;

export function getAiClient(): OpenAI {
  const config = getAiProviderConfig();
  const cacheKey = [
    config.name,
    config.baseURL || "default",
    config.apiKey.slice(0, 8),
    config.transport,
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
  return getAiProviderConfig().transport === "responses";
}

export function getSafeProviderInfo(): {
  provider: AiProviderName;
  model: string;
  baseUrlConfigured: boolean;
  transport: AiTransportMode;
} {
  try {
    const config = getAiProviderConfig();

    return {
      provider: config.name,
      model: config.model,
      baseUrlConfigured: Boolean(config.baseURL) || config.name === "openai",
      transport: config.transport,
    };
  } catch {
    const name = normalizeProvider(process.env.AI_PROVIDER);

    return {
      provider: name,
      model:
        process.env.AI_MODEL?.trim() ||
        process.env.OPENAI_MODEL?.trim() ||
        "",
      baseUrlConfigured: Boolean(
        process.env.AI_BASE_URL?.trim() ||
          process.env.OPENAI_BASE_URL?.trim(),
      ),
      transport: resolveTransport(name),
    };
  }
}
