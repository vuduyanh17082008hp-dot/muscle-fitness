import type { Landmark, PoseFrame, TimedPoseFrame } from "@/lib/setvision/types";

/**
 * Synthetic pose-frame generators for SetVision unit tests.
 *
 * Geometry: hip and ankle are fixed on a vertical line; the knee
 * swings horizontally to control the knee angle (angleAt(hip, knee,
 * ankle)) from ~180° (leg straight / standing) down to well under 90°
 * (deep squat) as `depthFraction` goes 0 -> 1. Shoulder sits above hip
 * on the same vertical line so torso inclination stays ~0 (upright),
 * matching a standing lift for the exercise classifier.
 */

function point(x: number, y: number): Landmark {
  return { x, y, score: 1 };
}

export function squatFrame(depthFraction: number): PoseFrame {
  const hip = point(0.5, 0.3);
  const ankle = point(0.5, 1.0);
  const knee = point(0.5 + depthFraction * 0.4, 0.65);
  // Shoulder sits above hip (opposite side from knee/ankle) so the
  // hip-shoulder-knee angle used by the classifier's squat/deadlift
  // disambiguation reads ~180deg (not hip-flexed) at the standing top
  // of the rep, matching a real standing posture rather than an
  // artificial collinear degenerate case.
  const shoulder = point(0.5, 0.0);
  const wrist = point(0.5, 0.05);

  return {
    left_hip: hip,
    right_hip: hip,
    left_knee: knee,
    right_knee: knee,
    left_ankle: ankle,
    right_ankle: ankle,
    left_shoulder: shoulder,
    right_shoulder: shoulder,
    left_wrist: wrist,
    right_wrist: wrist,
  };
}

/** Same geometry idea, but for the hip angle (shoulder-hip-knee) used by deadlift, with the torso itself tilting forward as depth increases (a hip hinge). */
export function deadliftFrame(depthFraction: number): PoseFrame {
  const knee = point(0.5, 0.75);
  const hip = point(0.5, 0.45);
  // Shoulder swings forward and down as the hip hinges (torso
  // inclination increases with depth, but stays well under the
  // bench-press threshold since this is a standing hip hinge, not
  // lying down).
  const shoulder = point(
    0.5 - depthFraction * 0.3,
    0.45 - (1 - depthFraction) * 0.35 + depthFraction * 0.25,
  );
  const wrist = point(0.5, 0.9);

  return {
    left_hip: hip,
    right_hip: hip,
    left_knee: knee,
    right_knee: knee,
    left_shoulder: shoulder,
    right_shoulder: shoulder,
    left_wrist: wrist,
    right_wrist: wrist,
    left_ankle: point(0.5, 1.0),
    right_ankle: point(0.5, 1.0),
  };
}

/** Bench press: torso ~horizontal (lying down), elbow angle swings from locked out to bar-at-chest. */
export function benchFrame(depthFraction: number): PoseFrame {
  const shoulder = point(0.3, 0.5);
  const hip = point(0.9, 0.5); // near-horizontal shoulder-hip line -> ~90 deg inclination
  // Elbow is a fixed pivot; the wrist swings from directly opposite
  // the shoulder (elbow angle ~180deg, arm straight/locked out) to a
  // bent position (elbow angle well under 80deg, bar at chest).
  const elbow = point(0.6, 0.5);
  const wrist = point(0.9 - depthFraction * 0.5, 0.5 + depthFraction * 0.3);

  return {
    left_shoulder: shoulder,
    right_shoulder: shoulder,
    left_hip: hip,
    right_hip: hip,
    left_elbow: elbow,
    right_elbow: elbow,
    left_wrist: wrist,
    right_wrist: wrist,
  };
}

type FrameFn = (depthFraction: number) => PoseFrame;

export function buildRepSequence(
  frameFn: FrameFn,
  reps: number,
  options: {
    frameIntervalMs?: number;
    descentSteps?: number;
    bottomHoldSteps?: number;
    topHoldSteps?: number;
  } = {},
): TimedPoseFrame[] {
  const frameIntervalMs = options.frameIntervalMs ?? 50;
  const descentSteps = options.descentSteps ?? 10;
  const bottomHoldSteps = options.bottomHoldSteps ?? 3;
  const topHoldSteps = options.topHoldSteps ?? 5;

  const frames: TimedPoseFrame[] = [];
  let t = 0;

  const push = (depth: number) => {
    frames.push({ timestampMs: t, frame: frameFn(depth) });
    t += frameIntervalMs;
  };

  for (let i = 0; i < topHoldSteps; i += 1) push(0);

  for (let rep = 0; rep < reps; rep += 1) {
    for (let i = 1; i <= descentSteps; i += 1) push(i / descentSteps);
    for (let i = 0; i < bottomHoldSteps; i += 1) push(1);
    for (let i = descentSteps - 1; i >= 0; i -= 1) push(i / descentSteps);
    for (let i = 0; i < topHoldSteps; i += 1) push(0);
  }

  return frames;
}
