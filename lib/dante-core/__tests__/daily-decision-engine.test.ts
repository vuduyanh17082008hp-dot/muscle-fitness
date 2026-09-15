import { describe, expect, it } from "vitest";

import { buildDailyDecision } from "@/lib/dante-core/daily-decision-engine";
import type { AthleteState } from "@/lib/athlete-state/types";
import type { TrainingContext } from "@/lib/training/load-training-context";
import type { TodaySession, TodaySessionExercise } from "@/lib/training/load-today-session";
import type { MuscleRecoveryMapEntry } from "@/lib/dante-core/muscle-recovery-map";
import type { ExerciseMuscleContribution } from "@/lib/training/exercise-muscle-map";

function muscleEntry(overrides: Partial<MuscleRecoveryMapEntry> = {}): MuscleRecoveryMapEntry {
  return {
    muscle: "chest",
    muscleLabel: "Chest",
    recoveryState: "well_recovered",
    score: 90,
    confidence: 0.8,
    drivers: ["3 days since last trained"],
    ...overrides,
  };
}

function baseAthleteState(overrides: Partial<AthleteState> = {}): AthleteState {
  return {
    generatedAt: "2026-09-13T00:00:00.000Z",
    dataWindow: { startDate: "2026-08-01", endDate: "2026-09-13", weeksOfHistory: 6 },
    profile: {
      goal: "hypertrophy",
      experience: "intermediate",
      trainingFrequency: 4,
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
      muscleRecoveryMap: [muscleEntry()],
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

function baseTrainingContext(
  contributionsByExercise: Map<string, ExerciseMuscleContribution[]> = new Map(),
): TrainingContext {
  return {
    dataWindow: { startDate: "2026-08-01", endDate: "2026-09-13", weeksOfHistory: 6 },
    exercisesById: new Map(),
    contributionsByExercise,
    weeklyAnalytics: new Map(),
    baseline: new Map(),
    currentWeekSets: [],
    lastSessionByExercise: new Map(),
    e1RmHistoryByExercise: new Map(),
    hasAnyLoggedData: true,
  };
}

function exercise(overrides: Partial<TodaySessionExercise> = {}): TodaySessionExercise {
  return {
    sessionExerciseId: "session-exercise-1",
    exerciseId: "exercise-1",
    exerciseName: "Bench Press",
    targetSets: 4,
    repMin: 6,
    repMax: 8,
    restSeconds: 90,
    primaryMuscle: null,
    isSkipped: false,
    ...overrides,
  };
}

function session(exercises: TodaySessionExercise[]): TodaySession {
  return {
    id: "session-1",
    name: "Push Day",
    scheduledFor: null,
    durationMinutes: null,
    sessionState: null,
    exercises,
  };
}

function contributionsFor(exerciseId: string, muscle: string): Map<string, ExerciseMuscleContribution[]> {
  return new Map([
    [
      exerciseId,
      [{ muscle: muscle as never, role: "primary", contribution: 1, mappingVersion: 1, source: "system" }],
    ],
  ]);
}

describe("buildDailyDecision", () => {
  it("proceeds as planned when today's exercises target well-recovered muscles", () => {
    const state = baseAthleteState({
      derived: {
        ...baseAthleteState().derived,
        muscleRecoveryMap: [muscleEntry({ muscle: "chest", score: 90, confidence: 0.8 })],
      },
    });
    const context = baseTrainingContext(contributionsFor("exercise-1", "chest"));
    const today = session([exercise()]);

    const { decision, proposedActions } = buildDailyDecision(state, context, today);

    expect(decision.decision.decisionCode).toBe("proceed_as_planned");
    expect(proposedActions).toHaveLength(0);
  });

  it("proposes postponing an exercise when its primary muscle recovery is below 30 with sufficient confidence", () => {
    const state = baseAthleteState({
      derived: {
        ...baseAthleteState().derived,
        muscleRecoveryMap: [muscleEntry({ muscle: "quadriceps", score: 20, confidence: 0.8 })],
      },
    });
    const context = baseTrainingContext(contributionsFor("exercise-1", "quadriceps"));
    const today = session([exercise({ exerciseName: "Leg Press" })]);

    const { decision, proposedActions } = buildDailyDecision(state, context, today);

    expect(decision.decision.decisionCode).toBe("modify_session");
    expect(proposedActions).toHaveLength(1);
    expect(proposedActions[0].payload.type).toBe("postpone_exercise");
  });

  it("proposes a volume reduction when recovery is moderately low (30-49)", () => {
    const state = baseAthleteState({
      derived: {
        ...baseAthleteState().derived,
        muscleRecoveryMap: [muscleEntry({ muscle: "quadriceps", score: 40, confidence: 0.8 })],
      },
    });
    const context = baseTrainingContext(contributionsFor("exercise-1", "quadriceps"));
    const today = session([exercise({ exerciseName: "Squat", targetSets: 4 })]);

    const { proposedActions } = buildDailyDecision(state, context, today);

    expect(proposedActions).toHaveLength(1);
    expect(proposedActions[0].payload).toMatchObject({
      type: "modify_volume",
      before: { sets: 4 },
      after: { sets: 3 },
    });
  });

  it("never proposes an action when the muscle recovery signal has low confidence — a warning only", () => {
    const state = baseAthleteState({
      derived: {
        ...baseAthleteState().derived,
        muscleRecoveryMap: [muscleEntry({ muscle: "quadriceps", score: 10, confidence: 0.2 })],
      },
    });
    const context = baseTrainingContext(contributionsFor("exercise-1", "quadriceps"));
    const today = session([exercise({ exerciseName: "Leg Press" })]);

    const { decision, proposedActions } = buildDailyDecision(state, context, today);

    expect(proposedActions).toHaveLength(0);
    expect(decision.decision.warnings.length).toBeGreaterThan(0);
  });

  it("reports insufficient_data when no muscle in today's session has any resolvable recovery signal", () => {
    const state = baseAthleteState({
      derived: { ...baseAthleteState().derived, muscleRecoveryMap: [] },
    });
    const context = baseTrainingContext(new Map()); // no contribution data for exercise-1 at all
    const today = session([exercise()]);

    const { decision, proposedActions } = buildDailyDecision(state, context, today);

    expect(decision.decision.decisionCode).toBe("insufficient_data");
    expect(proposedActions).toHaveLength(0);
  });

  it("reports no_session_scheduled when nothing is planned today", () => {
    const state = baseAthleteState();
    const context = baseTrainingContext();

    const { decision, proposedActions } = buildDailyDecision(state, context, null);

    expect(decision.decision.decisionCode).toBe("no_session_scheduled");
    expect(proposedActions).toHaveLength(0);
  });

  it("a pain/illness flag overrides everything — only a recovery_action is proposed, regardless of muscle recovery", () => {
    const state = baseAthleteState({
      recovery: { ...baseAthleteState().recovery, painFlag: true },
      derived: {
        ...baseAthleteState().derived,
        muscleRecoveryMap: [muscleEntry({ muscle: "chest", score: 95, confidence: 0.9 })],
      },
    });
    const context = baseTrainingContext(contributionsFor("exercise-1", "chest"));
    const today = session([exercise()]);

    const { decision, proposedActions } = buildDailyDecision(state, context, today);

    expect(decision.decision.decisionCode).toBe("prioritize_recovery");
    expect(decision.confidence).toBe("high");
    expect(proposedActions).toHaveLength(1);
    expect(proposedActions[0].payload.type).toBe("recovery_action");
  });

  it("proposed action ids are deterministic — the same condition proposes the same id twice", () => {
    const state = baseAthleteState({
      derived: {
        ...baseAthleteState().derived,
        muscleRecoveryMap: [muscleEntry({ muscle: "quadriceps", score: 20, confidence: 0.8 })],
      },
    });
    const context = baseTrainingContext(contributionsFor("exercise-1", "quadriceps"));
    const today = session([exercise({ exerciseName: "Leg Press" })]);

    const first = buildDailyDecision(state, context, today);
    const second = buildDailyDecision(state, context, today);

    expect(first.proposedActions[0].id).toBe(second.proposedActions[0].id);
  });

  it("skips already-skipped exercises entirely", () => {
    const state = baseAthleteState({
      derived: {
        ...baseAthleteState().derived,
        muscleRecoveryMap: [muscleEntry({ muscle: "quadriceps", score: 10, confidence: 0.9 })],
      },
    });
    const context = baseTrainingContext(contributionsFor("exercise-1", "quadriceps"));
    const today = session([exercise({ isSkipped: true })]);

    const { proposedActions } = buildDailyDecision(state, context, today);

    expect(proposedActions).toHaveLength(0);
  });
});
