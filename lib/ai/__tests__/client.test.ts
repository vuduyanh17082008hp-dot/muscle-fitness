import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

describe("lib/ai/client (Groq client stays lazy, never throws at import time)", () => {
  it("importing the module never throws, even with no GROQ_API_KEY set", async () => {
    delete process.env.GROQ_API_KEY;

    await expect(import("@/lib/ai/client")).resolves.toBeDefined();
  });

  it("isGroqConfigured reflects GROQ_API_KEY presence", async () => {
    delete process.env.GROQ_API_KEY;
    const { isGroqConfigured: isConfiguredWithoutKey } = await import("@/lib/ai/client");
    expect(isConfiguredWithoutKey()).toBe(false);

    vi.resetModules();
    process.env.GROQ_API_KEY = "test-key";
    const { isGroqConfigured: isConfiguredWithKey } = await import("@/lib/ai/client");
    expect(isConfiguredWithKey()).toBe(true);
  });

  it("getGroqClient throws only when called, not on import, when the key is missing", async () => {
    delete process.env.GROQ_API_KEY;
    const { getGroqClient } = await import("@/lib/ai/client");

    expect(() => getGroqClient()).toThrow(/Missing GROQ_API_KEY/);
  });

  it("getGroqClient returns a client and caches it across calls when the key is present", async () => {
    process.env.GROQ_API_KEY = "test-key";
    const { getGroqClient } = await import("@/lib/ai/client");

    const first = getGroqClient();
    const second = getGroqClient();

    expect(first).toBe(second);
  });

  it("GROQ_MODEL falls back to the documented default when unset", async () => {
    delete process.env.GROQ_MODEL;
    const { GROQ_MODEL } = await import("@/lib/ai/client");

    expect(GROQ_MODEL).toBe("openai/gpt-oss-120b");
  });

  it("GROQ_MODEL respects an explicit override", async () => {
    process.env.GROQ_MODEL = "llama-3.3-70b-versatile";
    const { GROQ_MODEL } = await import("@/lib/ai/client");

    expect(GROQ_MODEL).toBe("llama-3.3-70b-versatile");
  });
});
