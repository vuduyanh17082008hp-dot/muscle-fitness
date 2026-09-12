import { describe, expect, it } from "vitest";
import { angleAt, getBestSide, inclinationFromVertical } from "@/lib/form-coach/geometry";
import { getExerciseConfig } from "@/lib/setvision/exercise-config";
import { createRepStateMachine } from "@/lib/setvision/rep-state-machine";
import { benchFrame, buildRepSequence, deadliftFrame, squatFrame } from "@/lib/setvision/__tests__/fixtures";

describe("fixture sanity checks", () => {
  it("squatFrame(0) reads as a straight leg and squatFrame(1) as deeply bent", () => {
    const top = squatFrame(0);
    const bottom = squatFrame(1);

    const topAngle = angleAt(getBestSide(top, "hip")!, getBestSide(top, "knee")!, getBestSide(top, "ankle")!);
    const bottomAngle = angleAt(
      getBestSide(bottom, "hip")!,
      getBestSide(bottom, "knee")!,
      getBestSide(bottom, "ankle")!,
    );

    expect(topAngle).toBeGreaterThan(160);
    expect(bottomAngle).toBeLessThan(90);
  });

  it("benchFrame reads as a near-horizontal torso", () => {
    const frame = benchFrame(0);
    const inclination = inclinationFromVertical(
      getBestSide(frame, "hip")!,
      getBestSide(frame, "shoulder")!,
    );

    expect(inclination).toBeGreaterThan(55);
  });

  it("deadliftFrame(0) starts more upright than deadliftFrame(1)", () => {
    const top = deadliftFrame(0);
    const bottom = deadliftFrame(1);

    const topHipAngle = angleAt(
      getBestSide(top, "shoulder")!,
      getBestSide(top, "hip")!,
      getBestSide(top, "knee")!,
    );
    const bottomHipAngle = angleAt(
      getBestSide(bottom, "shoulder")!,
      getBestSide(bottom, "hip")!,
      getBestSide(bottom, "knee")!,
    );

    expect(topHipAngle).toBeGreaterThan(bottomHipAngle);
  });
});

describe("createRepStateMachine — squat", () => {
  it("counts 3 clean reps from a synthetic descent/ascent sequence", () => {
    const machine = createRepStateMachine(getExerciseConfig("squat"));
    const frames = buildRepSequence(squatFrame, 3);

    let finalCount = 0;
    let completedCount = 0;

    for (const timedFrame of frames) {
      const result = machine.processFrame(timedFrame);
      finalCount = result.repCount;
      if (result.lastCompletedRep) completedCount += 1;
    }

    expect(finalCount).toBe(3);
    expect(completedCount).toBe(3);
  });

  it("does not count a partial descent that returns to top without reaching bottom", () => {
    const machine = createRepStateMachine(getExerciseConfig("squat"));

    let t = 0;
    const step = (depth: number) => {
      const result = machine.processFrame({ timestampMs: t, frame: squatFrame(depth) });
      t += 50;
      return result;
    };

    for (let i = 0; i < 5; i += 1) step(0);
    // Only descend halfway (not below the bottom threshold), then return.
    for (let i = 1; i <= 5; i += 1) step(i / 10);
    for (let i = 4; i >= 0; i -= 1) step(i / 10);
    for (let i = 0; i < 5; i += 1) step(0);

    const finalResult = step(0);

    expect(finalResult.repCount).toBe(0);
  });

  it("resets cleanly", () => {
    const machine = createRepStateMachine(getExerciseConfig("squat"));
    const frames = buildRepSequence(squatFrame, 2);

    for (const timedFrame of frames) machine.processFrame(timedFrame);

    machine.reset();

    const result = machine.processFrame({ timestampMs: 0, frame: squatFrame(0) });
    expect(result.repCount).toBe(0);
    expect(result.phase).toBe("top");
  });

  it("returns visible: false and does not crash on an empty/occluded frame", () => {
    const machine = createRepStateMachine(getExerciseConfig("squat"));
    const result = machine.processFrame({ timestampMs: 0, frame: {} });

    expect(result.visible).toBe(false);
    expect(result.repCount).toBe(0);
  });

  it("captures per-rep timing consistent with the phase transitions", () => {
    const machine = createRepStateMachine(getExerciseConfig("squat"));
    const frames = buildRepSequence(squatFrame, 1);

    let completedRep = null;

    for (const timedFrame of frames) {
      const result = machine.processFrame(timedFrame);
      if (result.lastCompletedRep) completedRep = result.lastCompletedRep;
    }

    expect(completedRep).not.toBeNull();
    expect(completedRep!.bottomAtMs).toBeGreaterThan(completedRep!.topAtMs);
    expect(completedRep!.ascentStartAtMs).toBeGreaterThanOrEqual(completedRep!.bottomAtMs);
    expect(completedRep!.ascentEndAtMs).toBeGreaterThan(completedRep!.ascentStartAtMs);
    expect(completedRep!.bottomFrame).not.toBeNull();
  });
});

describe("createRepStateMachine — bench press", () => {
  it("counts reps using the elbow angle instead of the knee angle", () => {
    const machine = createRepStateMachine(getExerciseConfig("bench_press"));
    const frames = buildRepSequence(benchFrame, 2);

    let finalCount = 0;

    for (const timedFrame of frames) {
      finalCount = machine.processFrame(timedFrame).repCount;
    }

    expect(finalCount).toBe(2);
  });
});

describe("createRepStateMachine — deadlift", () => {
  it("counts reps using the hip angle", () => {
    const machine = createRepStateMachine(getExerciseConfig("deadlift"));
    const frames = buildRepSequence(deadliftFrame, 2);

    let finalCount = 0;

    for (const timedFrame of frames) {
      finalCount = machine.processFrame(timedFrame).repCount;
    }

    expect(finalCount).toBe(2);
  });
});
