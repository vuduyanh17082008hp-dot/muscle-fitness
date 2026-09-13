import { describe, expect, it } from "vitest";

import { buildTrainingInsight } from "@/lib/dante-core/build-chat-insight";
import type { ProgramAdaptation } from "@/lib/dante-core/adaptive-program-engine";
import type { TraceableDecision } from "@/lib/dante-core/types";

function decision(overrides: Partial<ProgramAdaptation> = {}): TraceableDecision<ProgramAdaptation> {
  const adaptation: ProgramAdaptation = {
    exerciseId: "ex-1",
    exerciseName: "Bench Press",
    action: "INCREASE_LOAD",
    suggestedWeightKg: 82.5,
    gated: false,
    gateReason: null,
    subAction: null,
    evidenceSampleSize: 3,
    lastSessionSets: [
      { weightKg: 80, reps: 10, rir: 2, completed: true },
      { weightKg: 80, reps: 10, rir: 2, completed: true },
      { weightKg: 80, reps: 10, rir: 2, completed: true },
    ],
    targetRepMin: 8,
    targetRepMax: 10,
    ...overrides,
  };

  return {
    recommendation: `${adaptation.exerciseName}: increase load.`,
    decision: adaptation,
    why: ["All working sets reached the top of the 8-10 rep range at an acceptable effort level."],
    dataUsed: {},
    confidence: "high",
    sources: [],
  };
}

describe("buildTrainingInsight", () => {
  it("only returns an insight when the message actually names an exercise Dante has a recommendation for", () => {
    expect(buildTrainingInsight("what should I eat today", [decision()], 82, "Good")).toBeNull();
  });

  it('answers "should I increase bench today" using the real recommendation evidence', () => {
    const insight = buildTrainingInsight(
      "Should I increase bench today?",
      [decision()],
      82,
      "Good",
    );

    expect(insight).not.toBeNull();
    expect(insight!.action).toContain("82.5 kg");
    expect(insight!.evidence.some((item) => item.label === "Performance" && item.value === "10 / 10 / 10")).toBe(
      true,
    );
    expect(insight!.evidence.some((item) => item.label === "RIR" && item.value === "2")).toBe(true);
    expect(insight!.evidence.some((item) => item.label === "Recovery" && item.value === "82")).toBe(true);
    expect(insight!.confidence).toBe("high");
  });

  it("never invents a different next weight than the deterministic recommendation", () => {
    const insight = buildTrainingInsight("bench press advice", [decision({ suggestedWeightKg: 85 })], 82, "Good");
    expect(insight!.action).toContain("85 kg");
    expect(insight!.action).not.toContain("82.5");
  });

  it("marks a pain-gated recommendation as a warning, not a routine progress note", () => {
    const insight = buildTrainingInsight(
      "bench press",
      [decision({ action: "HOLD", gated: true, gateReason: "pain", suggestedWeightKg: null })],
      82,
      "Good",
    );

    expect(insight!.severity).toBe("warning");
    expect(insight!.action).toContain("paused");
  });

  it("returns null when there is no completed-set evidence for the matched exercise (no fabricated evidence)", () => {
    const insight = buildTrainingInsight(
      "bench press",
      [decision({ lastSessionSets: [] })],
      82,
      "Good",
    );
    expect(insight).toBeNull();
  });
});
