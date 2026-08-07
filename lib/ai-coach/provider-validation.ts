import {
  AiProviderConfigError,
  getAiProviderConfig,
} from "@/lib/ai-coach/provider";

/**
 * Diagnostic helpers used by scripts/tests.
 * Safe to import from Node or Next server code.
 */
export function validateSelfHostedLocalConfig(): {
  ok: boolean;
  error?: string;
} {
  const previous = {
    AI_PROVIDER: process.env.AI_PROVIDER,
    AI_BASE_URL: process.env.AI_BASE_URL,
    AI_API_KEY: process.env.AI_API_KEY,
    AI_MODEL: process.env.AI_MODEL,
    VERCEL: process.env.VERCEL,
  };

  try {
    process.env.AI_PROVIDER = "self_hosted";
    process.env.AI_BASE_URL = "http://localhost:8000/v1";
    process.env.AI_API_KEY = "test-token";
    process.env.AI_MODEL = "test-model";
    delete process.env.VERCEL;

    const config = getAiProviderConfig();

    if (config.name !== "self_hosted") {
      return { ok: false, error: "Expected self_hosted provider." };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    restoreEnv(previous);
  }
}

export function validateProductionLocalhostRejected(): {
  ok: boolean;
  error?: string;
} {
  const previous = {
    AI_PROVIDER: process.env.AI_PROVIDER,
    AI_BASE_URL: process.env.AI_BASE_URL,
    AI_API_KEY: process.env.AI_API_KEY,
    AI_MODEL: process.env.AI_MODEL,
    VERCEL: process.env.VERCEL,
  };

  try {
    process.env.AI_PROVIDER = "self_hosted";
    process.env.AI_BASE_URL = "http://localhost:8000/v1";
    process.env.AI_API_KEY = "test-token";
    process.env.AI_MODEL = "test-model";
    process.env.VERCEL = "1";

    getAiProviderConfig();
    return {
      ok: false,
      error: "Expected production localhost URL to be rejected.",
    };
  } catch (error) {
    if (
      error instanceof AiProviderConfigError &&
      error.code === "invalid_production_url"
    ) {
      return { ok: true };
    }

    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    restoreEnv(previous);
  }
}

function restoreEnv(
  previous: Record<string, string | undefined>,
): void {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
