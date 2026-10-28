import { describe, expect, it } from "vitest";

import { buildDailyDecision, classifyTodaySession, type TodaySessionStatus } from "@/lib/dante-core/daily-decision-engine";
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
      current: null,
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

  it("does not tell a low-readiness athlete the session is consistent with their recovery (F-07)", () => {
    const state = baseAthleteState({
      recovery: { ...baseAthleteState().recovery, score: 30, status: "Priority recovery", recoveryStatusCode: "priority" },
      derived: {
        ...baseAthleteState().derived,
        muscleRecoveryMap: [muscleEntry({ muscle: "chest", score: 90, confidence: 0.8 })],
      },
    });
    const context = baseTrainingContext(contributionsFor("exercise-1", "chest"));

    const { decision, proposedActions } = buildDailyDecision(state, context, session([exercise()]));

    expect(decision.decision.decisionCode).toBe("proceed_as_planned");
    expect(proposedActions).toHaveLength(0);
    expect(decision.recommendation).not.toMatch(/as planned/);
    expect(decision.recommendation).toMatch(/readiness check-in is low/);
    expect(decision.why.join(" ")).not.toMatch(/consistent with your recent recovery/);
    expect(decision.why.join(" ")).toMatch(/30\/100/);
  });

  it("does not claim consistency when there is not enough muscle data to assess", () => {
    const state = baseAthleteState({
      derived: { ...baseAthleteState().derived, muscleRecoveryMap: [] },
    });
    const context = baseTrainingContext(contributionsFor("exercise-1", "chest"));

    const { decision } = buildDailyDecision(state, context, session([exercise()]));

    expect(decision.decision.decisionCode).toBe("insufficient_data");
    expect(decision.why.join(" ")).not.toMatch(/consistent with your recent recovery/);
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

describe("FINAL-F F-03: decisions follow canonical workout state", () => {
  const recovered = baseAthleteState({
    derived: { ...baseAthleteState().derived, muscleRecoveryMap: [muscleEntry({ muscle: "chest", score: 90, confidence: 0.8 })] },
  });
  const sore = baseAthleteState({
    derived: { ...baseAthleteState().derived, muscleRecoveryMap: [muscleEntry({ muscle: "chest", score: 10, confidence: 0.9 })] },
  });
  const context = baseTrainingContext(contributionsFor("exercise-1", "chest"));
  const withState = (sessionState: string | null, exercises = [exercise()]) => ({ ...session(exercises), sessionState });
  const PROCEED = /\b(proceed|start|continue)\b/i;

  it("no scheduled workout → no_session_scheduled, no directive to train", () => {
    const { decision, proposedActions } = buildDailyDecision(recovered, context, null);
    expect(decision.decision.decisionCode).toBe("no_session_scheduled");
    expect(decision.recommendation).not.toMatch(PROCEED);
    expect(proposedActions).toEqual([]);
  });

  it("scheduled (not_started) workout → proceed as planned", () => {
    const { decision } = buildDailyDecision(recovered, context, withState("not_started"));
    expect(decision.decision.decisionCode).toBe("proceed_as_planned");
    expect(decision.recommendation).toBe("Proceed with today's session as planned.");
  });

  it("active workout → continue the session in progress; never tells the athlete to start it", () => {
    for (const state of ["in_progress", "paused"]) {
      const { decision } = buildDailyDecision(recovered, context, withState(state));
      expect(decision.decision.decisionCode).toBe("proceed_as_planned");
      expect(decision.recommendation).toBe("Continue today's session in progress as planned.");
    }
  });

  it("completed workout → session_completed, no proceed/repeat wording, no actions — even when a muscle is sore", () => {
    for (const state of [recovered, sore]) {
      const { decision, proposedActions } = buildDailyDecision(state, context, withState("completed"));
      expect(decision.decision.decisionCode).toBe("session_completed");
      expect(decision.recommendation).not.toMatch(PROCEED);
      expect(decision.why.join(" ")).not.toMatch(/postpon|reduc/i);
      expect(proposedActions).toEqual([]);
    }
  });

  it("every exercise postponed, or the session cancelled → session_postponed (rest day), never 'proceed'", () => {
    const postponed = buildDailyDecision(recovered, context, withState("not_started", [exercise({ isSkipped: true })]))
    expect(postponed.decision.decision.decisionCode).toBe("session_postponed");
    expect(postponed.decision.recommendation).toBe("Today's session is postponed — treat today as a rest day.");
    expect(postponed.proposedActions).toEqual([]);

    const cancelled = buildDailyDecision(recovered, context, withState("cancelled"));
    expect(cancelled.decision.decision.decisionCode).toBe("session_postponed");
    expect(cancelled.decision.recommendation).not.toMatch(PROCEED);
  });

  it("a partially postponed session still decides on the exercises left (postponed ones are not re-proposed)", () => {
    const today = withState("not_started", [
      exercise({ isSkipped: true }),
      exercise({ sessionExerciseId: "session-exercise-2", exerciseName: "Incline Press" }),
    ]);
    const { decision, proposedActions } = buildDailyDecision(sore, context, today);
    expect(decision.decision.decisionCode).toBe("modify_session");
    expect(decision.decision.affectedExercises.map((e) => e.sessionExerciseId)).toEqual(["session-exercise-2"]);
    expect(proposedActions).toHaveLength(1);
  });

  it("unknown or contradictory records → session_state_unknown, low confidence, no directive", () => {
    const cases = [
      buildDailyDecision(recovered, context, null, { sessionUnavailable: true }),
      buildDailyDecision(recovered, context, withState("archived_by_import")),
      buildDailyDecision(recovered, context, { ...withState("not_started", []), exercisesUnavailable: true }),
    ];
    for (const { decision, proposedActions } of cases) {
      expect(decision.decision.decisionCode).toBe("session_state_unknown");
      expect(decision.confidence).toBe("low");
      expect(decision.recommendation).not.toMatch(/\bproceed\b|\bcontinue\b/i);
      expect(proposedActions).toEqual([]);
    }
  });

  it("pain/illness still overrides every session state", () => {
    const pained = baseAthleteState({ recovery: { ...baseAthleteState().recovery, painFlag: true } });
    for (const state of ["not_started", "in_progress", "completed", "cancelled", "weird"]) {
      expect(buildDailyDecision(pained, context, withState(state)).decision.decision.decisionCode).toBe("prioritize_recovery");
    }
  });

  it("state transitions over one day: scheduled → active → completed never repeats a 'proceed'", () => {
    const codes = ["not_started", "in_progress", "completed"].map((s) => buildDailyDecision(recovered, context, withState(s)).decision);
    expect(codes.map((d) => d.decision.decisionCode)).toEqual(["proceed_as_planned", "proceed_as_planned", "session_completed"]);
    expect(codes[2].recommendation).not.toMatch(PROCEED);
  });

  // F-03B: the dashboard hero and "What matters" read classifyTodaySession(); the Daily Brief reads buildDailyDecision().
  // Only "planned"/"active" may show a pending/continue prompt, and those are exactly the states where the Brief still trains.
  it("dashboard session prompts and the Daily Brief read the same session state", () => {
    const cases: Array<[string, TodaySession | null, { sessionUnavailable?: boolean }, TodaySessionStatus, string]> = [
      ["scheduled", withState("not_started"), {}, "planned", "proceed_as_planned"],
      ["scheduled (null state)", withState(null), {}, "planned", "proceed_as_planned"],
      ["in progress", withState("in_progress"), {}, "active", "proceed_as_planned"],
      ["paused", withState("paused"), {}, "active", "proceed_as_planned"],
      ["completed", withState("completed"), {}, "completed", "session_completed"],
      ["cancelled", withState("cancelled"), {}, "postponed", "session_postponed"],
      ["all postponed", withState("not_started", [exercise({ isSkipped: true })]), {}, "postponed", "session_postponed"],
      ["cancelled + all postponed", withState("cancelled", [exercise({ isSkipped: true })]), {}, "postponed", "session_postponed"],
      ["unknown state", withState("archived_by_import"), {}, "unknown", "session_state_unknown"],
      ["exercises unreadable", { ...withState("not_started", []), exercisesUnavailable: true }, {}, "unknown", "session_state_unknown"],
      ["read failed", null, { sessionUnavailable: true }, "unknown", "session_state_unknown"],
      ["no session", null, {}, "none", "no_session_scheduled"],
    ];

    for (const [label, today, options, status, code] of cases) {
      expect(classifyTodaySession(today, options), label).toBe(status);
      expect(buildDailyDecision(recovered, context, today, options).decision.decision.decisionCode, label).toBe(code);
      const offersPending = status === "planned" || status === "active";
      expect(offersPending, label).toBe(code === "proceed_as_planned");
    }
  });
});
