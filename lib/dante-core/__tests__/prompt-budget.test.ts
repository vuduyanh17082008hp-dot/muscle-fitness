import { describe, expect, it } from "vitest";

import {
  DANTE_MAX_INPUT_TOKENS,
  estimateTokenCount,
  fitAssembledPromptToBudget,
  fitTextToTokenBudget,
  maxCompletionTokens,
} from "@/lib/dante-core/openai/prompt-budget";

describe("maxCompletionTokens", () => {
  it("leaves room for completion on large prompts", () => {
    const prompt = "x".repeat(20_000);
    const completion = maxCompletionTokens({ inputText: prompt, preferredCap: 2048 });

    expect(completion).toBeGreaterThanOrEqual(256);
    expect(completion).toBeLessThanOrEqual(2048);
  });

  it("allows full preferred cap on short prompts", () => {
    expect(maxCompletionTokens({ inputText: "hello", preferredCap: 1024 })).toBe(1024);
  });
});

describe("fitTextToTokenBudget / fitAssembledPromptToBudget", () => {
  it("condenses long instruction text under the token budget", () => {
    const huge = `HEAD\n${"middle ".repeat(20_000)}\nTAIL`;
    const fitted = fitTextToTokenBudget(huge, 2200);

    expect(estimateTokenCount(fitted)).toBeLessThanOrEqual(2200);
    expect(fitted.startsWith("HEAD")).toBe(true);
    expect(fitted.includes("TAIL")).toBe(true);
  });

  it("keeps the CLIENT QUESTION footer when trimming an assembled prompt", () => {
    const head = `SYSTEM\n${"profile ".repeat(30_000)}`;
    const prompt = `${head}\n============================================================\nCLIENT QUESTION\n============================================================\n\nWhat should I train today?\n`;
    const fitted = fitAssembledPromptToBudget(prompt, DANTE_MAX_INPUT_TOKENS);

    expect(estimateTokenCount(fitted)).toBeLessThanOrEqual(DANTE_MAX_INPUT_TOKENS);
    expect(fitted).toContain("CLIENT QUESTION");
    expect(fitted).toContain("What should I train today?");
  });
});
