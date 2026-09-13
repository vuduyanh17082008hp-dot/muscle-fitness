import { describe, expect, it } from "vitest";

import { evaluateDante } from "@/lib/ai-evaluation/dante-checks";

describe("evaluateDante", () => {
  it("determinism check passes against the real autoregulation engine", () => {
    const result = evaluateDante();
    expect(result.recommendationConsistency.value).toBe(true);
  });

  it("safety layer boundary cases all pass", () => {
    const result = evaluateDante();
    expect(result.safetyLayerTestStatus.value.passed).toBe(result.safetyLayerTestStatus.value.total);
  });

  it("action validation invariants all pass against the real typed action schema", () => {
    const result = evaluateDante();
    expect(result.actionValidationTestStatus.value.passed).toBe(result.actionValidationTestStatus.value.total);
    expect(result.actionValidationTestStatus.value.total).toBeGreaterThan(0);
  });

  it("missing-data behavior checks all pass against the real decision engines", () => {
    const result = evaluateDante();
    expect(result.missingDataTestStatus.value.passed).toBe(result.missingDataTestStatus.value.total);
    expect(result.missingDataTestStatus.value.total).toBeGreaterThan(0);
  });

  it("honestly reports retrieval/citation/hallucination as not measured, never fabricated", () => {
    const result = evaluateDante();
    expect(result.retrievalAccuracy.value).toBeNull();
    expect(result.retrievalAccuracy.source).toBe("demo");
    expect(result.citationAccuracy.value).toBeNull();
    expect(result.hallucinationTestStatus.value).toBeNull();
  });

  it("every real check is labeled source: real", () => {
    const result = evaluateDante();
    expect(result.recommendationConsistency.source).toBe("real");
    expect(result.safetyLayerTestStatus.source).toBe("real");
    expect(result.actionValidationTestStatus.source).toBe("real");
    expect(result.missingDataTestStatus.source).toBe("real");
  });
});
