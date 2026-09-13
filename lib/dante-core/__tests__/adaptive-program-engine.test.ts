import { describe, expect, it } from "vitest";

import { buildAdaptiveProgram } from "@/lib/dante-core/adaptive-program-engine";
import type { AthleteState } from "@/lib/athlete-state/types";
import type { LastSessionForExercise, TrainingContext } from "@/lib/training/load-training-context";

function baseAthleteState(overrides: Partial<AthleteState["recovery"]> = {}): AthleteState {
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
      ...overrides,
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
  };
}

function lastSession(overrides: Partial<LastSessionForExercise> = {}): LastSessionForExercise {
  return {
    sessionExerciseId: "session-exercise-1",
    targetRepMin: 6,
    targetRepMax: 8,
    targetRir: 2,
    completedAt: "2026-09-10T00:00:00.000Z",
    sets: [
      { weightKg: 80, reps: 8, rir: 2, completed: true },
      { weightKg: 80, reps: 8, rir: 2, completed: true },
      { weightKg: 80, reps: 8, rir: 2, completed: true },
    ],
    ...overrides,
  };
}

function trainingContext(lastSessionByExercise: Map<string, LastSessionForExercise>): TrainingContext {
  return {
    dataWindow: { startDate: "2026-08-01", endDate: "2026-09-13", weeksOfHistory: 6 },
    exercisesById: new Map([
      ["exercise-1", { id: "exercise-1", slug: "bench-press", name: "Bench Press", primaryMuscle: "chest", secondaryMuscles: [], ownerId: null }],
    ]),
    contributionsByExercise: new Map(),
    weeklyAnalytics: new Map(),
    baseline: new Map(),
    currentWeekSets: [],
    lastSessionByExercise,
    e1RmHistoryByExercise: new Map(),
    hasAnyLoggedData: true,
  };
}

describe("buildAdaptiveProgram", () => {
  it("suggests a load increase with high confidence when all sets hit the top of the rep range with 3+ sets logged", () => {
    const state = baseAthleteState();
    const context = trainingContext(new Map([["exercise-1", lastSession()]]));

    const [result] = buildAdaptiveProgram(state, context);

    expect(result.decision.action).toBe("INCREASE_LOAD");
    expect(result.decision.suggestedWeightKg).toBeGreaterThan(80);
    expect(result.confidence).toBe("high");
  });

  it("requires sufficient evidence — an exercise with zero completed sets produces no adaptation at all", () => {
    const state = baseAthleteState();
    const context = trainingContext(
      new Map([["exercise-1", lastSession({ sets: [{ weightKg: null, reps: null, rir: null, completed: false }] })]]),
    );

    const results = buildAdaptiveProgram(state, context);

    expect(results).toHaveLength(0);
  });

  it("still surfaces a decision from a single logged set, but marks it low-confidence", () => {
    const state = baseAthleteState();
    const context = trainingContext(
      new Map([["exercise-1", lastSession({ sets: [{ weightKg: 80, reps: 8, rir: 2, completed: true }] })]]),
    );

    const [result] = buildAdaptiveProgram(state, context);

    expect(result.confidence).toBe("low");
    expect(result.why.some((line) => line.includes("single logged set"))).toBe(true);
  });

  it("a pain flag holds progression regardless of strong performance, and is reported with high (certain) confidence", () => {
    const state = baseAthleteState({ painFlag: true });
    const context = trainingContext(new Map([["exercise-1", lastSession()]]));

    const [result] = buildAdaptiveProgram(state, context);

    expect(result.decision.action).toBe("HOLD");
    expect(result.decision.gated).toBe(true);
    expect(result.confidence).toBe("high");
  });

  it("red training load holds progression even with a perfect last session", () => {
    const state = baseAthleteState({ trainingLoadState: "red" });
    const context = trainingContext(new Map([["exercise-1", lastSession()]]));

    const [result] = buildAdaptiveProgram(state, context);

    expect(result.decision.action).toBe("HOLD");
    expect(result.decision.gated).toBe(true);
  });
});
