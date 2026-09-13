import { describe, expect, it } from "vitest";

import { buildTodayPlan, type TodayAdaptiveContext } from "@/lib/daily-plan/build-today-plan";
import type { TodaySession } from "@/lib/training/load-today-session";

function session(overrides: Partial<TodaySession> = {}): TodaySession {
  return {
    id: "session-1",
    name: "Push Strength",
    scheduledFor: "2026-01-01T16:30:00.000Z",
    durationMinutes: 70,
    sessionState: "not_started",
    exercises: [
      {
        sessionExerciseId: "se-1",
        exerciseId: "ex-1",
        exerciseName: "Bench Press",
        targetSets: 4,
        repMin: 8,
        repMax: 10,
        restSeconds: 90,
        primaryMuscle: "chest",
        isSkipped: false,
      },
    ],
    ...overrides,
  };
}

function adaptive(overrides: Partial<TodayAdaptiveContext> = {}): TodayAdaptiveContext {
  return {
    dailyDecisionCode: "proceed_as_planned",
    dailyDecisionRecommendation: "Proceed with today's session as planned.",
    recoveryStatusLabel: "Good",
    readyToProgressCount: 0,
    ...overrides,
  };
}

function workoutAction(actions: ReturnType<typeof buildTodayPlan>) {
  return actions.find((action) => action.type === "workout")!;
}

describe("buildTodayPlan — adaptive integration", () => {
  it("labels a normal session with the real recovery status, when no adaptive signal applies", () => {
    const actions = buildTodayPlan({
      todaySession: session(),
      hasCheckinToday: true,
      proteinTargetG: null,
      proteinLoggedG: 0,
      adaptive: adaptive(),
    });

    const workout = workoutAction(actions);
    expect(workout.metadata?.adaptiveLabel).toBe("Normal session");
    expect(workout.metadata?.adaptiveDetail).toBe("Recovery: Good");
  });

  it("labels an adjusted session using the engine's own real recommendation text, never a guessed reason", () => {
    const actions = buildTodayPlan({
      todaySession: session(),
      hasCheckinToday: true,
      proteinTargetG: null,
      proteinLoggedG: 0,
      adaptive: adaptive({
        dailyDecisionCode: "modify_session",
        dailyDecisionRecommendation: "Adjust today's session — Bench Press needs attention.",
      }),
    });

    const workout = workoutAction(actions);
    expect(workout.metadata?.adaptiveLabel).toBe("Adjusted session");
    expect(workout.metadata?.adaptiveDetail).toBe("Adjust today's session — Bench Press needs attention.");
  });

  it("labels a pain-flagged session as adjusted (never a bare 'normal session')", () => {
    const actions = buildTodayPlan({
      todaySession: session(),
      hasCheckinToday: true,
      proteinTargetG: null,
      proteinLoggedG: 0,
      adaptive: adaptive({
        dailyDecisionCode: "prioritize_recovery",
        dailyDecisionRecommendation: "Prioritize recovery today — a recent check-in flagged pain or illness.",
      }),
    });

    expect(workoutAction(actions).metadata?.adaptiveLabel).toBe("Adjusted session");
  });

  it("surfaces real progression readiness only when the caller supplies a genuine count", () => {
    const actions = buildTodayPlan({
      todaySession: session(),
      hasCheckinToday: true,
      proteinTargetG: null,
      proteinLoggedG: 0,
      adaptive: adaptive({ readyToProgressCount: 3 }),
    });

    const workout = workoutAction(actions);
    expect(workout.metadata?.adaptiveLabel).toBe("Progression available");
    expect(workout.metadata?.adaptiveDetail).toBe("3 exercises ready to progress");
  });

  it("an adjusted session takes priority over progression readiness — safety-relevant info first", () => {
    const actions = buildTodayPlan({
      todaySession: session(),
      hasCheckinToday: true,
      proteinTargetG: null,
      proteinLoggedG: 0,
      adaptive: adaptive({ dailyDecisionCode: "modify_session", readyToProgressCount: 2 }),
    });

    expect(workoutAction(actions).metadata?.adaptiveLabel).toBe("Adjusted session");
  });

  it("omits adaptive metadata entirely when the caller doesn't supply it — never fabricates a status", () => {
    const actions = buildTodayPlan({
      todaySession: session(),
      hasCheckinToday: true,
      proteinTargetG: null,
      proteinLoggedG: 0,
    });

    const workout = workoutAction(actions);
    expect(workout.metadata?.adaptiveLabel).toBeNull();
  });
});
