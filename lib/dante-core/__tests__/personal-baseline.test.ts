import { describe, expect, it } from "vitest";

import { computeBaselineDeviation, MIN_SAMPLES_FOR_BASELINE } from "../personal-baseline";

describe("computeBaselineDeviation", () => {
  it("returns null baseline/delta and zero confidence with insufficient history", () => {
    const result = computeBaselineDeviation([7, 7.5, 6.8], 7.2);
    expect(result.baseline).toBeNull();
    expect(result.delta).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.sampleCount).toBe(3);
    expect(result.current).toBe(7.2);
  });

  it("computes a real baseline once the minimum sample count is met", () => {
    const history = [7, 7, 7, 7, 7]; // exactly MIN_SAMPLES_FOR_BASELINE
    expect(history.length).toBe(MIN_SAMPLES_FOR_BASELINE);

    const result = computeBaselineDeviation(history, 5);
    expect(result.baseline).toBe(7);
    expect(result.delta).toBe(-2);
    expect(result.sampleCount).toBe(5);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("ignores nulls in history when counting samples", () => {
    const result = computeBaselineDeviation([7, null, 7, null, 7, 7, 7], 7);
    expect(result.sampleCount).toBe(5);
    expect(result.baseline).toBe(7);
    expect(result.delta).toBe(0);
  });

  it("never fabricates a current value — passes null straight through", () => {
    const result = computeBaselineDeviation([7, 7, 7, 7, 7, 7], null);
    expect(result.current).toBeNull();
    expect(result.delta).toBeNull();
    expect(result.baseline).not.toBeNull();
  });

  it("confidence increases monotonically with sample count and caps at 1", () => {
    const few = computeBaselineDeviation(Array(6).fill(5), 5);
    const many = computeBaselineDeviation(Array(30).fill(5), 5);
    expect(many.confidence).toBeGreaterThan(few.confidence);
    expect(many.confidence).toBeLessThanOrEqual(1);
  });

  it("is deterministic — identical input always produces identical output", () => {
    const a = computeBaselineDeviation([6, 7, 8, 6.5, 7.5, 7], 8);
    const b = computeBaselineDeviation([6, 7, 8, 6.5, 7.5, 7], 8);
    expect(a).toEqual(b);
  });
});
