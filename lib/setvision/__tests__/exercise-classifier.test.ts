import { describe, expect, it } from "vitest";
import { classifyExercise } from "@/lib/setvision/exercise-classifier";
import { benchFrame, buildRepSequence, deadliftFrame, squatFrame } from "@/lib/setvision/__tests__/fixtures";

describe("classifyExercise", () => {
  it("classifies a squat sequence correctly", () => {
    const frames = buildRepSequence(squatFrame, 2).map((f) => f.frame);
    const result = classifyExercise(frames);

    expect(result.exercise).toBe("squat");
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.signals.length).toBeGreaterThan(0);
  });

  it("classifies a bench press sequence correctly", () => {
    const frames = buildRepSequence(benchFrame, 2).map((f) => f.frame);
    const result = classifyExercise(frames);

    expect(result.exercise).toBe("bench_press");
  });

  it("classifies a deadlift that starts from the floor (hip-flexed) correctly", () => {
    // Unlike squat/bench, a deadlift sequence realistically starts
    // from the bottom (bar on the floor), not standing.
    const frames: ReturnType<typeof deadliftFrame>[] = [];
    for (let i = 0; i < 6; i += 1) frames.push(deadliftFrame(1));
    for (let i = 10; i >= 0; i -= 1) frames.push(deadliftFrame(i / 10));
    for (let i = 0; i < 6; i += 1) frames.push(deadliftFrame(0));

    const result = classifyExercise(frames);

    expect(result.exercise).toBe("deadlift");
  });

  it("returns null with low confidence when there are too few usable frames", () => {
    const result = classifyExercise([squatFrame(0), squatFrame(0.5)]);

    expect(result.exercise).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it("returns null on completely empty input", () => {
    const result = classifyExercise([]);
    expect(result.exercise).toBeNull();
  });
});
