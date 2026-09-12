import type { HawkerDishId, HawkerLensResult } from "@/lib/hawkerlens/types";

/**
 * HawkerLens benchmarking types (spec Part A §12).
 *
 * SAME RULE as SetVision's benchmark module: nothing here is a claim
 * about real-world accuracy. No labeled Singapore-hawker-food photo
 * dataset exists in this project. This is the measurement framework,
 * tested only against synthetic data (see __tests__/) — running it
 * against real annotated photos is future work.
 *
 * HONEST LIMITATION, stated once: the spec asks for segmentation
 * "IoU / Dice", which conventionally means pixel-mask overlap.
 * HawkerLens's component segmentation (vision.ts) is NAME-based, not
 * pixel-mask-based — it identifies "rice", "chicken", etc. as a list,
 * not spatial regions. `compareSegmentation` below computes Dice/
 * Jaccard over the SET of identified component names instead, which
 * is a legitimate proxy for "did it find the right components" but
 * is NOT pixel-level IoU. If real spatial segmentation is added
 * later, this function should be replaced, not repurposed.
 */

export type HawkerGroundTruthAnnotation = {
  photoId: string;
  dish: HawkerDishId;
  components: Array<{ name: string; grams: number }>;
  totalCalories?: number;
  totalProtein?: number;
  annotatedBy: string;
  annotatedAt: string;
};

export type DishClassificationBenchmarkResult = {
  photoId: string;
  groundTruthDish: HawkerDishId;
  predictedDish: HawkerDishId | null;
  correct: boolean;
};

export type HawkerConfusionMatrix = Record<
  HawkerDishId,
  Record<HawkerDishId | "unclassified", number>
>;

export type SegmentationBenchmarkResult = {
  photoId: string;
  /** Set-overlap Dice coefficient over component names — see the module docstring above. Null if ground truth has no components. */
  dice: number | null;
  jaccard: number | null;
};

export type PortionBenchmarkResult = {
  photoId: string;
  meanAbsoluteErrorGrams: number | null;
  sampleSize: number;
};

export type NutrientBenchmarkResult = {
  photoId: string;
  absoluteError: number | null;
  /** Mean Absolute Percentage Error — null when ground truth is 0 (division undefined). */
  percentageError: number | null;
};

export type CalibrationBucket = {
  confidenceRangeLabel: string;
  predictedAverageConfidence: number;
  actualAccuracy: number;
  sampleSize: number;
};

export type CalibrationResult = {
  buckets: CalibrationBucket[];
  /** Expected Calibration Error — weighted average |confidence - accuracy| across buckets. */
  expectedCalibrationError: number | null;
};

export type HawkerLensBenchmarkSummary = {
  classification: DishClassificationBenchmarkResult[];
  confusionMatrix: HawkerConfusionMatrix;
  segmentation: SegmentationBenchmarkResult[];
  portion: PortionBenchmarkResult[];
  calories: NutrientBenchmarkResult[];
  protein: NutrientBenchmarkResult[];
  calibration: CalibrationResult;
  sampleSize: number;
};

export type BenchmarkEntry = {
  photoId: string;
  groundTruth: HawkerGroundTruthAnnotation;
  result: HawkerLensResult;
};
