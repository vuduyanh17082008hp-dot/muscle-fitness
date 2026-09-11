import { describe, expect, it } from "vitest";
import {
  computeMuscleRecommendation,
  type MuscleRecommendationInput,
} from "@/lib/training/recommendations";
import type { PersonalBaseline } from "@/lib/training/baseline";

function baseline(overrides: Partial<PersonalBaseline> = {}): PersonalBaseline {
  return {
    muscle: "chest",
    sampleWeeks: 8,
    typicalWeeklyVolume: 12,
    recentRange: { min: 10, max: 14 },
    variability: "low",
    ...overrides,
  };
}

function input(overrides: Partial<MuscleRecommendationInput> = {}): MuscleRecommendationInput {
  return {
    currentEffectiveVolume: 12,
    previousVolume: 12,
    changePercent: 0,
    baseline: baseline(),
    frequency: 2,
    maxSingleSessionShare: 0.5,
    performanceTrend: "stable",
    recoveryStatus: "good",
    trainingLoadState: "green",
    recoveryLoggingCompleteness: 1,
    ...overrides,
  };
}

describe("computeMuscleRecommendation", () => {
  it("recommends MAINTAIN when volume/performance/recovery all look reasonable", () => {
    const result = computeMuscleRecommendation(
      input({ performanceTrend: "improving" }),
    );

    expect(result.recommendation).toBe("MAINTAIN");
    expect(result.confidence).toBe("high");
  });

  it("recommends INCREASE_GRADUALLY when volume is stable, history is sufficient, performance has plateaued and recovery is good", () => {
    const result = computeMuscleRecommendation(
      input({ performanceTrend: "stable", recoveryStatus: "ready", trainingLoadState: "green" }),
    );

    expect(result.recommendation).toBe("INCREASE_GRADUALLY");
    expect(result.evidenceRefs.length).toBeGreaterThan(0);
  });

  it("does NOT recommend INCREASE_GRADUALLY when training load is elevated even if performance plateaued", () => {
    const result = computeMuscleRecommendation(
      input({ performanceTrend: "stable", trainingLoadState: "red", recoveryStatus: "priority" }),
    );

    expect(result.recommendation).not.toBe("INCREASE_GRADUALLY");
    expect(result.recommendation).toBe("REDUCE_SLIGHTLY");
  });

  it("recommends REDUCE_SLIGHTLY after a large volume increase combined with declining performance", () => {
    const result = computeMuscleRecommendation(
      input({
        currentEffectiveVolume: 20,
        previousVolume: 14,
        changePercent: 42.8,
        performanceTrend: "declining",
      }),
    );

    expect(result.recommendation).toBe("REDUCE_SLIGHTLY");
  });

  it("recommends REDUCE_SLIGHTLY after a large volume increase combined with poor recovery, even if performance is fine", () => {
    const result = computeMuscleRecommendation(
      input({
        currentEffectiveVolume: 20,
        previousVolume: 14,
        changePercent: 42.8,
        performanceTrend: "improving",
        recoveryStatus: "priority",
      }),
    );

    expect(result.recommendation).toBe("REDUCE_SLIGHTLY");
  });

  it("recommends MONITOR when volume is above the personal range but performance/recovery remain acceptable", () => {
    const result = computeMuscleRecommendation(
      input({
        currentEffectiveVolume: 16,
        previousVolume: 15.5,
        changePercent: 3.2,
        baseline: baseline({ recentRange: { min: 10, max: 14 } }),
        performanceTrend: "improving",
        recoveryStatus: "good",
      }),
    );

    expect(result.recommendation).toBe("MONITOR");
  });

  it("recommends REDISTRIBUTE when almost all weekly volume for a muscle came from a single session", () => {
    const result = computeMuscleRecommendation(
      input({ maxSingleSessionShare: 0.9, frequency: 1 }),
    );

    expect(result.recommendation).toBe("REDISTRIBUTE");
  });

  it("returns INSUFFICIENT_DATA when there is no meaningful history to compare against", () => {
    const result = computeMuscleRecommendation(
      input({
        baseline: baseline({ sampleWeeks: 0, typicalWeeklyVolume: null, recentRange: null }),
        previousVolume: null,
        changePercent: null,
        performanceTrend: "insufficient_data",
        recoveryStatus: null,
        trainingLoadState: null,
        recoveryLoggingCompleteness: null,
      }),
    );

    expect(result.recommendation).toBe("INSUFFICIENT_DATA");
    expect(result.confidence).toBe("low");
  });

  it("lowers confidence when history and recovery logging are sparse", () => {
    const richHistory = computeMuscleRecommendation(input());
    const sparseHistory = computeMuscleRecommendation(
      input({
        baseline: baseline({ sampleWeeks: 1 }),
        performanceTrend: "insufficient_data",
        recoveryStatus: null,
        recoveryLoggingCompleteness: null,
        changePercent: null,
        previousVolume: null,
      }),
    );

    expect(richHistory.confidence).toBe("high");
    expect(sparseHistory.confidence).toBe("low");
  });

  it("never invents a recommendation category outside the fixed enum", () => {
    const categories = [
      "MAINTAIN",
      "INCREASE_GRADUALLY",
      "REDUCE_SLIGHTLY",
      "REDISTRIBUTE",
      "MONITOR",
      "INSUFFICIENT_DATA",
    ];

    const result = computeMuscleRecommendation(input());

    expect(categories).toContain(result.recommendation);
  });
});
