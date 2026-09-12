import { angleAt, getBestSide, midpoint } from "@/lib/form-coach/geometry";
import type { Landmark, PoseFrame, SetVisionExerciseId } from "@/lib/setvision/types";

/**
 * Per-exercise configuration (spec Part B §10, §15, §17).
 *
 * All three exercises are modeled as "lower angle = deeper into the
 * lift" on one primary joint angle, which lets one generic rep state
 * machine (rep-state-machine.ts) drive all three:
 *
 *   bench_press: elbow angle (shoulder-elbow-wrist)   — top = locked out, bottom = bar at chest
 *   squat:       knee angle (hip-knee-ankle)           — top = standing, bottom = full depth
 *   deadlift:    hip angle (shoulder-hip-knee)         — top = lockout, bottom = bar at floor
 *
 * `barProxy` is an explicit, labeled APPROXIMATION (spec §17): none of
 * these track the actual barbell. Wrist midpoint is used for
 * bench/deadlift (the hands grip the bar in both), and shoulder
 * midpoint for squat (a back-squat bar rests near the shoulders).
 * This is a body-relative heuristic, not object detection — see
 * docs/setvision.md "Bar path" for the honest limitation.
 *
 * Reference angle ranges are ROUGH, commonly-cited ballpark figures
 * for ROM normalization — NOT a clinical/biomechanical measurement.
 * A lifter with better mobility can legitimately exceed 100% here;
 * that's intentional (see RepRom.romPercent in types.ts).
 */

export type ExerciseConfig = {
  id: SetVisionExerciseId;
  displayName: string;
  requiredLandmarks: string[];
  primaryAngleDeg: (frame: PoseFrame) => number | null;
  barProxy: (frame: PoseFrame) => Landmark | null;
  topAngleThresholdDeg: number;
  bottomAngleThresholdDeg: number;
  /** topAngleThresholdDeg - bottomAngleThresholdDeg, i.e. the "full ROM" reference used by rom.ts. */
  referenceRangeDeg: number;
};

function benchElbowAngle(frame: PoseFrame): number | null {
  const shoulder = getBestSide(frame, "shoulder");
  const elbow = getBestSide(frame, "elbow");
  const wrist = getBestSide(frame, "wrist");

  if (!shoulder || !elbow || !wrist) return null;

  return angleAt(shoulder, elbow, wrist);
}

function squatKneeAngle(frame: PoseFrame): number | null {
  const hip = getBestSide(frame, "hip");
  const knee = getBestSide(frame, "knee");
  const ankle = getBestSide(frame, "ankle");

  if (!hip || !knee || !ankle) return null;

  return angleAt(hip, knee, ankle);
}

function deadliftHipAngle(frame: PoseFrame): number | null {
  const shoulder = getBestSide(frame, "shoulder");
  const hip = getBestSide(frame, "hip");
  const knee = getBestSide(frame, "knee");

  if (!shoulder || !hip || !knee) return null;

  return angleAt(shoulder, hip, knee);
}

function wristMidpoint(frame: PoseFrame): Landmark | null {
  const left = frame.left_wrist;
  const right = frame.right_wrist;

  if (left && right) return midpoint(left, right);
  return left ?? right ?? null;
}

function shoulderMidpoint(frame: PoseFrame): Landmark | null {
  const left = frame.left_shoulder;
  const right = frame.right_shoulder;

  if (left && right) return midpoint(left, right);
  return left ?? right ?? null;
}

export const EXERCISE_CONFIGS: Record<SetVisionExerciseId, ExerciseConfig> = {
  bench_press: {
    id: "bench_press",
    displayName: "Bench Press",
    requiredLandmarks: ["shoulder", "elbow", "wrist"],
    primaryAngleDeg: benchElbowAngle,
    barProxy: wristMidpoint,
    topAngleThresholdDeg: 160,
    bottomAngleThresholdDeg: 80,
    referenceRangeDeg: 80,
  },
  squat: {
    id: "squat",
    displayName: "Squat",
    requiredLandmarks: ["hip", "knee", "ankle"],
    primaryAngleDeg: squatKneeAngle,
    barProxy: shoulderMidpoint,
    topAngleThresholdDeg: 160,
    bottomAngleThresholdDeg: 90,
    referenceRangeDeg: 70,
  },
  deadlift: {
    id: "deadlift",
    displayName: "Deadlift",
    requiredLandmarks: ["shoulder", "hip", "knee"],
    primaryAngleDeg: deadliftHipAngle,
    barProxy: wristMidpoint,
    topAngleThresholdDeg: 165,
    bottomAngleThresholdDeg: 70,
    referenceRangeDeg: 95,
  },
};

export function getExerciseConfig(id: SetVisionExerciseId): ExerciseConfig {
  return EXERCISE_CONFIGS[id];
}
