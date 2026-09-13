import { describe, expect, it } from "vitest";

import { resolveAutonomyDecision } from "@/lib/dante-core/autonomy/gate";
import type { AdjustSetsRepsPayload, PostponeExercisePayload } from "@/lib/dante-core/actions/types";

function smallAdjust(): AdjustSetsRepsPayload {
  return {
    type: "adjust_sets_reps",
    sessionId: "s1",
    sessionExerciseId: "se1",
    exerciseName: "Bench Press",
    before: { sets: 4, repMin: 6, repMax: 8 },
    after: { sets: 3, repMin: 6, repMax: 8 },
  };
}

function extremeAdjust(): AdjustSetsRepsPayload {
  return {
    type: "adjust_sets_reps",
    sessionId: "s1",
    sessionExerciseId: "se1",
    exerciseName: "Bench Press",
    before: { sets: 20, repMin: 6, repMax: 8 },
    after: { sets: 1, repMin: 6, repMax: 8 },
  };
}

describe("resolveAutonomyDecision", () => {
  it("GUIDE never auto-applies, even a small/low-risk action — recommend only", () => {
    expect(resolveAutonomyDecision({ autonomyLevel: "guide", payload: smallAdjust() })).toBe("confirm");
  });

  it("ASSIST (default) auto-applies a small, low-risk action", () => {
    expect(resolveAutonomyDecision({ autonomyLevel: "assist", payload: smallAdjust() })).toBe("auto");
  });

  it("a blocked action is blocked under every autonomy level, including AUTOPILOT", () => {
    expect(resolveAutonomyDecision({ autonomyLevel: "guide", payload: extremeAdjust() })).toBe("block");
    expect(resolveAutonomyDecision({ autonomyLevel: "assist", payload: extremeAdjust() })).toBe("block");
    expect(resolveAutonomyDecision({ autonomyLevel: "autopilot", payload: extremeAdjust() })).toBe("block");
  });

  it("AUTOPILOT auto-applies within its wider (still bounded) ceiling", () => {
    const payload: import("@/lib/dante-core/actions/types").ModifyVolumePayload = {
      type: "modify_volume",
      sessionId: "s1",
      sessionExerciseId: "se1",
      exerciseName: "Squat",
      before: { sets: 10 },
      after: { sets: 8 }, // 20%
    };

    expect(resolveAutonomyDecision({ autonomyLevel: "assist", payload })).toBe("confirm");
    expect(resolveAutonomyDecision({ autonomyLevel: "autopilot", payload })).toBe("auto");
  });

  it("a learned-pattern 'ASK FIRST' override forces confirmation even for an otherwise auto-appliable action", () => {
    const decision = resolveAutonomyDecision({
      autonomyLevel: "assist",
      payload: smallAdjust(),
      patternRequiresConfirmation: true,
    });

    expect(decision).toBe("confirm");
  });

  it("an action requiring confirmation by its own type (e.g. postpone_exercise) is never widened to auto by autonomy level alone", () => {
    const payload: PostponeExercisePayload = {
      type: "postpone_exercise",
      sessionId: "s1",
      sessionExerciseId: "se1",
      exerciseName: "Leg Press",
    };

    expect(resolveAutonomyDecision({ autonomyLevel: "autopilot", payload })).toBe("confirm");
  });
});
