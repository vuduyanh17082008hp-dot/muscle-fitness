/**
 * SetVision public API (spec Part B §27).
 *
 *   setvision.analyzeWorkoutVideo()  (= analyzeFrameSequence — the video/DOM
 *                                      framing lives in components/setvision/,
 *                                      this module only needs the extracted
 *                                      pose frames)
 *
 * Import from "@/lib/setvision" rather than reaching into individual
 * files, so this stays the actual contract boundary with Dante Core
 * and Muscle Fitness.
 */

export { analyzeFrameSequence as analyzeWorkoutVideo } from "@/lib/setvision/analyze";
export { classifyExercise } from "@/lib/setvision/exercise-classifier";
export { createRepStateMachine } from "@/lib/setvision/rep-state-machine";
export { getExerciseConfig, EXERCISE_CONFIGS } from "@/lib/setvision/exercise-config";
export { computeAllRepRom, computeRomConsistency } from "@/lib/setvision/rom";
export {
  computeAllRepTempo,
  averageEccentricTime,
  averageConcentricTime,
  computeTempoConsistency,
} from "@/lib/setvision/tempo";
export { computeVelocity } from "@/lib/setvision/velocity";
export { computeBarPathConsistency } from "@/lib/setvision/bar-path";
export { computeTechniqueConsistency } from "@/lib/setvision/technique-consistency";
export { averageTorsoLength, estimateTorsoLength } from "@/lib/setvision/normalization";
export {
  compareRepCount,
  compareClassification,
  buildConfusionMatrix,
  compareRom,
  compareVelocity,
  measureLatency,
  summarizeBenchmark,
} from "@/lib/setvision/benchmark/compare";

export type {
  SetVisionExerciseId,
  SetVisionAnalysis,
  ExerciseClassification,
  RepPhase,
  CompletedRep,
  TimedPoseFrame,
  RepRom,
  RepTempo,
  RepVelocity,
  VelocityResult,
  TechniqueConsistency,
  RepStateMachineResult,
} from "@/lib/setvision/types";
export type { ExerciseConfig } from "@/lib/setvision/exercise-config";
export type {
  GroundTruthAnnotation,
  BenchmarkSummary,
  RepCountBenchmarkResult,
  ClassificationBenchmarkResult,
  ConfusionMatrix,
  RomBenchmarkResult,
  VelocityBenchmarkResult,
  LatencyMeasurement,
} from "@/lib/setvision/benchmark/types";
