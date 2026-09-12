import { SETVISION_EXERCISES } from "@/lib/setvision/types";
import type { SetVisionAnalysis, SetVisionExerciseId } from "@/lib/setvision/types";
import type {
  BenchmarkSummary,
  ClassificationBenchmarkResult,
  ConfusionMatrix,
  GroundTruthAnnotation,
  LatencyMeasurement,
  RepCountBenchmarkResult,
  RomBenchmarkResult,
  VelocityBenchmarkResult,
} from "@/lib/setvision/benchmark/types";

/**
 * Benchmark comparison functions (spec Part B §23).
 *
 * Every function here is a pure comparison between one
 * GroundTruthAnnotation and one SetVisionAnalysis — this module
 * itself never runs the analyzer or invents a ground truth. Callers
 * (a future test harness pointed at a real labeled video set) supply
 * both sides.
 */

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function compareRepCount(
  videoId: string,
  groundTruth: GroundTruthAnnotation,
  analysis: SetVisionAnalysis,
): RepCountBenchmarkResult {
  const groundTruthReps = groundTruth.repBoundariesMs.length;
  const predictedReps = analysis.reps;

  return {
    videoId,
    groundTruthReps,
    predictedReps,
    absoluteError: Math.abs(predictedReps - groundTruthReps),
    exact: predictedReps === groundTruthReps,
  };
}

export function compareClassification(
  videoId: string,
  groundTruth: GroundTruthAnnotation,
  analysis: SetVisionAnalysis,
): ClassificationBenchmarkResult {
  const predictedExercise = analysis.exerciseClassification.exercise;

  return {
    videoId,
    groundTruthExercise: groundTruth.exercise,
    predictedExercise,
    correct: predictedExercise === groundTruth.exercise,
  };
}

function emptyConfusionMatrix(): ConfusionMatrix {
  const matrix = {} as ConfusionMatrix;

  for (const actual of SETVISION_EXERCISES) {
    matrix[actual] = {
      bench_press: 0,
      squat: 0,
      deadlift: 0,
      unclassified: 0,
    };
  }

  return matrix;
}

export function buildConfusionMatrix(
  results: ClassificationBenchmarkResult[],
): ConfusionMatrix {
  const matrix = emptyConfusionMatrix();

  for (const result of results) {
    const predictedKey: SetVisionExerciseId | "unclassified" =
      result.predictedExercise ?? "unclassified";

    matrix[result.groundTruthExercise][predictedKey] += 1;
  }

  return matrix;
}

/**
 * ROM comparison, matched rep-by-rep in order. Returns null MAE (not
 * 0) when no ground-truth ROM labels exist — a missing label is not
 * the same as a perfect match.
 */
export function compareRom(
  videoId: string,
  groundTruth: GroundTruthAnnotation,
  analysis: SetVisionAnalysis,
): RomBenchmarkResult {
  if (!groundTruth.romPercentByRep || groundTruth.romPercentByRep.length === 0) {
    return { videoId, meanAbsoluteErrorPercent: null, sampleSize: 0 };
  }

  const sampleSize = Math.min(
    groundTruth.romPercentByRep.length,
    analysis.perRep.rom.length,
  );

  if (sampleSize === 0) {
    return { videoId, meanAbsoluteErrorPercent: null, sampleSize: 0 };
  }

  let totalError = 0;

  for (let i = 0; i < sampleSize; i += 1) {
    totalError += Math.abs(
      analysis.perRep.rom[i].romPercent - groundTruth.romPercentByRep[i],
    );
  }

  return {
    videoId,
    meanAbsoluteErrorPercent: round(totalError / sampleSize),
    sampleSize,
  };
}

/**
 * Velocity comparison — ONLY meaningful when the analysis was
 * calibrated to real m/s. Comparing a normalized torso-lengths/s
 * value against an m/s ground truth would be a meaningless number
 * dressed up as an error metric, so this explicitly refuses to do it.
 */
export function compareVelocity(
  videoId: string,
  groundTruth: GroundTruthAnnotation,
  analysis: SetVisionAnalysis,
): VelocityBenchmarkResult {
  if (
    !analysis.velocity.calibrated ||
    !groundTruth.velocityMpsByRep ||
    groundTruth.velocityMpsByRep.length === 0
  ) {
    return { videoId, meanAbsoluteErrorMps: null, sampleSize: 0 };
  }

  const sampleSize = Math.min(
    groundTruth.velocityMpsByRep.length,
    analysis.velocity.perRep.length,
  );

  if (sampleSize === 0) {
    return { videoId, meanAbsoluteErrorMps: null, sampleSize: 0 };
  }

  let totalError = 0;

  for (let i = 0; i < sampleSize; i += 1) {
    totalError += Math.abs(
      analysis.velocity.perRep[i].meanSpeed - groundTruth.velocityMpsByRep[i],
    );
  }

  return {
    videoId,
    meanAbsoluteErrorMps: round(totalError / sampleSize),
    sampleSize,
  };
}

/**
 * Latency measurement — timed by the CALLER around the actual
 * frame-processing loop (this function just structures the numbers).
 * See components/setvision/video-analyzer.tsx for where this is
 * measured against real pose-detection frames.
 */
export function measureLatency(
  videoId: string,
  frameCount: number,
  totalProcessingMs: number,
): LatencyMeasurement {
  return {
    videoId,
    frameCount,
    totalProcessingMs,
    averageMsPerFrame: frameCount > 0 ? round(totalProcessingMs / frameCount) : 0,
    effectiveFps:
      frameCount > 0 && totalProcessingMs > 0
        ? round((frameCount / totalProcessingMs) * 1000)
        : 0,
  };
}

export function summarizeBenchmark(
  entries: Array<{
    videoId: string;
    groundTruth: GroundTruthAnnotation;
    analysis: SetVisionAnalysis;
    latency?: LatencyMeasurement;
  }>,
): BenchmarkSummary {
  const repCount = entries.map((e) => compareRepCount(e.videoId, e.groundTruth, e.analysis));
  const classification = entries.map((e) =>
    compareClassification(e.videoId, e.groundTruth, e.analysis),
  );
  const rom = entries.map((e) => compareRom(e.videoId, e.groundTruth, e.analysis));
  const velocity = entries.map((e) => compareVelocity(e.videoId, e.groundTruth, e.analysis));
  const latency = entries
    .map((e) => e.latency)
    .filter((l): l is LatencyMeasurement => l !== undefined);

  return {
    repCount,
    classification,
    confusionMatrix: buildConfusionMatrix(classification),
    rom,
    velocity,
    latency,
    sampleSize: entries.length,
  };
}
