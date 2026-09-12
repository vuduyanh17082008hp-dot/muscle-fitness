import { describe, expect, it } from "vitest";
import { generateRecommendation } from "@/lib/dante-core/autoregulation-engine";
import type { AutoregulationInput, ReadinessResult } from "@/lib/dante-core/types";

function readiness(overrides: Partial<ReadinessResult> = {}): ReadinessResult {
  return {
    readinessScore: 80,
    systemicFatigue: "low",
    muscleRecovery: [],
    limitingFactors: [],
    confidence: 0.9,
    method: "test",
    ...overrides,
  };
}

function input(overrides: Partial<AutoregulationInput> = {}): AutoregulationInput {
  return {
    exerciseName: "Bench Press",
    planned: {
      targetSets: 4,
      targetRepMin: 6,
      targetRepMax: 8,
      targetLoadKg: 85,
      targetRir: 2,
    },
    readiness: readiness(),
    relevantMuscles: ["chest", "triceps"],
    trend: null,
    setVision: null,
    recentPainFlag: false,
    ...overrides,
  };
}

describe("generateRecommendation (autoregulation)", () => {
  it("proceeds as planned when everything looks good", () => {
    const result = generateRecommendation(input());

    expect(result.decision).toBe("proceed_as_planned");
    expect(result.recommendedLoadKg).toBe(85);
    expect(result.recommendedSets).toBe(4);
    expect(result.gated).toBe(false);
  });

  it("always recommends rest when a pain flag is present, regardless of other signals", () => {
    const result = generateRecommendation(
      input({
        recentPainFlag: true,
        readiness: readiness({ systemicFatigue: "low" }),
      }),
    );

    expect(result.decision).toBe("rest_recommended");
    expect(result.sessionRecommendation).toBe("rest");
    expect(result.gated).toBe(true);
    expect(result.confidence).toBe("high");
  });

  it("reduces load and volume when sleep-poor + low chest recovery + high velocity loss stack up", () => {
    const result = generateRecommendation(
      input({
        readiness: readiness({
          systemicFatigue: "moderate",
          limitingFactors: ["sleep_below_baseline"],
          muscleRecovery: [
            {
              muscle: "chest",
              recoveryPercent: 58,
              daysSinceTrained: 1,
              basis: "time_since_trained",
            },
            {
              muscle: "triceps",
              recoveryPercent: 70,
              daysSinceTrained: 1,
              basis: "time_since_trained",
            },
          ],
        }),
        setVision: {
          velocityLoss: 0.31,
          velocityCalibrated: false,
          romConsistency: 0.9,
          confidence: 0.8,
        },
      }),
    );

    expect(result.decision).toBe("reduce_load_and_volume");
    expect(result.recommendedLoadKg).toBeLessThan(85);
    expect(result.recommendedSets).toBeLessThan(4);
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.reasons.some((r) => r.toLowerCase().includes("velocity"))).toBe(true);
  });

  it("never scales a null (bodyweight) load", () => {
    const result = generateRecommendation(
      input({
        planned: {
          targetSets: 3,
          targetRepMin: 10,
          targetRepMax: 15,
          targetLoadKg: null,
          targetRir: 1,
        },
        readiness: readiness({ systemicFatigue: "high" }),
      }),
    );

    expect(result.plannedLoadKg).toBeNull();
    expect(result.recommendedLoadKg).toBeNull();
    expect(result.loadAdjustmentPercent).toBeNull();
  });

  it("suggests terminating the exercise when velocity loss is very high", () => {
    const result = generateRecommendation(
      input({
        setVision: {
          velocityLoss: 0.4,
          velocityCalibrated: true,
          romConsistency: 0.85,
          confidence: 0.9,
        },
      }),
    );

    expect(result.reasons.some((r) => r.toLowerCase().includes("terminating"))).toBe(true);
  });

  it("degrades gracefully to proceed_as_planned with a documented reason when no signals are available", () => {
    const result = generateRecommendation(
      input({ readiness: readiness({ systemicFatigue: "unknown", confidence: 0 }) }),
    );

    expect(result.decision).toBe("proceed_as_planned");
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("recommends a full deload when every negative signal stacks at once", () => {
    const result = generateRecommendation(
      input({
        readiness: readiness({
          systemicFatigue: "high",
          muscleRecovery: [
            { muscle: "chest", recoveryPercent: 20, daysSinceTrained: 0, basis: "time_since_trained" },
          ],
        }),
        trend: { trend: "declining", changePercent: -8, sampleSize: 5, setVisionNote: null },
        setVision: {
          velocityLoss: 0.3,
          velocityCalibrated: true,
          romConsistency: 0.7,
          confidence: 0.9,
        },
      }),
    );

    expect(result.decision).toBe("deload_session");
    expect(result.sessionRecommendation).toBe("deload");
  });
});
