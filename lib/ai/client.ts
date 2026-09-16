import "server-only";

import Groq from "groq-sdk";

export const GROQ_MODEL =
  process.env.GROQ_MODEL?.trim() ||
  "openai/gpt-oss-120b";

let cachedClient: Groq | null = null;

/** True when GROQ_API_KEY is present — check before calling getGroqClient() to avoid a throw. */
export function isGroqConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

/**
 * Lazily constructs the Groq client on first use. Reading
 * GROQ_API_KEY happens here, not at module scope — importing this
 * file (e.g. transitively, while Next.js collects route data during
 * `next build`) must never throw just because the env var isn't set
 * in that environment. Only an actual request that needs Groq should
 * fail, and it should fail at request/runtime, not at import time.
 */
export function getGroqClient(): Groq {
  if (cachedClient) {
    return cachedClient;
  }

  const apiKey = process.env.GROQ_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      "Missing GROQ_API_KEY. Add GROQ_API_KEY to .env.local."
    );
  }

  cachedClient = new Groq({ apiKey });
  return cachedClient;
}
