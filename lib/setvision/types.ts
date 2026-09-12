import type { Landmark, PoseFrame } from "@/lib/form-coach/types";

/**
 * SetVision shared types (spec Part B).
 *
 * Reuses lib/form-coach/types.ts's `PoseFrame`/`Landmark` — same
 * MoveNet/COCO-17 keypoint format already used by the live Form Coach
 * camera, so a frame produced anywhere in the app (live webcam or an
 * uploaded video's <video> element run through the same
 * lib/ai.ts::loadPoseDetector()) is directly usable here without
 * conversion.
 */

export type { Landmark, PoseFrame };

export type SetVisionExerciseId = "bench_press" | "squat" | "deadlift";

export const SETVISION_EXERCISES: SetVisionExerciseId[] = [
  "bench_press",
  "squat",
  "deadlift",
];

export type RepPhase = "top" | "descent" | "bottom" | "ascent";

/** One pose observation with its capture time, in milliseconds from the start of the video/session. */
export type TimedPoseFrame = {
  timestampMs: number;
  frame: PoseFrame;
};

/* =========================================================
   EXERCISE CLASSIFICATION
========================================================= */

export type ExerciseClassification = {
  exercise: SetVisionExerciseId | null;
  confidence: number;
  /** Short, human-readable notes on what drove the classification — never opaque. */
  signals: string[];
};

/* =========================================================
   REP SEGMENTATION
========================================================= */

export type CompletedRep = {
  repNumber: number;
  /** Timestamp (ms) the descent phase started — i.e. the rep's "top". */
  topAtMs: number;
  bottomAtMs: number;
  ascentStartAtMs: number;
  ascentEndAtMs: number;
  minAngleDeg: number;
  maxAngleDeg: number;
  /** Bar-proxy landmark position at the moment of minAngleDeg (bottom of the rep). */
  bottomBarProxy: Landmark | null;
  /** Full pose frame at the bottom transition, so per-side asymmetry can be computed generically without the state machine knowing exercise-specific joint pairs. */
  bottomFrame: PoseFrame | null;
  /** Bar-proxy landmark position at ascent start and ascent end, for velocity/bar-path. */
  barProxyTrack: Array<{ timestampMs: number; landmark: Landmark }>;
};

export type RepStateMachineResult = {
  phase: RepPhase;
  repCount: number;
  lastCompletedRep: CompletedRep | null;
  visible: boolean;
};

/* =========================================================
   ROM / TEMPO / VELOCITY / BAR PATH / TECHNIQUE
========================================================= */

export type RepRom = {
  repNumber: number;
  /** 0-100+. Can exceed 100 if the lifter's ROM exceeded the reference range (e.g. very mobile lifter) — not clamped, so it stays honest. */
  romPercent: number;
};

export type RepTempo = {
  repNumber: number;
  eccentricSec: number;
  pauseSec: number;
  concentricSec: number;
};

export type RepVelocity = {
  repNumber: number;
  /** Concentric-phase mean speed, in the units described by `calibrated`/`unit`. */
  meanSpeed: number;
};

export type VelocityResult = {
  calibrated: boolean;
  /** "m/s" only when calibrated is true; otherwise a normalized, dimensionless unit ("torso-lengths/s"). */
  unit: "m/s" | "torso-lengths/s";
  perRep: RepVelocity[];
  mean: number | null;
  peak: number | null;
  final: number | null;
  /** 0-1 fraction. Null when fewer than 2 reps have a valid velocity. */
  velocityLoss: number | null;
};

export type TechniqueConsistency = {
  romConsistency: number | null;
  tempoConsistency: number | null;
  barPathConsistency: number | null;
  /**
   * Average left/right knee-angle difference at each rep's bottom
   * position, in degrees. Only computed for squat (spec §20's
   * "left/right asymmetry when reliable") — null for bench/deadlift
   * in this pass; see docs/setvision.md limitations.
   */
  asymmetryDeg: number | null;
};

/* =========================================================
   FINAL OUTPUT SCHEMA (spec Part B §21)
========================================================= */

export type SetVisionAnalysis = {
  exercise: SetVisionExerciseId;
  exerciseClassification: ExerciseClassification;
  reps: number;
  romConsistency: number | null;
  averageEccentricTime: number | null;
  averageConcentricTime: number | null;
  velocity: VelocityResult;
  technique: TechniqueConsistency;
  confidence: number;
  /** Per-rep detail, for the analysis UI and the ground-truth benchmarking tool — not part of the spec's summary example, but needed to render anything useful. */
  perRep: {
    rom: RepRom[];
    tempo: RepTempo[];
  };
  /** Honest limitations of THIS analysis run (e.g. low visibility frames dropped, too few reps for consistency). */
  limitations: string[];
};
