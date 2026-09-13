import "server-only";

/**
 * Server-only embedding provider adapter for the Dante Knowledge
 * Brain (spec §3).
 *
 * Provider-agnostic on purpose: any embeddings endpoint that speaks
 * the OpenAI-compatible `POST {baseUrl}/embeddings` shape works
 * (OpenAI itself, or an OpenAI-compatible gateway) by pointing
 * DANTE_EMBEDDING_BASE_URL at it — no provider-specific SDK, no
 * LangChain/LlamaIndex.
 *
 * If no provider is configured (or a call fails), every function
 * here returns null instead of throwing. Callers (retrieve.ts,
 * the ingestion script) MUST treat null as "RAG unavailable right
 * now" and degrade gracefully — normal Dante keeps working without
 * retrieved knowledge. Never let an embedding failure take down a
 * chat response.
 */

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "text-embedding-3-small";
const DEFAULT_DIMENSIONS = 1536;
const REQUEST_TIMEOUT_MS = 10_000;

export type EmbeddingConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  dimensions: number;
};

export function getEmbeddingConfig(): EmbeddingConfig | null {
  const apiKey = process.env.DANTE_EMBEDDING_API_KEY?.trim();

  if (!apiKey) {
    return null;
  }

  const baseUrl = process.env.DANTE_EMBEDDING_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const model = process.env.DANTE_EMBEDDING_MODEL?.trim() || DEFAULT_MODEL;
  const dimensionsRaw = process.env.DANTE_EMBEDDING_DIMENSIONS?.trim();
  const dimensions = dimensionsRaw ? Number.parseInt(dimensionsRaw, 10) : DEFAULT_DIMENSIONS;

  if (!Number.isFinite(dimensions) || dimensions <= 0) {
    console.error("[DANTE RAG] DANTE_EMBEDDING_DIMENSIONS is not a positive integer");
    return null;
  }

  return { apiKey, baseUrl: baseUrl.replace(/\/+$/, ""), model, dimensions };
}

type EmbeddingApiResponse = {
  data?: Array<{ embedding: number[]; index: number }>;
  error?: { message?: string };
};

async function callEmbeddingApi(
  config: EmbeddingConfig,
  input: string[],
): Promise<number[][] | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${config.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: config.model, input }),
      signal: controller.signal,
    });

    const data = (await response.json().catch(() => null)) as EmbeddingApiResponse | null;

    if (!response.ok || !data) {
      console.error(
        "[DANTE RAG] embedding request failed",
        response.status,
        data?.error?.message ?? "(no error body)",
      );
      return null;
    }

    const vectors = data.data;

    if (!Array.isArray(vectors) || vectors.length !== input.length) {
      console.error("[DANTE RAG] embedding response shape mismatch");
      return null;
    }

    const ordered = [...vectors].sort((a, b) => a.index - b.index).map((v) => v.embedding);

    for (const vector of ordered) {
      if (!Array.isArray(vector) || vector.length !== config.dimensions) {
        console.error(
          "[DANTE RAG] embedding dimensionality mismatch",
          `expected ${config.dimensions}, got ${vector?.length ?? "?"}`,
        );
        return null;
      }
    }

    return ordered;
  } catch (error) {
    console.error("[DANTE RAG] embedding request threw", error instanceof Error ? error.message : error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Embeds a single string. Returns null when unconfigured or on any failure. */
export async function embedText(text: string): Promise<number[] | null> {
  const results = await embedBatch([text]);
  return results?.[0] ?? null;
}

/**
 * Embeds a batch of strings in one request. Returns null (for the
 * whole batch) rather than partial results — a partial embedding
 * batch is worse than clearly falling back to no-RAG, since callers
 * cannot tell which entries silently failed.
 */
export async function embedBatch(texts: string[]): Promise<Array<number[] | null> | null> {
  if (texts.length === 0) {
    return [];
  }

  const config = getEmbeddingConfig();

  if (!config) {
    return null;
  }

  const vectors = await callEmbeddingApi(config, texts);

  if (!vectors) {
    return null;
  }

  return vectors;
}

export function isEmbeddingProviderConfigured(): boolean {
  return getEmbeddingConfig() !== null;
}
