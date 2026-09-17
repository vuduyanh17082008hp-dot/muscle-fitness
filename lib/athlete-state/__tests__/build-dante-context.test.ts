import { describe, expect, it } from "vitest";

import { buildDanteContext } from "../build-dante-context";
import type { AthleteState } from "../types";
import { EMPTY_DANTE_MEMORY } from "@/lib/dante-core/memory";

function baseAthleteState(overrides: Partial<AthleteState> = {}): AthleteState {
  return {
    generatedAt: "2026-09-13T00:00:00.000Z",
    dataWindow: { startDate: "2026-08-01", endDate: "2026-09-13", weeksOfHistory: 6 },
    profile: {
      goal: "hypertrophy",
      experience: "intermediate",
      trainingFrequency: 4,
      priorityMuscles: ["chest"],
      heightCm: 178,
      weightKg: 80,
      sessionDurationMinutes: 60,
      availableEquipment: ["barbell"],
      physicalLimitations: null,
    },
    training: { hasAnyLoggedData: true, muscles: [], exerciseNames: {} },
    recovery: {
      available: true,
      score: 78,
      status: "Good",
      trainingLoadState: "green",
      sevenDayAverageScore: 74,
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
        recoveryScore: { current: 78, baseline: 70, delta: 8, sampleCount: 10, confidence: 0.7 },
        trainingLoad: { current: 20, baseline: 18, delta: 2, sampleCount: 6, confidence: 0.5 },
      },
      muscleRecoveryMap: [
        {
          muscle: "chest",
          muscleLabel: "Chest",
          recoveryState: "well_recovered",
          score: 90,
          confidence: 0.8,
          drivers: ["3 days since last trained"],
        },
        {
          muscle: "hamstrings",
          muscleLabel: "Hamstrings",
          recoveryState: "needs_recovery",
          score: 30,
          confidence: 0.6,
          drivers: ["Trained today"],
        },
      ],
      overallConfidence: 0.65,
      missingData: [],
    },
    dataFreshness: {
      recovery: { status: "current", lastUpdated: "2026-09-13T00:00:00.000Z", humanReadable: "Updated 1h ago" },
      nutrition: { status: "current", lastUpdated: "2026-09-13T00:00:00.000Z", humanReadable: "Updated 2h ago" },
      training: { status: "stale", lastUpdated: "2026-09-01T00:00:00.000Z", humanReadable: "Updated 12d ago" },
      setVision: { status: "missing", lastUpdated: null, humanReadable: "No recent sample" },
      bodyweight: { status: "stale", lastUpdated: "2026-08-01T00:00:00.000Z", humanReadable: "Updated 43d ago" },
    },
    progress: { status: "not_yet_implemented" },
    ...overrides,
  };
}

describe("buildDanteContext", () => {
  it("never includes a raw database row shape — output is the normalized DanteContext only", () => {
    const context = buildDanteContext(baseAthleteState(), EMPTY_DANTE_MEMORY, null);
    // Spot-check: no leaking of snake_case DB column names anywhere in the output.
    const json = JSON.stringify(context);
    expect(json).not.toMatch(/user_id|training_days|calories_target/);
  });

  it("filters the muscle recovery map down to non-well-recovered muscles only, to keep token footprint low", () => {
    const context = buildDanteContext(baseAthleteState(), EMPTY_DANTE_MEMORY, null, "training");
    expect(context.notableMuscleRecovery).toHaveLength(1);
    expect(context.notableMuscleRecovery?.[0].muscle).toBe("hamstrings");
  });

  it("omits recovery-specific detail when focus is training", () => {
    const context = buildDanteContext(baseAthleteState(), EMPTY_DANTE_MEMORY, null, "training");
    expect(context.currentState).toBeNull();
    expect(context.baselineDeviations).toBeNull();
  });

  it("includes recovery detail when focus is recovery or general", () => {
    const recovery = buildDanteContext(baseAthleteState(), EMPTY_DANTE_MEMORY, null, "recovery");
    const general = buildDanteContext(baseAthleteState(), EMPTY_DANTE_MEMORY, null, "general");
    expect(recovery.currentState?.readinessScore).toBe(78);
    expect(general.currentState?.readinessScore).toBe(78);
  });

  it("passes confidence and missingData straight through from the Digital Twin — never recomputes them", () => {
    const state = baseAthleteState({
      derived: {
        baselineDeviations: baseAthleteState().derived.baselineDeviations,
        muscleRecoveryMap: [],
        overallConfidence: 0.42,
        missingData: ["setVision", "nutrition"],
      },
    });
    const context = buildDanteContext(state, EMPTY_DANTE_MEMORY, null);
    expect(context.confidence).toBe(0.42);
    expect(context.missingData).toEqual(["setVision", "nutrition"]);
  });

  it("carries user memory through unchanged", () => {
    const memory = {
      preferredExercises: ["Bench Press"],
      dislikedExercises: [],
      weakPointPriorities: ["chest"],
      coachingPreference: "direct" as const,
      updatedAt: "2026-09-01T00:00:00.000Z",
    };
    const context = buildDanteContext(baseAthleteState(), memory, null);
    expect(context.memory).toEqual(memory);
  });

  it("is a pure function — identical input produces identical output", () => {
    const state = baseAthleteState();
    const a = buildDanteContext(state, EMPTY_DANTE_MEMORY, null);
    const b = buildDanteContext(state, EMPTY_DANTE_MEMORY, null);
    expect(a).toEqual(b);
  });

  it("handles a brand-new user (all sections unavailable) without throwing", () => {
    const state = baseAthleteState({
      training: { hasAnyLoggedData: false, muscles: [], exerciseNames: {} },
      recovery: {
        available: false,
        score: null,
        status: null,
        trainingLoadState: null,
        sevenDayAverageScore: null,
        sleepHours: null,
        stress: null,
        soreness: null,
        fatigue: null,
        painFlag: false,
        recoveryStatusCode: null,
      },
      nutrition: {
        available: false,
        calorieTarget: null,
        proteinTargetGrams: null,
        carbsTargetGrams: null,
        fatTargetGrams: null,
      },
      derived: {
        baselineDeviations: {
          sleep: { current: null, baseline: null, delta: null, sampleCount: 0, confidence: 0 },
          recoveryScore: { current: null, baseline: null, delta: null, sampleCount: 0, confidence: 0 },
          trainingLoad: { current: 0, baseline: null, delta: null, sampleCount: 0, confidence: 0 },
        },
        muscleRecoveryMap: [],
        overallConfidence: 0,
        missingData: ["recovery", "nutrition", "training", "setVision"],
      },
    });

    const context = buildDanteContext(state, EMPTY_DANTE_MEMORY, null);
    expect(context.currentState?.readinessScore).toBeNull();
    expect(context.confidence).toBe(0);
    expect(context.missingData).toContain("training");
  });
});
