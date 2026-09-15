import { describe, expect, it } from "vitest";

import { runDanteCycle } from "@/lib/dante-core/orchestrator/index";
import type { OrchestratorInput } from "@/lib/dante-core/orchestrator/types";
import type { AthleteState } from "@/lib/athlete-state/types";
import { emptyClientPolicy } from "@/lib/dante-core/policy/types";
import type { TraceableDecision } from "@/lib/dante-core/types";
import type { DailyDecision } from "@/lib/dante-core/daily-decision-engine";
import type { DanteProposedAction, ModifyVolumePayload } from "@/lib/dante-core/actions/types";

const USER_ID = "user-1";

function freshness(status: "current" | "stale" | "missing" = "current") {
  return { status, lastUpdated: null, humanReadable: "Updated recently" };
}

function buildAthleteState(overrides: Partial<AthleteState["recovery"]> = {}): AthleteState {
  return {
    generatedAt: "2026-01-01T00:00:00.000Z",
    dataWindow: { startDate: "2025-12-01", endDate: "2026-01-01", weeksOfHistory: 4 },
    profile: {
      goal: "muscle_gain",
      experience: "intermediate",
      trainingFrequency: 4,
      priorityMuscles: [],
      heightCm: 178,
      weightKg: 80,
      sessionDurationMinutes: 60,
      availableEquipment: [],
      physicalLimitations: null,
    },
    training: { hasAnyLoggedData: true, muscles: [], exerciseNames: {} },
    recovery: {
      available: true,
      score: 75,
      status: "good",
      trainingLoadState: "green",
      sevenDayAverageScore: 72,
      sleepHours: 7.5,
      stress: 3,
      soreness: 3,
      fatigue: 3,
      painFlag: false,
      recoveryStatusCode: "good",
      ...overrides,
    },
    nutrition: { available: true, calorieTarget: 2800, proteinTargetGrams: 180, carbsTargetGrams: 300, fatTargetGrams: 80 },
    setVision: { available: false, latestExercise: null, analysesLast30Days: 0, romConsistencyDeviation: null, tempoConsistencyDeviation: null },
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
        sleep: { current: 7.5, baseline: 7.2, delta: 0.3, sampleCount: 10, confidence: 0.8 },
        recoveryScore: { current: 75, baseline: 70, delta: 5, sampleCount: 10, confidence: 0.8 },
        trainingLoad: { current: 3, baseline: 3, delta: 0, sampleCount: 10, confidence: 0.8 },
      },
      muscleRecoveryMap: [],
      overallConfidence: 0.8,
      missingData: [],
    },
    dataFreshness: {
      recovery: freshness(),
      nutrition: freshness(),
      training: freshness(),
      setVision: freshness("missing"),
      bodyweight: freshness(),
    },
    progress: { status: "not_yet_implemented" },
  };
}

function volumeAction(before: number, after: number): DanteProposedAction {
  const payload: ModifyVolumePayload = {
    type: "modify_volume",
    sessionId: "s1",
    sessionExerciseId: "se1",
    exerciseName: "Leg Press",
    before: { sets: before },
    after: { sets: after },
  };

  return {
    id: `modify_volume:se1:${after}`,
    payload,
    reason: "Recovery is low today.",
    requiresConfirmation: true,
  };
}

function buildDailyDecision(decisionCode: DailyDecision["decisionCode"] = "proceed_as_planned"): TraceableDecision<DailyDecision> {
  return {
    recommendation: "Proceed as planned.",
    decision: { decisionCode, sessionId: "s1", affectedExercises: [], warnings: [] },
    why: [],
    dataUsed: {},
    confidence: "high",
    sources: [],
  };
}

function baseInput(overrides: Partial<OrchestratorInput> = {}): OrchestratorInput {
  return {
    athleteState: buildAthleteState(),
    policy: emptyClientPolicy(USER_ID),
    dailyDecision: buildDailyDecision(),
    proposedActions: [],
    previousSnapshot: null,
    ...overrides,
  };
}

describe("runDanteCycle", () => {
  it("a brand-new athlete (no prior snapshot) gets an honest 'first cycle' change note, not a fabricated diff", () => {
    const result = runDanteCycle(baseInput());
    expect(result.changes).toEqual(["First cycle recorded for this athlete — no prior snapshot to compare against."]);
  });

  it("reports 'no meaningful change' when nothing moved since the last snapshot", () => {
    const input = baseInput({
      previousSnapshot: { readinessScore: 75, trainingFocus: null, recoveryStatus: "good" },
    });
    const result = runDanteCycle(input);
    expect(result.changes).toEqual(["No meaningful change since the last cycle."]);
  });

  it("reports a real readiness change with the actual delta", () => {
    const input = baseInput({
      previousSnapshot: { readinessScore: 60, trainingFocus: null, recoveryStatus: "good" },
    });
    const result = runDanteCycle(input);
    expect(result.changes.some((change) => change.includes("60") && change.includes("75"))).toBe(true);
  });

  it("a small volume adjustment under default ASSIST autonomy is gated 'auto', with sandbox scenarios attached", () => {
    const input = baseInput({
      athleteState: buildAthleteState({ score: 45, trainingLoadState: "red" }),
      proposedActions: [volumeAction(10, 9)], // 10% reduction — small
    });

    const result = runDanteCycle(input);
    expect(result.gatedActions).toHaveLength(1);
    expect(result.gatedActions[0].autonomyDecision).toBe("auto");
    expect(result.gatedActions[0].scenariosConsidered).not.toBeNull();
    expect(result.gatedActions[0].scenariosConsidered!.length).toBeGreaterThan(0);
  });

  it("GUIDE autonomy always downgrades to 'confirm', even for a small action", () => {
    const input = baseInput({
      policy: { ...emptyClientPolicy(USER_ID), autonomyLevel: "guide" },
      proposedActions: [volumeAction(10, 9)],
    });

    const result = runDanteCycle(input);
    expect(result.gatedActions[0].autonomyDecision).toBe("confirm");
  });

  it("an extreme (out-of-bounds) proposed action is always blocked, regardless of autonomy level", () => {
    const input = baseInput({
      policy: { ...emptyClientPolicy(USER_ID), autonomyLevel: "autopilot" },
      proposedActions: [volumeAction(10, 1)], // 90% reduction
    });

    const result = runDanteCycle(input);
    expect(result.gatedActions[0].autonomyDecision).toBe("block");
  });

  it("a non-training action (e.g. macro_adjustment) never gets sandbox scenarios attached", () => {
    const action: DanteProposedAction = {
      id: "macro_adjustment:protein:increase:10",
      payload: { type: "macro_adjustment", macro: "protein", direction: "increase", suggestedChangePercent: 10 },
      reason: "Protein has been under target this week.",
      requiresConfirmation: true,
    };

    const result = runDanteCycle(baseInput({ proposedActions: [action] }));
    expect(result.gatedActions[0].scenariosConsidered).toBeNull();
    expect(result.gatedActions[0].autonomyDecision).toBe("confirm"); // macro changes always confirm
  });
});
