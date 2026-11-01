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

/**
 * Movement-family analysis engines. The ids are also the
 * setvision_analyses.exercise column values, so the three original ids keep
 * their names: "bench_press" is the horizontal-press engine and "deadlift"
 * the hip-hinge engine. See exercise-config.ts for what each one measures.
 */
export type SetVisionExerciseId =
  | "bench_press"
  | "squat"
  | "deadlift"
  | "vertical_press"
  | "vertical_pull"
  | "horizontal_pull"
  | "elbow_flexion"
  | "triceps_pushdown"
  | "overhead_triceps_extension"
  | "lateral_raise";

export const SETVISION_EXERCISES: SetVisionExerciseId[] = [
  "bench_press",
  "squat",
  "deadlift",
  "vertical_press",
  "vertical_pull",
  "horizontal_pull",
  "elbow_flexion",
  "triceps_pushdown",
  "overhead_triceps_extension",
  "lateral_raise",
];

/** setvision_analyses.exercise for a saved manual review that ran no engine. */
export const MANUAL_REVIEW_EXERCISE = "manual_review";

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
  /**
   * Movements whose engine found valid reps in the clip, when pose alone can't
   * pick one (an overhead press and a pulldown move the arms the same way).
   * The user chooses; nothing is analysed until they do.
   */
  candidates?: SetVisionExerciseId[];
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

/**
 * Per-rep phase timing. The timestamp names are geometric and kept from the
 * squat-only era: "descent" = leaving the rest position toward the working
 * end of the movement, "bottom" = the working end, "ascent" = the return.
 * Which of those is eccentric or concentric depends on the movement
 * (exercise-config.ts `outbound`): lowering a squat is eccentric, pulling a
 * lat pulldown bar down is concentric.
 */
export type RepTempo = {
  repNumber: number;
  /** Null when this phase was not observed (the clip/tracking began at the working end). */
  eccentricSec: number | null;
  /** Time held at the working end (bottom of a squat, peak of a curl) — kept separate from eccentric/concentric. Null when not observed. */
  pauseSec: number | null;
  /** Null when this phase was not observed. Restored pre-2026-11 rows always have it. */
  concentricSec: number | null;
  /** Video-relative phase boundaries (ms), so every duration above is traceable to a moment in the clip. Descent/bottom are null when not observed. */
  descentStartMs: number | null;
  bottomReachedMs: number | null;
  /** Always set by a live analysis; null only on a restored analysis saved before timestamps were persisted. */
  ascentStartMs: number | null;
  repEndMs: number | null;
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
  /**
   * Why the engine declined to count anything (wrong body position for the
   * chosen movement, motion not visible from this camera angle…). Null when
   * the clip was analysed. Absent on analyses saved before 2026-11-02.
   */
  abstainReason?: string | null;
  /** Body side the engine measured, for engines that measure one limb for the whole clip. */
  measuredSide?: "left" | "right" | null;
  /** Movements that were seen but not counted as completed reps (partial range, tracking lost). */
  events?: MovementEvent[];
};

/**
 * A movement the engine saw but did not count: "partial" = left the rest
 * position and came back without reaching the working end; "uncertain" =
 * tracking was lost, or the clip ended, part-way through; "excluded" = a
 * full cycle whose body position did not match the chosen movement.
 */
export type MovementEvent = {
  kind: "partial" | "uncertain" | "excluded";
  startMs: number;
  endMs: number;
};
