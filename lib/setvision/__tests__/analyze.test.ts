import { describe, expect, it } from "vitest";
import { analyzeFrameSequence } from "@/lib/setvision/analyze";
import { benchFrame, buildRepSequence, squatFrame } from "@/lib/setvision/__tests__/fixtures";

describe("analyzeFrameSequence", () => {
  it("produces a complete, schema-shaped analysis for a clean squat sequence", () => {
    const frames = buildRepSequence(squatFrame, 4);
    const result = analyzeFrameSequence(frames);

    expect(result.exercise).toBe("squat");
    expect(result.reps).toBe(4);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.romConsistency).not.toBeNull();
    expect(result.averageEccentricTime).not.toBeNull();
    expect(result.averageConcentricTime).not.toBeNull();
    expect(result.velocity.unit).toBe("torso-lengths/s");
    expect(result.velocity.calibrated).toBe(false);
    expect(result.perRep.rom).toHaveLength(4);
    expect(result.perRep.tempo).toHaveLength(4);
    expect(result.technique.romConsistency).not.toBeNull();
  });

  it("respects an explicitly provided exercise instead of auto-classifying", () => {
    const frames = buildRepSequence(benchFrame, 2);
    const result = analyzeFrameSequence(frames, { exercise: "bench_press" });

    expect(result.exercise).toBe("bench_press");
    expect(result.exerciseClassification.confidence).toBe(1);
    expect(result.reps).toBe(2);
  });

  it("never fabricates results for an empty frame sequence", () => {
    const result = analyzeFrameSequence([]);

    expect(result.reps).toBe(0);
    expect(result.confidence).toBe(0);
    expect(result.limitations.length).toBeGreaterThan(0);
    expect(result.velocity.perRep).toHaveLength(0);
  });

  it("flags low visibility and low rep count as limitations rather than hiding them", () => {
    const frames = buildRepSequence(squatFrame, 1);
    const result = analyzeFrameSequence(frames);

    expect(result.limitations.some((l) => l.toLowerCase().includes("rep"))).toBe(true);
  });

  it("degrades gracefully when the exercise cannot be classified and none is specified", () => {
    const result = analyzeFrameSequence([
      { timestampMs: 0, frame: {} },
      { timestampMs: 50, frame: {} },
    ]);

    expect(result.reps).toBe(0);
    expect(result.confidence).toBe(0);
    expect(result.limitations[0]).toContain("classify");
  });

  it("converts velocity to real m/s only when a calibration factor is supplied", () => {
    const frames = buildRepSequence(squatFrame, 3);
    const uncalibrated = analyzeFrameSequence(frames);
    const calibrated = analyzeFrameSequence(frames, { metersPerTorsoLength: 0.6 });

    expect(uncalibrated.velocity.calibrated).toBe(false);
    expect(uncalibrated.velocity.unit).toBe("torso-lengths/s");
    expect(calibrated.velocity.calibrated).toBe(true);
    expect(calibrated.velocity.unit).toBe("m/s");
  });
});
