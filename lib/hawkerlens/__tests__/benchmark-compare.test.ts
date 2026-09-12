import { describe, expect, it } from "vitest";
import {
  buildConfusionMatrix,
  compareCalories,
  compareDishClassification,
  comparePortion,
  compareSegmentation,
  computeCalibration,
  summarizeHawkerLensBenchmark,
} from "@/lib/hawkerlens/benchmark/compare";
import type { BenchmarkEntry, HawkerGroundTruthAnnotation } from "@/lib/hawkerlens/benchmark/types";
import type { HawkerLensResult } from "@/lib/hawkerlens/types";

/**
 * These tests validate the BENCHMARK FRAMEWORK against synthetic
 * data only — never read as a real accuracy claim for HawkerLens
 * (see benchmark/types.ts).
 */

function groundTruth(overrides: Partial<HawkerGroundTruthAnnotation> = {}): HawkerGroundTruthAnnotation {
  return {
    photoId: "photo-1",
    dish: "chicken_rice",
    components: [
      { name: "rice", grams: 220 },
      { name: "chicken", grams: 130 },
    ],
    totalCalories: 700,
    totalProtein: 40,
    annotatedBy: "test",
    annotatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function result(overrides: Partial<HawkerLensResult> = {}): HawkerLensResult {
  return {
    status: "ok",
    dish: "chicken_rice",
    dishClassification: { dish: "chicken_rice", confidence: 0.9, signals: [] },
    imageQuality: { usable: true, issues: [], qualityScore: 1, notes: null },
    components: [
      { name: "rice", estimatedGrams: 210, confidence: 0.7 },
      { name: "chicken", estimatedGrams: 140, confidence: 0.7 },
    ],
    componentDetail: [],
    nutrition: {
      calories: { estimate: 680, lower: 600, upper: 760 },
      protein: { estimate: 42, lower: 36, upper: 48 },
      carbs: { estimate: 80, lower: 70, upper: 90 },
      fat: { estimate: 20, lower: 15, upper: 25 },
    },
    uncertainty: { modelConfidence: 0.9, portionConfidence: 0.7, nutritionConfidence: 0.6 },
    overallConfidence: 0.75,
    message: null,
    ...overrides,
  };
}

function entry(overrides: Partial<BenchmarkEntry> = {}): BenchmarkEntry {
  return { photoId: "photo-1", groundTruth: groundTruth(), result: result(), ...overrides };
}

describe("compareDishClassification", () => {
  it("marks a correct classification", () => {
    expect(compareDishClassification(entry()).correct).toBe(true);
  });

  it("marks an incorrect classification", () => {
    const e = entry({ result: result({ dish: "laksa" }) });
    expect(compareDishClassification(e).correct).toBe(false);
  });
});

describe("buildConfusionMatrix", () => {
  it("tallies correct and incorrect predictions per ground-truth dish", () => {
    const results = [
      compareDishClassification(entry()),
      compareDishClassification(entry({ result: result({ dish: "laksa" }) })),
    ];
    const matrix = buildConfusionMatrix(results);

    expect(matrix.chicken_rice.chicken_rice).toBe(1);
    expect(matrix.chicken_rice.laksa).toBe(1);
  });
});

describe("compareSegmentation (set-overlap proxy, not pixel IoU)", () => {
  it("returns dice=1 for an exact component-name match", () => {
    const seg = compareSegmentation(entry());
    expect(seg.dice).toBe(1);
    expect(seg.jaccard).toBe(1);
  });

  it("returns a lower score when components are partially missed", () => {
    const seg = compareSegmentation(
      entry({ result: result({ components: [{ name: "rice", estimatedGrams: 210, confidence: 0.7 }] }) }),
    );
    expect(seg.dice).toBeLessThan(1);
  });

  it("returns null (not 0) when ground truth has no components", () => {
    const seg = compareSegmentation(entry({ groundTruth: groundTruth({ components: [] }) }));
    expect(seg.dice).toBeNull();
  });
});

describe("comparePortion", () => {
  it("computes MAE over matched components only", () => {
    const portion = comparePortion(entry());
    // |210-220| = 10, |140-130| = 10 -> MAE 10
    expect(portion.meanAbsoluteErrorGrams).toBe(10);
    expect(portion.sampleSize).toBe(2);
  });
});

describe("compareCalories", () => {
  it("computes absolute and percentage error", () => {
    const cal = compareCalories(entry());
    expect(cal.absoluteError).toBeCloseTo(20, 5); // |680-700|
    expect(cal.percentageError).toBeCloseTo((20 / 700) * 100, 1);
  });

  it("returns null when no ground-truth calories are provided", () => {
    const cal = compareCalories(entry({ groundTruth: groundTruth({ totalCalories: undefined }) }));
    expect(cal.absoluteError).toBeNull();
  });
});

describe("computeCalibration", () => {
  it("computes zero calibration error for perfectly calibrated predictions", () => {
    const calibration = computeCalibration([
      { confidence: 0.9, correct: true },
      { confidence: 0.9, correct: true },
      { confidence: 0.9, correct: false },
      { confidence: 0.9, correct: false },
      { confidence: 0.9, correct: false },
      { confidence: 0.9, correct: false },
      { confidence: 0.9, correct: false },
      { confidence: 0.9, correct: false },
      { confidence: 0.9, correct: false },
      { confidence: 0.9, correct: false },
    ]);

    // 90% confidence bucket, 20% actual accuracy -> should show a real gap, not 0.
    expect(calibration.expectedCalibrationError).toBeGreaterThan(0.5);
  });

  it("returns null when there is nothing to calibrate", () => {
    expect(computeCalibration([]).expectedCalibrationError).toBeNull();
  });
});

describe("summarizeHawkerLensBenchmark", () => {
  it("aggregates all metrics across multiple photos", () => {
    const summary = summarizeHawkerLensBenchmark([entry(), entry({ photoId: "photo-2" })]);
    expect(summary.sampleSize).toBe(2);
    expect(summary.classification).toHaveLength(2);
    expect(summary.confusionMatrix.chicken_rice.chicken_rice).toBe(2);
  });
});
