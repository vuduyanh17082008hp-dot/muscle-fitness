import { describe, expect, it } from "vitest";

import { buildMuscleRecoveryMap } from "../muscle-recovery-map";
import type { MuscleRecoveryEstimate } from "../types";
import type { CanonicalMuscle } from "@/lib/training/muscle-taxonomy";
import type { PerformanceTrend } from "@/lib/training/performance";

function estimate(overrides: Partial<MuscleRecoveryEstimate> = {}): MuscleRecoveryEstimate {
  return {
    muscle: "chest",
    recoveryPercent: 85,
    daysSinceTrained: 3,
    basis: "time_since_trained",
    ...overrides,
  };
}

describe("buildMuscleRecoveryMap", () => {
  it("classifies recovery state from score thresholds", () => {
    const [wellRecovered] = buildMuscleRecoveryMap({
      muscleRecovery: [estimate({ recoveryPercent: 90 })],
      systemicFatigue: "low",
      sorenessScoreToday: null,
      performanceTrendByMuscle: new Map(),
    });
    expect(wellRecovered.recoveryState).toBe("well_recovered");

    const [recovering] = buildMuscleRecoveryMap({
      muscleRecovery: [estimate({ recoveryPercent: 60 })],
      systemicFatigue: "low",
      sorenessScoreToday: null,
      performanceTrendByMuscle: new Map(),
    });
    expect(recovering.recoveryState).toBe("recovering");

    const [needsRecovery] = buildMuscleRecoveryMap({
      muscleRecovery: [estimate({ recoveryPercent: 20 })],
      systemicFatigue: "low",
      sorenessScoreToday: null,
      performanceTrendByMuscle: new Map(),
    });
    expect(needsRecovery.recoveryState).toBe("needs_recovery");
  });

  it("never fabricates a score — no training history stays insufficient_data with a null score", () => {
    const [entry] = buildMuscleRecoveryMap({
      muscleRecovery: [
        estimate({ recoveryPercent: null, daysSinceTrained: null, basis: "no_training_history" }),
      ],
      systemicFatigue: "unknown",
      sorenessScoreToday: null,
      performanceTrendByMuscle: new Map(),
    });

    expect(entry.recoveryState).toBe("insufficient_data");
    expect(entry.score).toBeNull();
    expect(entry.drivers).toContain("No logged training history for this muscle yet");
  });

  it("surfaces high soreness and low systemic fatigue as explicit drivers", () => {
    const [entry] = buildMuscleRecoveryMap({
      muscleRecovery: [estimate()],
      systemicFatigue: "high",
      sorenessScoreToday: 30,
      performanceTrendByMuscle: new Map(),
    });

    expect(entry.drivers).toContain("High soreness reported today (whole-body check-in)");
    expect(entry.drivers).toContain("Overall recovery is currently low");
  });

  it("surfaces a declining performance trend as a driver", () => {
    const [entry] = buildMuscleRecoveryMap({
      muscleRecovery: [estimate()],
      systemicFatigue: "low",
      sorenessScoreToday: 80,
      performanceTrendByMuscle: new Map<CanonicalMuscle, PerformanceTrend>([["chest", "declining"]]),
    });

    expect(entry.drivers.some((d) => d.includes("declining"))).toBe(true);
  });

  it("always has at least one driver, even with total insufficient data", () => {
    const [entry] = buildMuscleRecoveryMap({
      muscleRecovery: [estimate({ recoveryPercent: null, daysSinceTrained: null, basis: "no_recent_training_data" })],
      systemicFatigue: "unknown",
      sorenessScoreToday: null,
      performanceTrendByMuscle: new Map(),
    });

    expect(entry.drivers.length).toBeGreaterThan(0);
    expect(entry.confidence).toBe(0);
  });

  it("confidence increases as more signals are actually available", () => {
    const sparse = buildMuscleRecoveryMap({
      muscleRecovery: [estimate()],
      systemicFatigue: "unknown",
      sorenessScoreToday: null,
      performanceTrendByMuscle: new Map(),
    })[0];

    const rich = buildMuscleRecoveryMap({
      muscleRecovery: [estimate()],
      systemicFatigue: "low",
      sorenessScoreToday: 80,
      performanceTrendByMuscle: new Map<CanonicalMuscle, PerformanceTrend>([["chest", "stable"]]),
    })[0];

    expect(rich.confidence).toBeGreaterThan(sparse.confidence);
  });

  it("is deterministic for identical input", () => {
    const input = {
      muscleRecovery: [estimate()],
      systemicFatigue: "moderate" as const,
      sorenessScoreToday: 55,
      performanceTrendByMuscle: new Map<CanonicalMuscle, PerformanceTrend>([["chest", "improving"]]),
    };

    expect(buildMuscleRecoveryMap(input)).toEqual(buildMuscleRecoveryMap(input));
  });
});
