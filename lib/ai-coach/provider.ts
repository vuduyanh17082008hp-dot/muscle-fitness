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

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_DEFAULT_MODEL = "openrouter/free";

function normalizeProvider(
  value: string | undefined,
): AiProviderName {
  // Default always OpenRouter. Never infer from key presence.
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

  // Unknown values (including empty) → openrouter.
  return "openrouter";
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

function resolveTransport(name: AiProviderName): AiTransportMode {
  const forced = process.env.AI_TRANSPORT?.trim().toLowerCase();

  if (forced === "responses") {
    return "responses";
  }

  if (forced === "chat" || forced === "chat_completions") {
    return "chat_completions";
  }

  // Native OpenAI supports Responses; OpenRouter / self-hosted use chat.
  return name === "openai" ? "responses" : "chat_completions";
}

function resolveOpenRouterModel(): string {
  const primary = process.env.OPENROUTER_MODEL?.trim();
  if (primary) {
    return primary;
  }

  // Legacy alias: only accept OpenRouter-style IDs (e.g. "vendor/model").
  // Never send Cursor/OpenAI-only IDs like gpt-5.6-* to OpenRouter.
  const legacy = process.env.OPENAI_MODEL?.trim();
  if (legacy && legacy.includes("/")) {
    return legacy;
  }

  return OPENROUTER_DEFAULT_MODEL;
}

function resolveOpenRouterSummaryModel(model: string): string {
  return (
    process.env.OPENROUTER_SUMMARY_MODEL?.trim() ||
    process.env.OPENROUTER_MODEL?.trim() ||
    model
  );
}

function resolveOpenAiModel(): string {
  return (
    process.env.OPENAI_MODEL?.trim() ||
    process.env.AI_MODEL?.trim() ||
    ""
  );
}

function resolveOpenAiSummaryModel(model: string): string {
  return (
    process.env.OPENAI_SUMMARY_MODEL?.trim() ||
    process.env.AI_SUMMARY_MODEL?.trim() ||
    model
  );
}

function resolveSelfHostedModel(): string {
  return (
    process.env.AI_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    ""
  );
}

function resolveSelfHostedSummaryModel(model: string): string {
  return (
    process.env.AI_SUMMARY_MODEL?.trim() ||
    process.env.OPENAI_SUMMARY_MODEL?.trim() ||
    model
  );
}

let lastLoggedSelection: string | null = null;

function logProviderSelection(config: AiProviderConfig): void {
  const key = `${config.name}|${config.model}|${config.transport}`;
  if (lastLoggedSelection === key) {
    return;
  }

  lastLoggedSelection = key;
  console.info(
    `[AI Coach] provider=${config.name} model=${config.model} transport=${config.transport}`,
  );
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

    const model = resolveOpenAiModel();

    if (!model) {
      throw new AiProviderConfigError(
        "missing_model",
        "OPENAI_MODEL is required for AI_PROVIDER=openai.",
      );
    }

    const config: AiProviderConfig = {
      name,
      apiKey,
      model,
      summaryModel: resolveOpenAiSummaryModel(model),
      transport,
    };

    logProviderSelection(config);
    return config;
  }

  if (name === "openrouter") {
    // CRITICAL: never reuse OPENAI_API_KEY for OpenRouter.
    const apiKey = process.env.OPENROUTER_API_KEY?.trim();

    if (!apiKey) {
      throw new AiProviderConfigError(
        "missing_key",
        "OPENROUTER_API_KEY is missing for AI_PROVIDER=openrouter. Set OPENROUTER_API_KEY (do not use OPENAI_API_KEY).",
      );
    }

    const model = resolveOpenRouterModel();

    if (!model) {
      throw new AiProviderConfigError(
        "missing_model",
        "OPENROUTER_MODEL is required for AI_PROVIDER=openrouter.",
      );
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
      "http://localhost:3000";

    const config: AiProviderConfig = {
      name,
      apiKey,
      baseURL: OPENROUTER_BASE_URL,
      model,
      summaryModel: resolveOpenRouterSummaryModel(model),
      transport,
      defaultHeaders: {
        "HTTP-Referer": siteUrl,
        "X-OpenRouter-Title": "Muscle Fitness AI Coach",
      },
    };

    logProviderSelection(config);
    return config;
  }

  // self_hosted — only when AI_PROVIDER explicitly selects it.
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

  const model = resolveSelfHostedModel();

  if (!model) {
    throw new AiProviderConfigError(
      "missing_model",
      "AI_MODEL is required for AI_PROVIDER=self_hosted.",
    );
  }

  const config: AiProviderConfig = {
    name: "self_hosted",
    apiKey,
    baseURL,
    model,
    summaryModel: resolveSelfHostedSummaryModel(model),
    transport,
  };

  logProviderSelection(config);
  return config;
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
    config.model,
  ].join("|");

  if (!cachedClient || cachedClientKey !== cacheKey) {
    cachedClient = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      defaultHeaders: config.defaultHeaders,
      timeout: 60_000,
      // Do not aggressively retry 429 / billing failures.
      maxRetries: 0,
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

    const model =
      name === "openrouter"
        ? process.env.OPENROUTER_MODEL?.trim() ||
          process.env.OPENAI_MODEL?.trim() ||
          OPENROUTER_DEFAULT_MODEL
        : name === "openai"
          ? process.env.OPENAI_MODEL?.trim() ||
            process.env.AI_MODEL?.trim() ||
            ""
          : process.env.AI_MODEL?.trim() ||
            process.env.OPENAI_MODEL?.trim() ||
            "";

    return {
      provider: name,
      model,
      baseUrlConfigured: Boolean(
        process.env.AI_BASE_URL?.trim() ||
          process.env.OPENAI_BASE_URL?.trim() ||
          name === "openrouter",
      ),
      transport: resolveTransport(name),
    };
  }
}
