import { describe, expect, it } from "vitest";
import { evaluateReadiness } from "@/lib/dante-core/readiness-engine";
import type { ReadinessEngineInput } from "@/lib/dante-core/types";
import type { RecoveryScoreResult } from "@/lib/recovery/types";

function recoveryScore(
  overrides: Partial<RecoveryScoreResult> = {},
): RecoveryScoreResult {
  return {
    score: 80,
    status: "good",
    drivers: [
      { key: "sleep", label: "Sleep", score: 80, weight: 0.3, available: true },
      { key: "stress", label: "Stress", score: 80, weight: 0.2, available: true },
      { key: "fatigue", label: "Fatigue", score: 80, weight: 0.2, available: true },
      { key: "soreness", label: "Soreness", score: 80, weight: 0.15, available: true },
      {
        key: "moodReadiness",
        label: "Mood & readiness",
        score: 80,
        weight: 0.15,
        available: true,
      },
    ],
    missingInputs: [],
    baseline: null,
    ...overrides,
  };
}

function input(overrides: Partial<ReadinessEngineInput> = {}): ReadinessEngineInput {
  return {
    recoveryScore: recoveryScore(),
    trainingLoad: {
      state: "green",
      reason: "normal",
      sessionsLast7Days: 3,
      restDaysLast7Days: 2,
      averageSessionRpe: 7,
      totalVolumeKgLast7Days: 5000,
      lastSessionDaysAgo: 1,
    },
    muscles: [],
    now: new Date("2026-01-10T12:00:00Z"),
    ...overrides,
  };
}

describe("evaluateReadiness", () => {
  it("returns a high readiness score and low systemic fatigue when everything looks good", () => {
    const result = evaluateReadiness(input());

    expect(result.readinessScore).toBe(80);
    expect(result.systemicFatigue).toBe("low");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("degrades gracefully with no recovery check-in and no training load data", () => {
    const result = evaluateReadiness(
      input({
        recoveryScore: recoveryScore({
          score: null,
          status: null,
          drivers: recoveryScore().drivers.map((d) => ({ ...d, available: false, score: 0 })),
          missingInputs: ["sleep", "stress", "fatigue", "soreness", "mood/readiness"],
        }),
        trainingLoad: null,
      }),
    );

    expect(result.readinessScore).toBeNull();
    expect(result.systemicFatigue).toBe("unknown");
    expect(result.confidence).toBe(0);
  });

  it("falls back to a training-load-only score when there is no check-in", () => {
    const result = evaluateReadiness(
      input({
        recoveryScore: recoveryScore({ score: null, status: null }),
        trainingLoad: {
          state: "amber",
          reason: "elevated",
          sessionsLast7Days: 5,
          restDaysLast7Days: 0,
          averageSessionRpe: 8,
          totalVolumeKgLast7Days: 9000,
          lastSessionDaysAgo: 0,
        },
      }),
    );

    expect(result.readinessScore).toBe(50);
    expect(result.method).toContain("coarse fallback");
  });

  it("flags systemic fatigue as high when recovery is a priority", () => {
    const result = evaluateReadiness(
      input({ recoveryScore: recoveryScore({ score: 40, status: "priority" }) }),
    );

    expect(result.systemicFatigue).toBe("high");
  });

  it("estimates per-muscle recovery from time since last trained", () => {
    const result = evaluateReadiness(
      input({
        now: new Date("2026-01-10T12:00:00Z"),
        muscles: [
          {
            muscle: "chest",
            lastTrainedDate: "2026-01-08", // 2 days ago, large muscle window = 72h
            recentEffectiveSets: 12,
            typicalWeeklyVolume: 12,
          },
          {
            muscle: "biceps",
            lastTrainedDate: null,
            recentEffectiveSets: null,
            typicalWeeklyVolume: null,
          },
        ],
      }),
    );

    const chest = result.muscleRecovery.find((m) => m.muscle === "chest");
    const biceps = result.muscleRecovery.find((m) => m.muscle === "biceps");

    expect(chest?.basis).toBe("time_since_trained");
    expect(chest?.recoveryPercent).not.toBeNull();
    expect(chest!.recoveryPercent!).toBeGreaterThan(0);
    expect(chest!.recoveryPercent!).toBeLessThanOrEqual(100);

    expect(biceps?.basis).toBe("no_training_history");
    expect(biceps?.recoveryPercent).toBeNull();
  });

  it("flags a limiting factor when a muscle's estimated recovery is low", () => {
    const result = evaluateReadiness(
      input({
        now: new Date("2026-01-10T12:00:00Z"),
        muscles: [
          {
            muscle: "quadriceps",
            lastTrainedDate: "2026-01-10", // trained today, minimal recovery elapsed
            recentEffectiveSets: 16,
            typicalWeeklyVolume: 10,
          },
        ],
      }),
    );

    expect(result.limitingFactors).toContain("quadriceps_recovery_low");
  });

  it("never fabricates a muscle recovery percent when the date is malformed", () => {
    const result = evaluateReadiness(
      input({
        muscles: [
          {
            muscle: "triceps",
            lastTrainedDate: "not-a-date",
            recentEffectiveSets: null,
            typicalWeeklyVolume: null,
          },
        ],
      }),
    );

    expect(result.muscleRecovery[0].recoveryPercent).toBeNull();
  });
});
