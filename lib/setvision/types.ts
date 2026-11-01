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
  /** Uncalibrated heuristic margin in [0, 1], never a probability. Null when nothing was classified (the user chose the exercise). */
  confidence: number | null;
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
  /** False when the rep was already at the bottom when tracking (re)started — its descent and hold were not observed. */
  startObserved: boolean;
  bottomAtMs: number;
  ascentStartAtMs: number;
  ascentEndAtMs: number;
  minAngleDeg: number;
  maxAngleDeg: number;
  /** Bar-proxy landmark position at the moment of minAngleDeg (bottom of the rep). */
  bottomBarProxy: Landmark | null;
  /** Full pose frame at the bottom transition, so per-side asymmetry can be computed generically without the state machine knowing exercise-specific joint pairs. */
  bottomFrame: PoseFrame | null;
  /** Full pose frame at the rep's smallest primary angle (deepest point). */
  deepestFrame: PoseFrame | null;
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
  /** Observed 2D range of the primary joint angle (standing/lockout minus deepest), degrees. What the UI shows. */
  rangeDeg: number;
  /**
   * rangeDeg as a % of a rough, uncalibrated per-exercise reference range
   * (exercise-config.ts). Full-depth reps routinely exceed 100% (169–191% on
   * real side-view squats), so it is kept for benchmarks/history only and
   * not shown as a ROM score.
   */
  romPercent: number;
};

export type RepTempo = {
  repNumber: number;
  /** Null when the descent was not observed (clip/tracking began at the bottom). */
  eccentricSec: number | null;
  /** Time held at the bottom (isometric hold) — kept separate from eccentric/concentric. Null when not observed. */
  pauseSec: number | null;
  concentricSec: number;
  /** Video-relative phase boundaries (ms), so every duration above is traceable to a moment in the clip. */
  descentStartMs: number | null;
  bottomReachedMs: number | null;
  ascentStartMs: number;
  repEndMs: number;
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
  /**
   * Uncalibrated movement-analysis quality in [0, 1] from tracking visibility,
   * rep count and torso visibility only — never from how the exercise was
   * chosen, so picking an exercise cannot raise it. Not a probability.
   */
  confidence: number;
  /** Per-rep detail, for the analysis UI and the ground-truth benchmarking tool — not part of the spec's summary example, but needed to render anything useful. */
  perRep: {
    rom: RepRom[];
    tempo: RepTempo[];
  };
  /** Honest limitations of THIS analysis run (e.g. low visibility frames dropped, too few reps for consistency). */
  limitations: string[];
};
