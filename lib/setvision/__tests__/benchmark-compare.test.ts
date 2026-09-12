import { describe, expect, it } from "vitest";
import { analyzeFrameSequence } from "@/lib/setvision/analyze";
import {
  buildConfusionMatrix,
  compareClassification,
  compareRepCount,
  compareRom,
  compareVelocity,
  measureLatency,
  summarizeBenchmark,
} from "@/lib/setvision/benchmark/compare";
import type { GroundTruthAnnotation } from "@/lib/setvision/benchmark/types";
import { buildRepSequence, squatFrame } from "@/lib/setvision/__tests__/fixtures";

/**
 * These tests validate the BENCHMARKING FRAMEWORK ITSELF against
 * synthetic data — they are not, and must never be read as, a claim
 * about SetVision's real-world accuracy. No real labeled video
 * dataset exists in this project yet (see benchmark/types.ts).
 */

function syntheticGroundTruth(
  overrides: Partial<GroundTruthAnnotation> = {},
): GroundTruthAnnotation {
  return {
    videoId: "synthetic-1",
    exercise: "squat",
    repBoundariesMs: [
      { startMs: 0, endMs: 1000 },
      { startMs: 1000, endMs: 2000 },
      { startMs: 2000, endMs: 3000 },
    ],
    annotatedBy: "test-fixture",
    annotatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("compareRepCount", () => {
  it("reports zero error when the analyzer matches the annotated rep count", () => {
    const analysis = analyzeFrameSequence(buildRepSequence(squatFrame, 3));
    const groundTruth = syntheticGroundTruth();

    const result = compareRepCount("synthetic-1", groundTruth, analysis);

    expect(result.groundTruthReps).toBe(3);
    expect(result.predictedReps).toBe(3);
    expect(result.absoluteError).toBe(0);
    expect(result.exact).toBe(true);
  });

  it("reports a nonzero error when the analyzer under/over-counts", () => {
    const analysis = analyzeFrameSequence(buildRepSequence(squatFrame, 2));
    const groundTruth = syntheticGroundTruth(); // annotated as 3 reps

    const result = compareRepCount("synthetic-1", groundTruth, analysis);

    expect(result.absoluteError).toBe(1);
    expect(result.exact).toBe(false);
  });
});

describe("compareClassification + confusion matrix", () => {
  it("marks a correct classification and builds a confusion matrix", () => {
    const analysis = analyzeFrameSequence(buildRepSequence(squatFrame, 3));
    const groundTruth = syntheticGroundTruth({ exercise: "squat" });

    const result = compareClassification("synthetic-1", groundTruth, analysis);
    expect(result.correct).toBe(true);

    const matrix = buildConfusionMatrix([result]);
    expect(matrix.squat.squat).toBe(1);
    expect(matrix.squat.bench_press).toBe(0);
  });

  it("marks a misclassification against the wrong ground-truth exercise", () => {
    const analysis = analyzeFrameSequence(buildRepSequence(squatFrame, 3));
    const groundTruth = syntheticGroundTruth({ exercise: "deadlift" });

    const result = compareClassification("synthetic-1", groundTruth, analysis);
    expect(result.correct).toBe(false);

    const matrix = buildConfusionMatrix([result]);
    expect(matrix.deadlift.squat).toBe(1);
  });
});

describe("compareRom", () => {
  it("returns null (not zero) when no ground-truth ROM labels exist", () => {
    const analysis = analyzeFrameSequence(buildRepSequence(squatFrame, 3));
    const result = compareRom("synthetic-1", syntheticGroundTruth(), analysis);

    expect(result.meanAbsoluteErrorPercent).toBeNull();
    expect(result.sampleSize).toBe(0);
  });

  it("computes mean absolute error when ROM labels are provided", () => {
    const analysis = analyzeFrameSequence(buildRepSequence(squatFrame, 3));
    const predictedRoms = analysis.perRep.rom.map((r) => r.romPercent);

    // Ground truth intentionally offset by a known, fixed amount so
    // the resulting MAE is verifiable, not just "some number".
    const groundTruth = syntheticGroundTruth({
      romPercentByRep: predictedRoms.map((v) => v - 5),
    });

    const result = compareRom("synthetic-1", groundTruth, analysis);

    expect(result.meanAbsoluteErrorPercent).toBe(5);
    expect(result.sampleSize).toBe(3);
  });
});

describe("compareVelocity", () => {
  it("refuses to compare an uncalibrated (normalized) result against an m/s ground truth", () => {
    const analysis = analyzeFrameSequence(buildRepSequence(squatFrame, 3));
    expect(analysis.velocity.calibrated).toBe(false);

    const groundTruth = syntheticGroundTruth({ velocityMpsByRep: [0.5, 0.45, 0.4] });
    const result = compareVelocity("synthetic-1", groundTruth, analysis);

    expect(result.meanAbsoluteErrorMps).toBeNull();
  });

  it("computes MAE when the analysis is calibrated and ground truth exists", () => {
    const frames = buildRepSequence(squatFrame, 3);
    const analysis = analyzeFrameSequence(frames, { metersPerTorsoLength: 0.6 });
    expect(analysis.velocity.calibrated).toBe(true);

    const groundTruth = syntheticGroundTruth({
      velocityMpsByRep: analysis.velocity.perRep.map((r) => r.meanSpeed + 0.1),
    });

    const result = compareVelocity("synthetic-1", groundTruth, analysis);

    expect(result.meanAbsoluteErrorMps).toBeCloseTo(0.1, 5);
  });
});

describe("measureLatency", () => {
  it("computes average ms/frame and effective fps", () => {
    const result = measureLatency("synthetic-1", 100, 2000);

    expect(result.averageMsPerFrame).toBe(20);
    expect(result.effectiveFps).toBe(50);
  });

  it("degrades gracefully with zero frames", () => {
    const result = measureLatency("synthetic-1", 0, 0);
    expect(result.averageMsPerFrame).toBe(0);
    expect(result.effectiveFps).toBe(0);
  });
});

describe("summarizeBenchmark", () => {
  it("aggregates multiple videos into one summary", () => {
    const analysis = analyzeFrameSequence(buildRepSequence(squatFrame, 3));

    const summary = summarizeBenchmark([
      { videoId: "v1", groundTruth: syntheticGroundTruth(), analysis },
      { videoId: "v2", groundTruth: syntheticGroundTruth({ exercise: "deadlift" }), analysis },
    ]);

    expect(summary.sampleSize).toBe(2);
    expect(summary.repCount).toHaveLength(2);
    expect(summary.classification).toHaveLength(2);
    expect(summary.confusionMatrix.squat.squat).toBe(1);
    expect(summary.confusionMatrix.deadlift.squat).toBe(1);
  });
});
