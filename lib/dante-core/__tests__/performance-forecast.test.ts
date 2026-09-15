import { describe, expect, it } from "vitest";

import { buildPerformanceForecast } from "@/lib/dante-core/performance-forecast";
import type { AthleteState } from "@/lib/athlete-state/types";

function baseAthleteState(overrides: Partial<AthleteState> = {}): AthleteState {
  return {
    generatedAt: "2026-09-13T00:00:00.000Z",
    dataWindow: { startDate: "2026-08-01", endDate: "2026-09-13", weeksOfHistory: 6 },
    profile: {
      goal: null,
      experience: null,
      trainingFrequency: null,
      priorityMuscles: [],
      heightCm: null,
      weightKg: null,
      sessionDurationMinutes: null,
      availableEquipment: [],
      physicalLimitations: null,
    },
    training: { hasAnyLoggedData: true, muscles: [], exerciseNames: {} },
    recovery: {
      available: true,
      score: 80,
      status: "Good",
      trainingLoadState: "green",
      sevenDayAverageScore: 75,
      sleepHours: 7.5,
      stress: 60,
      soreness: 70,
      fatigue: 65,
      painFlag: false,
      recoveryStatusCode: "good",
    },
    nutrition: {
      available: true,
      calorieTarget: 2600,
      proteinTargetGrams: 180,
      carbsTargetGrams: 280,
      fatTargetGrams: 80,
    },
    setVision: {
      available: false,
      latestExercise: null,
      analysesLast30Days: 0,
      romConsistencyDeviation: null,
      tempoConsistencyDeviation: null,
    },
    wearable: {
      available: false,
      isDemo: false,
      providerLabel: null,
      latestDay: null,
      connectionStatus: "not_connected",
      daysSinceLastData: null,
    },
    derived: {
      baselineDeviations: {
        sleep: { current: 7.5, baseline: 7, delta: 0.5, sampleCount: 10, confidence: 0.7 },
        recoveryScore: { current: 80, baseline: 70, delta: 10, sampleCount: 10, confidence: 0.7 },
        trainingLoad: { current: 20, baseline: 18, delta: 2, sampleCount: 6, confidence: 0.5 },
      },
      muscleRecoveryMap: [],
      overallConfidence: 0.7,
      missingData: [],
    },
    dataFreshness: {
      recovery: { status: "current", lastUpdated: "2026-09-13T00:00:00.000Z", humanReadable: "Updated 1h ago" },
      nutrition: { status: "current", lastUpdated: "2026-09-13T00:00:00.000Z", humanReadable: "Updated 2h ago" },
      training: { status: "current", lastUpdated: "2026-09-13T00:00:00.000Z", humanReadable: "Updated 1h ago" },
      setVision: { status: "missing", lastUpdated: null, humanReadable: "No recent sample" },
      bodyweight: { status: "missing", lastUpdated: null, humanReadable: "No recent sample" },
    },
    progress: { status: "not_yet_implemented" },
    ...overrides,
  };
}

describe("buildPerformanceForecast", () => {
  it("never reports a confidence above the hard cap, even with abundant, perfectly-aligned data", () => {
    const state = baseAthleteState({
      derived: {
        ...baseAthleteState().derived,
        baselineDeviations: {
          sleep: { current: 8, baseline: 8, delta: 0, sampleCount: 30, confidence: 1 },
          recoveryScore: { current: 90, baseline: 70, delta: 20, sampleCount: 30, confidence: 1 },
          trainingLoad: { current: 10, baseline: 18, delta: -8, sampleCount: 30, confidence: 1 },
        },
      },
    });

    const forecast = buildPerformanceForecast(state);

    expect(forecast.decision.nextSessionConfidencePercent).toBeLessThanOrEqual(85);
  });

  it("reports unknown/insufficient-data when the personal baseline has too few samples", () => {
    const state = baseAthleteState({
      derived: {
        ...baseAthleteState().derived,
        baselineDeviations: {
          sleep: { current: 7.5, baseline: null, delta: null, sampleCount: 2, confidence: 0 },
          recoveryScore: { current: 80, baseline: null, delta: null, sampleCount: 2, confidence: 0 },
          trainingLoad: { current: 20, baseline: null, delta: null, sampleCount: 0, confidence: 0 },
        },
      },
    });

    const forecast = buildPerformanceForecast(state);

    expect(forecast.decision.expectedReadinessWindow).toBe("unknown");
    expect(forecast.decision.nextSessionConfidencePercent).toBe(0);
    expect(forecast.decision.limitations.length).toBeGreaterThan(0);
  });

  it("a pain/illness flag forces a conservative low-readiness forecast regardless of otherwise-strong data", () => {
    const state = baseAthleteState({ recovery: { ...baseAthleteState().recovery, painFlag: true } });

    const forecast = buildPerformanceForecast(state);

    expect(forecast.decision.expectedReadinessWindow).toBe("low");
    expect(forecast.decision.expectedSessionDifficulty).toBe("harder_than_usual");
    expect(forecast.decision.limitations.some((line) => line.toLowerCase().includes("pain"))).toBe(true);
  });

  it("forecasts a high readiness window when today's recovery is well above personal baseline", () => {
    const state = baseAthleteState({
      derived: {
        ...baseAthleteState().derived,
        baselineDeviations: {
          ...baseAthleteState().derived.baselineDeviations,
          recoveryScore: { current: 90, baseline: 70, delta: 20, sampleCount: 14, confidence: 0.9 },
        },
      },
    });

    const forecast = buildPerformanceForecast(state);

    expect(forecast.decision.expectedReadinessWindow).toBe("high");
  });

  it("forecasts a low readiness window when today's recovery is well below personal baseline", () => {
    const state = baseAthleteState({
      derived: {
        ...baseAthleteState().derived,
        baselineDeviations: {
          ...baseAthleteState().derived.baselineDeviations,
          recoveryScore: { current: 55, baseline: 70, delta: -15, sampleCount: 14, confidence: 0.9 },
        },
      },
    });

    const forecast = buildPerformanceForecast(state);

    expect(forecast.decision.expectedReadinessWindow).toBe("low");
    expect(forecast.decision.expectedSessionDifficulty).toBe("harder_than_usual");
  });

  it("always includes a limitation disclaiming this as a rule-based, non-medical estimate", () => {
    const forecast = buildPerformanceForecast(baseAthleteState());

    expect(
      forecast.decision.limitations.some((line) => line.toLowerCase().includes("rule-based")),
    ).toBe(true);
  });
});
