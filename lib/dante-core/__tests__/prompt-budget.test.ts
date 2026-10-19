import { describe, expect, it } from "vitest";

import {
  DANTE_MAX_INPUT_TOKENS,
  estimateTokenCount,
  fitAssembledPromptToBudget,
  fitInstructionSections,
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

describe("fitInstructionSections", () => {
  const section = (header: string, words: number) => `${"=".repeat(20)}\n${header}\n${"=".repeat(20)}\n\n${`${header.toLowerCase()} rule. `.repeat(words)}`;
  const text = ["You are Dante.", section("STYLE", 200), section("SAFETY", 200), section("DETAIL", 40), section("TOOLS", 200)].join("\n");
  const mandatory = (header: string) => header === "SAFETY" || header === "TOOLS";

  it("keeps the preamble and every mandatory section whole, even over budget", () => {
    const fitted = fitInstructionSections(text, 100, mandatory);
    expect(fitted).toContain("You are Dante.");
    expect(fitted).toContain(section("SAFETY", 200));
    expect(fitted).toContain(section("TOOLS", 200));
    expect(fitted).not.toContain("\nSTYLE\n");
  });

  it("fills the remaining budget with whole optional sections, never a partial one", () => {
    // STYLE (~600 tokens) no longer fits; DETAIL (~120) still does.
    const fitted = fitInstructionSections(text, estimateTokenCount(text) - 400, mandatory);
    expect(fitted).toContain(section("DETAIL", 40));
    expect(fitted).not.toContain("\nSTYLE\n");
    expect(fitted).not.toMatch(/condensed/);
  });

  it("returns the text untouched when it fits", () => {
    expect(fitInstructionSections(text, 100_000, mandatory)).toBe(text);
  });
});
