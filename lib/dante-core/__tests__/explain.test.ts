import { describe, expect, it, vi } from "vitest";

/**
 * LLM-unavailable handling (mission Part 15/18). Dante's explanation
 * layer must never leave the user without a real, traceable
 * explanation just because Groq is unreachable — the deterministic
 * decision (recommendation/why/confidence) it already computed is
 * still fully usable on its own.
 */

vi.mock("@/lib/dante-core/llm-client", () => ({
  callGroqWithFallback: vi.fn(),
}));

vi.mock("@/lib/dante-core/knowledge/retrieve", () => ({
  retrieveKnowledge: vi.fn(() => []),
}));

import { callGroqWithFallback } from "@/lib/dante-core/llm-client";
import { explainRecommendation } from "@/lib/dante-core/explain";
import type { TraceableDecision } from "@/lib/dante-core/types";

function decision(): TraceableDecision<{ note: string }> {
  return {
    recommendation: "Reduce today's lower-body volume by around 20%.",
    decision: { note: "example" },
    why: ["Recovery score is 54/100 today.", "Soreness scored 78/100."],
    dataUsed: { recoveryScore: 54, soreness: 7 },
    confidence: "moderate",
    sources: [],
  };
}

describe("explainRecommendation", () => {
  it("falls back to a plain-text render of the real decision when Groq returns null", async () => {
    vi.mocked(callGroqWithFallback).mockResolvedValue(null);

    const result = await explainRecommendation(decision());

    expect(result.explanationSource).toBe("fallback");
    expect(result.explanation).toContain("Reduce today's lower-body volume by around 20%.");
    expect(result.explanation).toContain("Recovery score is 54/100 today.");
    expect(result.explanation).toContain("moderate");
  });

  it("falls back gracefully when Groq throws instead of returning null", async () => {
    vi.mocked(callGroqWithFallback).mockRejectedValue(new Error("network unavailable"));

    const result = await explainRecommendation(decision());

    expect(result.explanationSource).toBe("fallback");
    expect(result.decision.recommendation).toBe("Reduce today's lower-body volume by around 20%.");
  });

  it("never alters the underlying decision object — the fallback explains it, it doesn't replace it", async () => {
    vi.mocked(callGroqWithFallback).mockResolvedValue(null);

    const original = decision();
    const result = await explainRecommendation(original);

    expect(result.decision).toEqual(original);
  });
});
