import { describe, expect, it } from "vitest";
import {
  computeExerciseProgression,
  type LoggedSetForProgression,
  type ProgressionInput,
} from "@/lib/training/progression-engine";

function sets(
  overrides: Partial<LoggedSetForProgression> = {},
  count = 3,
): LoggedSetForProgression[] {
  return Array.from({ length: count }, () => ({
    weightKg: 60,
    reps: 10,
    rir: 2,
    completed: true,
    ...overrides,
  }));
}

function input(overrides: Partial<ProgressionInput> = {}): ProgressionInput {
  return {
    targetRepMin: 8,
    targetRepMax: 10,
    targetRir: 2,
    lastSessionSets: sets(),
    recentPainFlag: false,
    recoveryStatus: "good",
    trainingLoadState: "green",
    ...overrides,
  };
}

describe("computeExerciseProgression — double progression", () => {
  it("suggests a load increase when all working sets hit the top of the rep range at acceptable effort", () => {
    const result = computeExerciseProgression(
      input({ lastSessionSets: sets({ reps: 10, rir: 2, weightKg: 60 }) }),
    );

    expect(result.action).toBe("INCREASE_LOAD");
    expect(result.suggestedWeightKg).toBe(62.5);
    expect(result.gated).toBe(false);
  });

  it("holds when reps are within range but have not yet reached the top", () => {
    const result = computeExerciseProgression(
      input({ lastSessionSets: sets({ reps: 9, rir: 2 }) }),
    );

    expect(result.action).toBe("HOLD");
    expect(result.suggestedWeightKg).toBeNull();
  });

  it("suggests decreasing load when reps fall below the target range", () => {
    const result = computeExerciseProgression(
      input({ lastSessionSets: sets({ reps: 6, rir: 0 }) }),
    );

    expect(result.action).toBe("DECREASE_LOAD");
  });

  it("does not trust top-of-range reps ground out well below target RIR", () => {
    const result = computeExerciseProgression(
      input({
        targetRir: 2,
        lastSessionSets: sets({ reps: 10, rir: 0 }),
      }),
    );

    // reps hit the top, but effort was well beyond the RIR tolerance —
    // should not be treated as a clean, sustainable top-of-range performance.
    expect(result.action).not.toBe("INCREASE_LOAD");
  });
});

describe("computeExerciseProgression — recovery-related adjustments", () => {
  it("holds progression when recovery status is in the priority range, even with good performance", () => {
    const result = computeExerciseProgression(
      input({
        lastSessionSets: sets({ reps: 10, rir: 2 }),
        recoveryStatus: "priority",
      }),
    );

    expect(result.action).toBe("HOLD");
    expect(result.gated).toBe(true);
    expect(result.suggestedWeightKg).toBeNull();
  });

  it("holds progression when training load is red, even with good performance", () => {
    const result = computeExerciseProgression(
      input({
        lastSessionSets: sets({ reps: 10, rir: 2 }),
        trainingLoadState: "red",
      }),
    );

    expect(result.action).toBe("HOLD");
    expect(result.gated).toBe(true);
  });
});

describe("computeExerciseProgression — pain flag safety gate", () => {
  it("never suggests a load increase when a pain flag is present, even with otherwise-positive performance", () => {
    const result = computeExerciseProgression(
      input({
        lastSessionSets: sets({ reps: 10, rir: 3 }),
        recentPainFlag: true,
        recoveryStatus: "ready",
        trainingLoadState: "green",
      }),
    );

    expect(result.action).not.toBe("INCREASE_LOAD");
    expect(result.action).toBe("HOLD");
    expect(result.gated).toBe(true);
    expect(result.suggestedWeightKg).toBeNull();
  });

  it("pain flag takes priority even when every safety-unrelated signal points to increasing load", () => {
    const withoutPain = computeExerciseProgression(
      input({ lastSessionSets: sets({ reps: 10, rir: 2 }), recentPainFlag: false }),
    );
    const withPain = computeExerciseProgression(
      input({ lastSessionSets: sets({ reps: 10, rir: 2 }), recentPainFlag: true }),
    );

    expect(withoutPain.action).toBe("INCREASE_LOAD");
    expect(withPain.action).toBe("HOLD");
  });
});

describe("computeExerciseProgression — edge cases / missing data", () => {
  it("returns INSUFFICIENT_DATA when no completed sets have recorded weight and reps", () => {
    const result = computeExerciseProgression(
      input({
        lastSessionSets: [
          { weightKg: null, reps: null, rir: null, completed: false },
        ],
      }),
    );

    expect(result.action).toBe("INSUFFICIENT_DATA");
    expect(result.suggestedWeightKg).toBeNull();
  });

  it("returns INSUFFICIENT_DATA for an empty session", () => {
    const result = computeExerciseProgression(input({ lastSessionSets: [] }));

    expect(result.action).toBe("INSUFFICIENT_DATA");
  });

  it("ignores incomplete sets when judging readiness to progress", () => {
    const result = computeExerciseProgression(
      input({
        lastSessionSets: [
          ...sets({ reps: 10, rir: 2 }, 3),
          { weightKg: 60, reps: 4, rir: 5, completed: false },
        ],
      }),
    );

    expect(result.action).toBe("INCREASE_LOAD");
  });

  it("does not crash and returns a fixed action when target rep range data is degenerate", () => {
    const result = computeExerciseProgression(
      input({ targetRepMin: 8, targetRepMax: 8, lastSessionSets: sets({ reps: 8, rir: 2 }) }),
    );

    expect(["INCREASE_LOAD", "HOLD", "DECREASE_LOAD", "INSUFFICIENT_DATA"]).toContain(
      result.action,
    );
  });
});
