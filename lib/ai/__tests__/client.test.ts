import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

describe("lib/ai/client", () => {
  it("imports without reading OPENAI_API_KEY eagerly", async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(import("@/lib/ai/client")).resolves.toBeDefined();
  });

  it("keeps OPENAI_API_KEY access lazy until a completion is requested", async () => {
    delete process.env.OPENAI_API_KEY;
    const { createOpenAiChatCompletion } = await import("@/lib/ai/client");

    await expect(
      createOpenAiChatCompletion({
        messages: [{ role: "user", content: "hello" }],
      }),
    ).rejects.toThrow(/OPENAI_API_KEY is missing/);
  });

  it("uses the OpenAI default model when no override is set", async () => {
    delete process.env.DANTE_OPENAI_MODEL;
    delete process.env.OPENAI_MODEL;
    const { OPENAI_MODEL } = await import("@/lib/ai/client");

    expect(OPENAI_MODEL).toBe("gpt-4o-mini");
  });

  it("uses the Dante OpenAI model override", async () => {
    process.env.DANTE_OPENAI_MODEL = "gpt-5-mini";
    const { OPENAI_MODEL } = await import("@/lib/ai/client");

    expect(OPENAI_MODEL).toBe("gpt-5-mini");
  });
});
