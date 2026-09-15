import { describe, expect, it } from "vitest";

import {
  GROQ_TPM_SOFT_CEILING,
  estimateTokenCount,
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
