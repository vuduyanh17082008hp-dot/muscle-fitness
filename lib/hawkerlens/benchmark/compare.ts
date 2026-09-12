import { HAWKER_DISH_IDS } from "@/lib/hawkerlens/types";
import type { HawkerDishId } from "@/lib/hawkerlens/types";
import type {
  BenchmarkEntry,
  CalibrationBucket,
  CalibrationResult,
  DishClassificationBenchmarkResult,
  HawkerConfusionMatrix,
  HawkerLensBenchmarkSummary,
  NutrientBenchmarkResult,
  PortionBenchmarkResult,
  SegmentationBenchmarkResult,
} from "@/lib/hawkerlens/benchmark/types";

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function compareDishClassification(entry: BenchmarkEntry): DishClassificationBenchmarkResult {
  const predictedDish = entry.result.dish;

  return {
    photoId: entry.photoId,
    groundTruthDish: entry.groundTruth.dish,
    predictedDish,
    correct: predictedDish === entry.groundTruth.dish,
  };
}

function emptyConfusionMatrix(): HawkerConfusionMatrix {
  const matrix = {} as HawkerConfusionMatrix;

  for (const actual of HAWKER_DISH_IDS) {
    matrix[actual] = Object.fromEntries([
      ...HAWKER_DISH_IDS.map((id) => [id, 0]),
      ["unclassified", 0],
    ]) as Record<HawkerDishId | "unclassified", number>;
  }

  return matrix;
}

export function buildConfusionMatrix(
  results: DishClassificationBenchmarkResult[],
): HawkerConfusionMatrix {
  const matrix = emptyConfusionMatrix();

  for (const result of results) {
    const key: HawkerDishId | "unclassified" = result.predictedDish ?? "unclassified";
    matrix[result.groundTruthDish][key] += 1;
  }

  return matrix;
}

/**
 * Set-overlap Dice/Jaccard over component NAMES — see
 * benchmark/types.ts's docstring: this is a proxy for pixel-level
 * segmentation IoU, not the real thing, because HawkerLens's
 * segmentation stage is name-based, not spatial.
 */
export function compareSegmentation(entry: BenchmarkEntry): SegmentationBenchmarkResult {
  const groundTruthNames = new Set(
    entry.groundTruth.components.map((c) => c.name.toLowerCase()),
  );
  const predictedNames = new Set(entry.result.components.map((c) => c.name.toLowerCase()));

  if (groundTruthNames.size === 0) {
    return { photoId: entry.photoId, dice: null, jaccard: null };
  }

  let intersection = 0;
  for (const name of predictedNames) {
    if (groundTruthNames.has(name)) intersection += 1;
  }

  const union = new Set([...groundTruthNames, ...predictedNames]).size;
  const dice = (2 * intersection) / (groundTruthNames.size + predictedNames.size || 1);
  const jaccard = union > 0 ? intersection / union : 0;

  return { photoId: entry.photoId, dice: round(dice), jaccard: round(jaccard) };
}

export function comparePortion(entry: BenchmarkEntry): PortionBenchmarkResult {
  const groundTruthByName = new Map(
    entry.groundTruth.components.map((c) => [c.name.toLowerCase(), c.grams]),
  );

  const errors: number[] = [];

  for (const predicted of entry.result.components) {
    const groundTruthGrams = groundTruthByName.get(predicted.name.toLowerCase());
    if (groundTruthGrams !== undefined) {
      errors.push(Math.abs(predicted.estimatedGrams - groundTruthGrams));
    }
  }

  if (errors.length === 0) {
    return { photoId: entry.photoId, meanAbsoluteErrorGrams: null, sampleSize: 0 };
  }

  return {
    photoId: entry.photoId,
    meanAbsoluteErrorGrams: round(errors.reduce((s, v) => s + v, 0) / errors.length),
    sampleSize: errors.length,
  };
}

function compareNutrient(
  photoId: string,
  predicted: number | null,
  groundTruth: number | undefined,
): NutrientBenchmarkResult {
  if (predicted === null || groundTruth === undefined) {
    return { photoId, absoluteError: null, percentageError: null };
  }

  const absoluteError = round(Math.abs(predicted - groundTruth));
  const percentageError = groundTruth !== 0 ? round((absoluteError / groundTruth) * 100) : null;

  return { photoId, absoluteError, percentageError };
}

export function compareCalories(entry: BenchmarkEntry): NutrientBenchmarkResult {
  return compareNutrient(
    entry.photoId,
    entry.result.nutrition?.calories.estimate ?? null,
    entry.groundTruth.totalCalories,
  );
}

export function compareProtein(entry: BenchmarkEntry): NutrientBenchmarkResult {
  return compareNutrient(
    entry.photoId,
    entry.result.nutrition?.protein.estimate ?? null,
    entry.groundTruth.totalProtein,
  );
}

/**
 * Confidence calibration (spec §12 "if feasible") — buckets
 * classification predictions by predicted confidence and compares
 * against actual accuracy in that bucket. Expected Calibration Error
 * is the sample-weighted average |confidence - accuracy|.
 */
export function computeCalibration(
  entries: Array<{ confidence: number; correct: boolean }>,
): CalibrationResult {
  const bucketRanges: Array<[number, number, string]> = [
    [0, 0.5, "0-50%"],
    [0.5, 0.7, "50-70%"],
    [0.7, 0.85, "70-85%"],
    [0.85, 1.01, "85-100%"],
  ];

  const buckets: CalibrationBucket[] = [];
  let weightedErrorSum = 0;
  let totalSamples = 0;

  for (const [min, max, label] of bucketRanges) {
    const inBucket = entries.filter((e) => e.confidence >= min && e.confidence < max);

    if (inBucket.length === 0) continue;

    const predictedAverageConfidence = round(
      inBucket.reduce((s, e) => s + e.confidence, 0) / inBucket.length,
    );
    const actualAccuracy = round(
      inBucket.filter((e) => e.correct).length / inBucket.length,
    );

    buckets.push({
      confidenceRangeLabel: label,
      predictedAverageConfidence,
      actualAccuracy,
      sampleSize: inBucket.length,
    });

    weightedErrorSum += Math.abs(predictedAverageConfidence - actualAccuracy) * inBucket.length;
    totalSamples += inBucket.length;
  }

  return {
    buckets,
    expectedCalibrationError: totalSamples > 0 ? round(weightedErrorSum / totalSamples) : null,
  };
}

export function summarizeHawkerLensBenchmark(
  entries: BenchmarkEntry[],
): HawkerLensBenchmarkSummary {
  const classification = entries.map(compareDishClassification);
  const segmentation = entries.map(compareSegmentation);
  const portion = entries.map(comparePortion);
  const calories = entries.map(compareCalories);
  const protein = entries.map(compareProtein);

  const calibration = computeCalibration(
    classification.map((c, i) => ({
      confidence: entries[i].result.dishClassification.confidence,
      correct: c.correct,
    })),
  );

  return {
    classification,
    confusionMatrix: buildConfusionMatrix(classification),
    segmentation,
    portion,
    calories,
    protein,
    calibration,
    sampleSize: entries.length,
  };
}
