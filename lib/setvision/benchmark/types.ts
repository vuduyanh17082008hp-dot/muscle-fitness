import type { SetVisionExerciseId } from "@/lib/setvision/types";

/**
 * Benchmarking framework types (spec Part B §23-24).
 *
 * IMPORTANT, stated once here rather than repeated everywhere: this
 * project has NOT been run against a real labeled video dataset.
 * Nothing in this module or docs/setvision.md should ever be read as
 * "SetVision achieves X% accuracy" — that claim would be fabricated.
 * What exists is the measurement framework itself (this file +
 * compare.ts) plus the manual annotation tool
 * (components/setvision/ground-truth-annotator.tsx) needed to START
 * building a real labeled dataset. Benchmark numbers only become
 * meaningful once that dataset exists and this framework is run
 * against it — do that before quoting any accuracy figure anywhere.
 */

export type GroundTruthAnnotation = {
  videoId: string;
  exercise: SetVisionExerciseId;
  /** Ground-truth rep boundaries, one entry per completed rep, as {startMs, endMs} in the source video's timeline. */
  repBoundariesMs: Array<{ startMs: number; endMs: number }>;
  /** Optional: a human-labeled ROM percent per rep (subjective, but a usable reference point until better instrumentation exists). */
  romPercentByRep?: number[];
  /** Optional: a known reference velocity per rep in m/s, e.g. from a linear position transducer or a properly calibrated video. */
  velocityMpsByRep?: number[];
  annotatedBy: string;
  annotatedAt: string;
};

export type RepCountBenchmarkResult = {
  videoId: string;
  groundTruthReps: number;
  predictedReps: number;
  absoluteError: number;
  /** true only when predicted === ground truth. */
  exact: boolean;
};

export type ClassificationBenchmarkResult = {
  videoId: string;
  groundTruthExercise: SetVisionExerciseId;
  predictedExercise: SetVisionExerciseId | null;
  correct: boolean;
};

export type ConfusionMatrix = Record<
  SetVisionExerciseId,
  Record<SetVisionExerciseId | "unclassified", number>
>;

export type RomBenchmarkResult = {
  videoId: string;
  /** Mean absolute error between predicted and ground-truth romPercent, across matched reps. Null if no ground-truth ROM labels were provided. */
  meanAbsoluteErrorPercent: number | null;
  sampleSize: number;
};

export type VelocityBenchmarkResult = {
  videoId: string;
  /** Only meaningful when the analysis was calibrated (real m/s) — comparing normalized torso-lengths/s against a real m/s ground truth would be meaningless and this returns null in that case. */
  meanAbsoluteErrorMps: number | null;
  sampleSize: number;
};

export type LatencyMeasurement = {
  videoId: string;
  frameCount: number;
  totalProcessingMs: number;
  averageMsPerFrame: number;
  effectiveFps: number;
};

export type BenchmarkSummary = {
  repCount: RepCountBenchmarkResult[];
  classification: ClassificationBenchmarkResult[];
  confusionMatrix: ConfusionMatrix;
  rom: RomBenchmarkResult[];
  velocity: VelocityBenchmarkResult[];
  latency: LatencyMeasurement[];
  /** Total videos included in this benchmark run. */
  sampleSize: number;
};
