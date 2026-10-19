import { describe, expect, it } from "vitest"

import { extractCausalTargetFromText, isPerformanceAttributionQuery } from "@/lib/dante-core/runtime-convergence";

describe("performance attribution trigger", () => {
  it.each([
    "Why is my squat worse?",
    "Why did my bench performance drop?",
    "Why am I weaker this week?",
    "Why did my reps decrease?",
    "What caused this decline?",
    "Why has my performance stalled?",
    "Tại sao tôi yếu hơn tuần này?",
  ])("detects causal attribution: %s", (msg) => {
    expect(isPerformanceAttributionQuery(msg)).toBe(true);
  });

  it.each([
    "What is my squat workout?",
    "Show my squat history",
    "Why is the sky blue?",
    "Why is my calorie target lower today?",
    "How much did I bench last week?",
  ])("does not treat lookups as causal: %s", (msg) => {
    expect(isPerformanceAttributionQuery(msg)).toBe(false);
  });

  it("does not name a cause (extractor stays unchanged, no invented SLEEP)", () => {
    expect(extractCausalTargetFromText("Why is my squat worse?")).toBeNull();
  });
});
