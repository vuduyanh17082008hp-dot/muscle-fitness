import { describe, expect, it } from "vitest";

import { classifyActionRisk, classifyActionRiskForAutopilot } from "@/lib/dante-core/autonomy/classify";
import type {
  AdjustSetsRepsPayload,
  MacroAdjustmentPayload,
  ModifyVolumePayload,
  PostponeExercisePayload,
} from "@/lib/dante-core/actions/types";

function adjust(before: number, after: number): AdjustSetsRepsPayload {
  return {
    type: "adjust_sets_reps",
    sessionId: "s1",
    sessionExerciseId: "se1",
    exerciseName: "Bench Press",
    before: { sets: before, repMin: 6, repMax: 8 },
    after: { sets: after, repMin: 6, repMax: 8 },
  };
}

function modifyVolume(before: number, after: number): ModifyVolumePayload {
  return {
    type: "modify_volume",
    sessionId: "s1",
    sessionExerciseId: "se1",
    exerciseName: "Squat",
    before: { sets: before },
    after: { sets: after },
  };
}

describe("classifyActionRisk", () => {
  it("a ±1 set adjustment is auto-appliable", () => {
    expect(classifyActionRisk(adjust(4, 3))).toBe("auto");
    expect(classifyActionRisk(adjust(4, 5))).toBe("auto");
  });

  it("a larger set-count change requires confirmation", () => {
    expect(classifyActionRisk(adjust(6, 3))).toBe("confirm");
  });

  it("an absurd set-count delta is blocked outright", () => {
    expect(classifyActionRisk(adjust(20, 1))).toBe("block");
  });

  it("a small volume percent change is auto-appliable", () => {
    expect(classifyActionRisk(modifyVolume(10, 9))).toBe("auto"); // 10%
  });

  it("a large volume percent change requires confirmation", () => {
    expect(classifyActionRisk(modifyVolume(10, 6))).toBe("confirm"); // 40%
  });

  it("an extreme volume percent change is blocked outright", () => {
    expect(classifyActionRisk(modifyVolume(10, 1))).toBe("block"); // 90%
  });

  it("postponing/removing an exercise always requires confirmation", () => {
    const payload: PostponeExercisePayload = {
      type: "postpone_exercise",
      sessionId: "s1",
      sessionExerciseId: "se1",
      exerciseName: "Leg Press",
    };
    expect(classifyActionRisk(payload)).toBe("confirm");
  });

  it("a macro/calorie target change always requires confirmation, regardless of magnitude", () => {
    const small: MacroAdjustmentPayload = {
      type: "macro_adjustment",
      macro: "protein",
      direction: "increase",
      suggestedChangePercent: 2,
    };
    expect(classifyActionRisk(small)).toBe("confirm");
  });

  it("a recovery reminder and a meal suggestion are auto-appliable (advisory, reversible)", () => {
    expect(
      classifyActionRisk({ type: "recovery_action", suggestion: "Prioritize sleep tonight." }),
    ).toBe("auto");
    expect(
      classifyActionRisk({
        type: "meal_suggestion",
        mealDescription: "Greek yogurt with berries",
        estimatedCalories: 250,
        estimatedProteinG: 20,
      }),
    ).toBe("auto");
  });
});

describe("classifyActionRiskForAutopilot", () => {
  it("widens the auto ceiling for modify_volume but still blocks extreme changes", () => {
    expect(classifyActionRiskForAutopilot(modifyVolume(10, 8))).toBe("auto"); // 20% — confirm under ASSIST, auto under AUTOPILOT
    expect(classifyActionRisk(modifyVolume(10, 8))).toBe("confirm");
    expect(classifyActionRiskForAutopilot(modifyVolume(10, 1))).toBe("block");
  });

  it("does not widen the ceiling for action types with a fixed CONFIRM classification", () => {
    const macro: MacroAdjustmentPayload = {
      type: "macro_adjustment",
      macro: "calories",
      direction: "decrease",
      suggestedChangePercent: 1,
    };
    expect(classifyActionRiskForAutopilot(macro)).toBe("confirm");
  });
});
