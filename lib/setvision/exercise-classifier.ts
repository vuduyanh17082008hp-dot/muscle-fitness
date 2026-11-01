import { inclinationFromVertical } from "@/lib/form-coach/geometry";
import { EXERCISE_CONFIGS, confidentPoint, sameSidePoints } from "@/lib/setvision/exercise-config";
import type { ExerciseClassification, PoseFrame } from "@/lib/setvision/types";

/**
 * Exercise Classification (spec Part B §13) — heuristic + pose
 * combination, deliberately NOT a trained deep network: there is no
 * labeled video dataset in this project to train one on. See
 * docs/setvision.md for how this would be replaced by a lightweight
 * classifier once real labeled data exists.
 *
 *   1. Average torso inclination from vertical separates a lying lift
 *      (bench: torso near-horizontal) from a standing one.
 *   2. Standing lifts are only told apart when the camera is roughly
 *      side-on. In a front/rear view the sagittal knee and hip angles
 *      are 2D projections (a front-view squat's thigh foreshortens and
 *      its "hip angle" collapses like a hinge), so the classifier
 *      abstains instead of guessing — and likewise when the view can't
 *      be verified as side-on (angled or unknown).
 *   3. Side-on: squat vs deadlift by how much the knee flexes relative
 *      to the hip over the clip. A squat bends both about equally; a
 *      deadlift is hip-dominant. Between the two bands → abstain. A
 *      squat pattern with the hands at/below the knees at the bottom
 *      (squat-depth pickup, or weights held low) → abstain.
 *
 *   Every result is only a SUGGESTION: the UI asks the user to confirm
 *   or correct it before any movement-specific analysis is shown.
 *
 * `confidence` is an UNCALIBRATED heuristic margin score in [0, 1],
 * not a probability: no labeled clip set exists to calibrate it. The
 * UI must not present it as a percentage likelihood.
 */

const BENCH_INCLINATION_THRESHOLD_DEG = 55;
const MIN_FRAMES_TO_CLASSIFY = 5;

// ponytail: a-priori thresholds, none fitted to labeled clips (no such
// set exists). Replace with a trained classifier once annotations exist.
/** Median left–right hip separation / torso length above this → camera faces the lifter. Same a-priori value as SetVision P0's side-view gate. */
export const FRONTAL_HIP_SEPARATION_RATIO = 0.35;
/**
 * At or below this the hips overlap → side-on. Real side-view clips measured
 * 0.02–0.04; a rear-angled squat clip 0.30. Between the two bands the view is
 * "uncertain" (possibly angled) — NOT a validated oblique-view detector.
 */
export const SIDE_HIP_SEPARATION_RATIO = 0.15;
/** Share of deep squat-position frames with the hands at/below the knees at which a knee-dominant clip is not called a squat. */
const HANDS_LOW_ABSTAIN_SHARE = 0.5;
/** Below this many degrees of robust knee AND hip flexion range there is no lift to classify. */
const MIN_FLEXION_RANGE_DEG = 30;
/** kneeRange / hipRange at or above this → squat-like (knee-dominant or balanced). */
const SQUAT_MIN_KNEE_HIP_RATIO = 0.8;
/** kneeRange / hipRange at or below this → hinge-like (deadlift). */
const DEADLIFT_MAX_KNEE_HIP_RATIO = 0.55;

export type CameraView = "side" | "uncertain" | "frontal" | "unknown";

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))))];
}

/** p95 − p5: a range a few mis-tracked frames cannot inflate (raw max − min could). */
function robustRange(values: number[]): number {
  return percentile(values, 95) - percentile(values, 5);
}

const scored = confidentPoint;

/**
 * Side-on vs front/rear-facing camera, from how far apart the two
 * hips sit relative to torso length (they overlap in profile and sit
 * a hip-width apart frontally). Only "side" lets the classifier tell
 * squat from deadlift: "uncertain" (between the bands, e.g. an angled
 * camera) and "unknown" (too few frames show both hips and both
 * shoulders clearly) abstain rather than guess.
 */
export function estimateCameraView(frames: PoseFrame[]): { view: CameraView; hipSeparationRatio: number | null } {
  const ratios: number[] = [];

  for (const frame of frames) {
    const lh = scored(frame, "left_hip");
    const rh = scored(frame, "right_hip");
    const ls = scored(frame, "left_shoulder");
    const rs = scored(frame, "right_shoulder");
    if (!lh || !rh || !ls || !rs) continue;

    const torso = Math.hypot((ls.x + rs.x) / 2 - (lh.x + rh.x) / 2, (ls.y + rs.y) / 2 - (lh.y + rh.y) / 2);
    if (torso > 0) ratios.push(Math.abs(lh.x - rh.x) / torso);
  }

  if (ratios.length < MIN_FRAMES_TO_CLASSIFY) return { view: "unknown", hipSeparationRatio: null };

  const median = percentile(ratios, 50);
  const view: CameraView =
    median > FRONTAL_HIP_SEPARATION_RATIO ? "frontal" : median > SIDE_HIP_SEPARATION_RATIO ? "uncertain" : "side";
  return { view, hipSeparationRatio: round(median, 2) };
}

/**
 * True when a clearly tracked wrist is at or below the same-side knee
 * (image y grows downward), null when no side has both clearly tracked.
 */
export function handsAtOrBelowKnees(frame: PoseFrame): boolean | null {
  const points = sameSidePoints(frame, ["wrist", "knee"]);
  return points ? points[0].y >= points[1].y : null;
}

export function classifyExercise(frames: PoseFrame[]): ExerciseClassification {
  const inclinations = frames
    .map((frame) => {
      const torso = sameSidePoints(frame, ["hip", "shoulder"]);
      if (!torso) return null;

      // inclinationFromVertical's raw output is NOT symmetric around
      // "vertical": both ~0deg and ~180deg are upright. Fold onto [0, 90].
      const raw = inclinationFromVertical(torso[0], torso[1]);
      return Math.min(raw, 180 - raw);
    })
    .filter((v): v is number => v !== null);

  if (inclinations.length < MIN_FRAMES_TO_CLASSIFY) {
    return {
      exercise: null,
      confidence: 0,
      signals: [
        `Only ${inclinations.length} clearly tracked pose frame(s) were available — not enough to classify the exercise.`,
      ],
    };
  }

  const avgInclination = average(inclinations);

  if (avgInclination >= BENCH_INCLINATION_THRESHOLD_DEG) {
    const margin = avgInclination - BENCH_INCLINATION_THRESHOLD_DEG;

    return {
      exercise: "bench_press",
      confidence: round(Math.min(0.95, 0.55 + margin / 90), 2),
      signals: [
        `Average torso inclination from vertical is ${round(avgInclination)}°, consistent with lying on a bench rather than standing.`,
      ],
    };
  }

  const signals: string[] = [
    `Average torso inclination from vertical is ${round(avgInclination)}°, consistent with a standing lift.`,
  ];

  const { view, hipSeparationRatio } = estimateCameraView(frames);

  if (view !== "side") {
    const reason =
      view === "frontal"
        ? `The camera appears to face the lifter (hips ${hipSeparationRatio}× torso length apart)`
        : view === "uncertain"
          ? `The camera does not look side-on (hips ${hipSeparationRatio}× torso length apart — possibly an angled view)`
          : "The camera angle could not be verified (too few frames show both hips and shoulders clearly)";
    return {
      exercise: null,
      confidence: 0,
      signals: [`${reason}, so squat and deadlift cannot be told apart reliably from 2D joint angles.`, ...signals],
    };
  }

  const kneeAngles = frames.map(EXERCISE_CONFIGS.squat.primaryAngleDeg).filter((v): v is number => v !== null);
  const hipAngles = frames.map(EXERCISE_CONFIGS.deadlift.primaryAngleDeg).filter((v): v is number => v !== null);

  if (kneeAngles.length < MIN_FRAMES_TO_CLASSIFY || hipAngles.length < MIN_FRAMES_TO_CLASSIFY) {
    return {
      exercise: null,
      confidence: 0,
      signals: [
        "Not enough clearly visible knee/hip landmarks to distinguish squat from deadlift.",
        ...signals,
      ],
    };
  }

  const kneeRange = robustRange(kneeAngles);
  const hipRange = robustRange(hipAngles);

  if (Math.max(kneeRange, hipRange) < MIN_FLEXION_RANGE_DEG) {
    return {
      exercise: null,
      confidence: 0,
      signals: [
        `Knee (${round(kneeRange)}°) and hip (${round(hipRange)}°) angles barely change, so no squat or deadlift movement was recognised.`,
        ...signals,
      ],
    };
  }

  const ratio = kneeRange / Math.max(hipRange, 1);
  const detail = `knee range ${round(kneeRange)}° vs hip range ${round(hipRange)}° (ratio ${round(ratio, 2)})`;

  if (ratio >= SQUAT_MIN_KNEE_HIP_RATIO) {
    // A squat-depth pickup (or put-down) bends the knees exactly like a squat;
    // pose alone can't separate it from a squat holding weights low, so abstain.
    const deepHands = frames
      .filter((frame) => {
        const knee = EXERCISE_CONFIGS.squat.primaryAngleDeg(frame);
        return knee !== null && knee <= EXERCISE_CONFIGS.squat.bottomAngleThresholdDeg;
      })
      .map(handsAtOrBelowKnees)
      .filter((v): v is boolean => v !== null);
    const lowShare = deepHands.length ? deepHands.filter(Boolean).length / deepHands.length : 0;

    if (deepHands.length >= MIN_FRAMES_TO_CLASSIFY && lowShare >= HANDS_LOW_ABSTAIN_SHARE) {
      return {
        exercise: null,
        confidence: 0,
        signals: [
          `Knees and hips flex together (${detail}), but at the bottom the hands are at or below the knees — that could be a squat holding weights low, or picking something up or putting it down, so the exercise is uncertain.`,
          ...signals,
        ],
      };
    }

    return {
      exercise: "squat",
      confidence: round(Math.min(0.9, 0.5 + (ratio - SQUAT_MIN_KNEE_HIP_RATIO)), 2),
      signals: [`Knee and hip flex together, a squat pattern: ${detail}.`, ...signals],
    };
  }

  if (ratio <= DEADLIFT_MAX_KNEE_HIP_RATIO) {
    return {
      exercise: "deadlift",
      confidence: round(Math.min(0.9, 0.5 + (DEADLIFT_MAX_KNEE_HIP_RATIO - ratio)), 2),
      signals: [`Movement is hip-dominant, a hinge/deadlift pattern: ${detail}.`, ...signals],
    };
  }

  return {
    exercise: null,
    confidence: 0,
    signals: [
      `Knee/hip pattern is between a squat and a hinge (${detail}), so the exercise is uncertain.`,
      ...signals,
    ],
  };
}
