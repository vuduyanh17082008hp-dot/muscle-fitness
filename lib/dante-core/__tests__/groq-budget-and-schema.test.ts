import { describe, expect, it } from "vitest";

import {
  GROQ_MAX_INPUT_TOKENS,
  GROQ_TPM_SOFT_CEILING,
  estimateTokenCount,
  fitAssembledPromptToBudget,
  fitTextToTokenBudget,
  groqMaxCompletionTokens,
} from "@/lib/dante-core/groq-budget";
import { isMissingRelationError } from "@/lib/dante-core/memory-hierarchy/schema-availability";

describe("groqMaxCompletionTokens", () => {
  it("keeps a large Dante prompt + 120b completion under the TPM soft ceiling", () => {
    const prompt = "x".repeat(16_000); // ~4000 estimated tokens
    const completion = groqMaxCompletionTokens({
      model: "openai/gpt-oss-120b",
      inputText: prompt,
      preferredCap: 4096,
    });

    expect(estimateTokenCount(prompt) + completion).toBeLessThanOrEqual(GROQ_TPM_SOFT_CEILING);
    expect(completion).toBeLessThanOrEqual(1536);
    expect(completion).toBeGreaterThanOrEqual(256);
  });

  it("still allows a useful budget on a short prompt", () => {
    const completion = groqMaxCompletionTokens({
      model: "openai/gpt-oss-20b",
      inputText: "How should I train today?",
      preferredCap: 2048,
    });

    expect(completion).toBe(2048);
  });

  it("never lets an oversized input reserve more than the soft ceiling", () => {
    // Simulates the live DANTE_INSTRUCTIONS footprint (~11k tokens)
    // BEFORE section fitting — completion clamp alone must still be
    // non-zero and cannot invent room above the ceiling.
    const prompt = "y".repeat(44_000);
    const completion = groqMaxCompletionTokens({
      model: "openai/gpt-oss-120b",
      inputText: prompt,
    });

    expect(completion).toBe(256);
    expect(estimateTokenCount(prompt) + completion).toBeGreaterThan(GROQ_TPM_SOFT_CEILING);
  });
});

describe("fitTextToTokenBudget / fitAssembledPromptToBudget", () => {
  it("condenses long instruction text under the token budget", () => {
    const huge = `HEAD_PRIORITY_RULES\n${"middle ".repeat(20_000)}\nTAIL_CITATION_RULES`;
    const fitted = fitTextToTokenBudget(huge, 2200);

    expect(estimateTokenCount(fitted)).toBeLessThanOrEqual(2200);
    expect(fitted.startsWith("HEAD_PRIORITY_RULES")).toBe(true);
    expect(fitted.includes("TAIL_CITATION_RULES")).toBe(true);
    expect(fitted).toContain("condensed for model context budget");
  });

  it("keeps the CLIENT QUESTION footer when trimming an assembled prompt", () => {
    const head = `SYSTEM\n${"profile ".repeat(30_000)}`;
    const prompt = `${head}\n============================================================\nCLIENT QUESTION\n============================================================\n\nWhat should I train today?\n`;
    const fitted = fitAssembledPromptToBudget(prompt, GROQ_MAX_INPUT_TOKENS);

    expect(estimateTokenCount(fitted)).toBeLessThanOrEqual(GROQ_MAX_INPUT_TOKENS);
    expect(fitted).toContain("CLIENT QUESTION");
    expect(fitted).toContain("What should I train today?");
  });
});

describe("isMissingRelationError", () => {
  it("recognizes the PostgREST schema-cache miss for dante_learned_patterns", () => {
    expect(
      isMissingRelationError({
        message: "Could not find the table 'public.dante_learned_patterns' in the schema cache",
        code: "PGRST205",
      }),
    ).toBe(true);
  });

  it("does not treat unrelated errors as missing schema", () => {
    expect(isMissingRelationError({ message: "permission denied", code: "42501" })).toBe(false);
  });
});
