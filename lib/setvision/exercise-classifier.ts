import { getBestSide, inclinationFromVertical } from "@/lib/form-coach/geometry";
import { EXERCISE_CONFIGS } from "@/lib/setvision/exercise-config";
import type { ExerciseClassification, PoseFrame } from "@/lib/setvision/types";

/**
 * Exercise Classification (spec Part B §13) — heuristic + pose
 * combination, deliberately NOT a trained deep network: there is no
 * labeled video dataset in this project to train one on, and a
 * network trained on nothing would just be theater. See
 * docs/setvision.md for how this heuristic would be replaced by a
 * lightweight classifier once real labeled data exists (the
 * ground-truth annotation tool in this pass exists specifically to
 * start collecting that data).
 *
 * Two-stage heuristic:
 *   1. Average torso inclination from vertical distinguishes a
 *      lying-down lift (bench: torso near-horizontal, ~90°) from a
 *      standing lift (squat/deadlift: torso mostly upright).
 *   2. For standing lifts, squat vs. deadlift is distinguished by
 *      (a) whether the sequence starts already hip-flexed (a deadlift
 *      starts from the floor; a squat starts standing), then
 *      (b) whichever of knee-angle-range (squat) or hip-angle-range
 *      (deadlift) better matches that exercise's own reference range.
 */

const BENCH_INCLINATION_THRESHOLD_DEG = 55;
const DEADLIFT_START_HIP_ANGLE_DEG = 110;
const MIN_FRAMES_TO_CLASSIFY = 5;

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function range(values: number[]): number {
  return Math.max(...values) - Math.min(...values);
}

export function classifyExercise(frames: PoseFrame[]): ExerciseClassification {
  const inclinations = frames
    .map((frame) => {
      const shoulder = getBestSide(frame, "shoulder");
      const hip = getBestSide(frame, "hip");
      if (!shoulder || !hip) return null;

      // inclinationFromVertical's raw output is NOT symmetric around
      // "vertical": a hip-shoulder line pointing straight one way
      // reads ~0deg, the same line pointing straight the OTHER way
      // reads ~180deg — both are equally "vertical". Folding onto
      // [0, 90] treats both as upright and only a genuinely
      // horizontal line (raw ~90deg) as maximally inclined.
      const raw = inclinationFromVertical(hip, shoulder);
      return Math.min(raw, 180 - raw);
    })
    .filter((v): v is number => v !== null);

  if (inclinations.length < MIN_FRAMES_TO_CLASSIFY) {
    return {
      exercise: null,
      confidence: 0,
      signals: [
        `Only ${inclinations.length} usable pose frame(s) were available — not enough to classify the exercise.`,
      ],
    };
  }

  const avgInclination = average(inclinations);

  if (avgInclination >= BENCH_INCLINATION_THRESHOLD_DEG) {
    const margin = avgInclination - BENCH_INCLINATION_THRESHOLD_DEG;
    const confidence = Math.min(0.95, 0.55 + margin / 90);

    return {
      exercise: "bench_press",
      confidence: round(confidence, 2),
      signals: [
        `Average torso inclination from vertical is ${round(avgInclination)}°, consistent with lying on a bench rather than standing.`,
      ],
    };
  }

  const kneeAngleFn = EXERCISE_CONFIGS.squat.primaryAngleDeg;
  const hipAngleFn = EXERCISE_CONFIGS.deadlift.primaryAngleDeg;

  const kneeAngles = frames.map(kneeAngleFn).filter((v): v is number => v !== null);
  const hipAngles = frames.map(hipAngleFn).filter((v): v is number => v !== null);

  const signals: string[] = [
    `Average torso inclination from vertical is ${round(avgInclination)}°, consistent with a standing lift.`,
  ];

  if (kneeAngles.length < MIN_FRAMES_TO_CLASSIFY || hipAngles.length < MIN_FRAMES_TO_CLASSIFY) {
    return {
      exercise: null,
      confidence: 0.2,
      signals: [
        ...signals,
        "Not enough visible knee/hip landmarks to distinguish squat from deadlift.",
      ],
    };
  }

  const firstHipAngle = hipAngles[0];
  const startsFromBottom = firstHipAngle < DEADLIFT_START_HIP_ANGLE_DEG;

  if (startsFromBottom) {
    signals.push(
      `The sequence starts already hip-flexed (${round(firstHipAngle)}°) rather than standing, consistent with pulling from the floor.`,
    );

    return { exercise: "deadlift", confidence: 0.75, signals };
  }

  const kneeRange = range(kneeAngles);
  const hipRange = range(hipAngles);

  const squatResidual = Math.abs(kneeRange - EXERCISE_CONFIGS.squat.referenceRangeDeg);
  const deadliftResidual = Math.abs(hipRange - EXERCISE_CONFIGS.deadlift.referenceRangeDeg);

  const totalResidual = squatResidual + deadliftResidual;
  const confidence =
    totalResidual === 0 ? 0.6 : Math.min(0.9, 0.5 + Math.abs(squatResidual - deadliftResidual) / totalResidual / 2);

  if (squatResidual <= deadliftResidual) {
    signals.push(
      `Knee-angle range (${round(kneeRange)}°) is closer to a typical squat depth pattern than the hip-angle range is to a typical deadlift pattern.`,
    );

    return { exercise: "squat", confidence: round(confidence, 2), signals };
  }

  signals.push(
    `Hip-angle range (${round(hipRange)}°) is closer to a typical deadlift hip-hinge pattern than the knee-angle range is to a typical squat pattern.`,
  );

  return { exercise: "deadlift", confidence: round(confidence, 2), signals };
}
