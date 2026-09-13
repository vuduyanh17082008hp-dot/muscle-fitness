import { describe, expect, it } from "vitest";

import {
  statusFromDailyDecisionCode,
  statusFromProgramAdaptation,
} from "@/lib/dante-core/recommendation-status";
import type { ProgramAdaptation } from "@/lib/dante-core/adaptive-program-engine";

function adaptation(overrides: Partial<ProgramAdaptation> = {}): ProgramAdaptation {
  return {
    exerciseId: "ex-1",
    exerciseName: "Bench Press",
    action: "HOLD",
    suggestedWeightKg: null,
    gated: false,
    gateReason: null,
    subAction: null,
    evidenceSampleSize: 3,
    lastSessionSets: [],
    targetRepMin: 8,
    targetRepMax: 10,
    ...overrides,
  };
}

describe("statusFromProgramAdaptation", () => {
  it("maps INCREASE_LOAD to progress", () => {
    expect(statusFromProgramAdaptation(adaptation({ action: "INCREASE_LOAD" }))).toBe("progress");
  });

  it("maps DECREASE_LOAD to adjust", () => {
    expect(statusFromProgramAdaptation(adaptation({ action: "DECREASE_LOAD" }))).toBe("adjust");
  });

  it("maps an un-gated HOLD with subAction 'add_reps' to build", () => {
    expect(statusFromProgramAdaptation(adaptation({ action: "HOLD", subAction: "add_reps" }))).toBe(
      "build",
    );
  });

  it("maps a plain un-gated HOLD to hold", () => {
    expect(statusFromProgramAdaptation(adaptation({ action: "HOLD", subAction: null }))).toBe("hold");
  });

  it("maps a pain-gated HOLD to caution, never merely recover — safety must be visually distinct", () => {
    expect(
      statusFromProgramAdaptation(adaptation({ action: "HOLD", gated: true, gateReason: "pain" })),
    ).toBe("caution");
  });

  it("maps a recovery-priority-gated HOLD to recover, not caution", () => {
    expect(
      statusFromProgramAdaptation(
        adaptation({ action: "HOLD", gated: true, gateReason: "recovery_priority" }),
      ),
    ).toBe("recover");
  });

  it("maps a training-load-gated HOLD to recover", () => {
    expect(
      statusFromProgramAdaptation(adaptation({ action: "HOLD", gated: true, gateReason: "training_load" })),
    ).toBe("recover");
  });

  it("gated always wins over action/subAction, even if the engine somehow reported both", () => {
    expect(
      statusFromProgramAdaptation(
        adaptation({ action: "INCREASE_LOAD", gated: true, gateReason: "pain" }),
      ),
    ).toBe("caution");
  });
});

describe("statusFromDailyDecisionCode", () => {
  it("maps proceed_as_planned to hold", () => {
    expect(statusFromDailyDecisionCode("proceed_as_planned")).toBe("hold");
  });

  it("maps modify_session to adjust", () => {
    expect(statusFromDailyDecisionCode("modify_session")).toBe("adjust");
  });

  it("maps prioritize_recovery to caution (the engine only sets this code on a pain/illness flag)", () => {
    expect(statusFromDailyDecisionCode("prioritize_recovery")).toBe("caution");
  });

  it("returns null for codes with nothing adaptive to report, rather than forcing a status", () => {
    expect(statusFromDailyDecisionCode("no_session_scheduled")).toBeNull();
    expect(statusFromDailyDecisionCode("insufficient_data")).toBeNull();
  });
});
