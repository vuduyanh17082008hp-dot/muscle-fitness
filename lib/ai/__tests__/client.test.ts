import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

describe("lib/ai/client (OpenAI-only compatibility adapter)", () => {
  it("imports without reading OPENAI_API_KEY eagerly", async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(import("@/lib/ai/client")).resolves.toBeDefined();
  });

  it("the deprecated isGroqConfigured name reflects OPENAI_API_KEY", async () => {
    delete process.env.OPENAI_API_KEY;
    const { isGroqConfigured: withoutKey } = await import("@/lib/ai/client");
    expect(withoutKey()).toBe(false);

    vi.resetModules();
    process.env.OPENAI_API_KEY = "test-openai-key";
    const { isGroqConfigured: withKey } = await import("@/lib/ai/client");
    expect(withKey()).toBe(true);
  });

  it("keeps OPENAI_API_KEY access lazy until a completion is requested", async () => {
    delete process.env.OPENAI_API_KEY;
    const { getGroqClient } = await import("@/lib/ai/client");

    const client = getGroqClient();
    await expect(
      client.chat.completions.create({
        messages: [{ role: "user", content: "hello" }],
      }),
    ).rejects.toThrow(/OPENAI_API_KEY is missing/);
  });

  it("returns the same OpenAI-backed compatibility adapter across calls", async () => {
    const { getGroqClient } = await import("@/lib/ai/client");

    expect(getGroqClient()).toBe(getGroqClient());
  });

  it("uses the OpenAI default model when no override is set", async () => {
    delete process.env.DANTE_OPENAI_MODEL;
    delete process.env.OPENAI_MODEL;
    const { GROQ_MODEL, OPENAI_MODEL } = await import("@/lib/ai/client");

    expect(GROQ_MODEL).toBe("gpt-4o-mini");
    expect(GROQ_MODEL).toBe(OPENAI_MODEL);
  });

  it("uses the Dante OpenAI model override and ignores GROQ_MODEL", async () => {
    process.env.DANTE_OPENAI_MODEL = "gpt-5-mini";
    process.env.GROQ_MODEL = "llama-3.3-70b-versatile";
    const { GROQ_MODEL, OPENAI_MODEL } = await import("@/lib/ai/client");

    expect(OPENAI_MODEL).toBe("gpt-5-mini");
    expect(GROQ_MODEL).toBe("gpt-5-mini");
  });
});
