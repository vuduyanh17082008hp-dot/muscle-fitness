import { angleAt, MIN_LANDMARK_SCORE, midpoint } from "@/lib/form-coach/geometry";
import type { Landmark, PoseFrame, SetVisionExerciseId } from "@/lib/setvision/types";

/**
 * Movement-family engines (spec Part B §10, §15, §17).
 *
 * Every engine follows ONE 2D joint angle through a fixed cycle:
 *
 *   rest position → working end → rest position  (= one rep)
 *
 * `rest` says which end of the angle range the rep starts and finishes at
 * ("high" = joint open: standing squat, bench lockout, arms hanging in a
 * pulldown; "low" = joint closed: overhead press in the rack, pushdown with
 * the elbows bent, arms down before a lateral raise). The shared rep state
 * machine (rep-state-machine.ts) counts a rep only when the angle crosses
 * BOTH thresholds and comes back — the operational rep criterion in
 * `criterion`. `outbound` says whether leaving the rest position is the
 * eccentric (lowering a squat) or the concentric (pulling a pulldown bar
 * down) phase, so tempo is labelled per movement, never assumed.
 *
 * Thresholds are a-priori figures checked against the real and rendered
 * clips listed in docs/setvision.md — NOT fitted to a labelled dataset, and
 * not a biomechanical measurement. A choice of exercise never changes them.
 *
 * `barProxy` is an explicit, labelled APPROXIMATION (spec §17) and exists
 * only where it was already in use (squat: shoulder midpoint; deadlift:
 * wrist midpoint). No engine tracks the bar, a dumbbell, a cable or a
 * machine — body landmarks only — so the other engines report no speed or
 * bar path at all rather than a hand path dressed up as one.
 */

export type Side = "left" | "right";

/**
 * Body-position check for the chosen movement, evaluated on the clip's
 * frames at one end of the angle range. A clip that fails it is not
 * analysed: choosing "Lat Pulldown" must not turn a curl into pulldown reps.
 */
export type PositionCheck = {
  /** Which end of the primary angle to inspect: "high" = joint open, "low" = joint closed. */
  at: "high" | "low";
  /** Allowed median shoulder angle (hip–shoulder–elbow) there, degrees. */
  shoulderDeg?: [number, number];
  /** Required median wrist height vs the shoulder there (image y grows downward). */
  wrist?: "above_shoulder" | "below_shoulder";
  /** Shown when the check fails. */
  failure: string;
};

export type ExerciseConfig = {
  id: SetVisionExerciseId;
  displayName: string;
  /** Movement family shown with results. */
  family: string;
  /** What is measured, e.g. "elbow angle (shoulder–elbow–wrist)". */
  signalLabel: string;
  requiredLandmarks: string[];
  /** The three joints of the primary angle, vertex in the middle. */
  joints: [string, string, string];
  /**
   * per-frame: each frame uses whichever side is better tracked (squat,
   * deadlift — both legs move together, behaviour verified on real clips).
   * per-clip: one side is chosen for the whole clip (arm movements: per-frame
   * switching between the near and the far arm injected ±50° jumps on real
   * oblique-view presses), so single-arm work measures the working arm.
   */
  sideMode: "per-frame" | "per-clip";
  /** Primary angle on the best-tracked side of one frame; null when not clearly tracked. Used by per-frame engines and by the classifier. */
  primaryAngleDeg: (frame: PoseFrame) => number | null;
  /** Which end of the angle range a rep starts and ends at. */
  rest: "high" | "low";
  /** Rest-position threshold (named for the original squat-only engine, where rest was the top). */
  topAngleThresholdDeg: number;
  /** Working-end threshold. */
  bottomAngleThresholdDeg: number;
  /** Whether leaving the rest position is the eccentric or the concentric phase. */
  outbound: "eccentric" | "concentric";
  /** Plain names for the four timeline columns: leave rest, reach working end, leave it, back at rest. */
  phaseNames: [string, string, string, string];
  barProxy: ((frame: PoseFrame) => Landmark | null) | null;
  /** |rest − working end| thresholds, the "full ROM" reference used by rom.ts (uncalibrated). */
  referenceRangeDeg: number;
  /** Camera views in which the 2D angle is a usable joint range; ROM is reported only for these. */
  rangeViews: Array<"side" | "frontal">;
  /** Camera views this engine refuses to analyse (the motion is not in the image plane). */
  refusedViews?: Array<"side" | "frontal">;
  position?: PositionCheck;
  /** Operational rep criterion, in words, for the UI and docs. */
  criterion: string;
  /** Supported camera views, in words. */
  views: string;
};

/**
 * All joints of one angle from the SAME body side — whichever side's
 * weakest keypoint scores higher — or null when neither side clears
 * MIN_LANDMARK_SCORE. Picking each joint's side independently (the
 * old getBestSide-per-joint approach) mixes left and right joints a
 * hip-width apart whenever the camera is not side-on; on a real
 * front-view squat that made a standing knee read 107° one frame and
 * 178° the next, which drove both a false "deadlift" label and
 * multi-second phantom eccentric/concentric phases.
 */
export function sameSidePoints(frame: PoseFrame, joints: string[]): Landmark[] | null {
  let best: Landmark[] | null = null;
  let bestScore = -Infinity;

  for (const side of ["left", "right"]) {
    const points = joints.map((joint) => frame[`${side}_${joint}`]);
    if (points.some((p) => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))) continue;
    const score = Math.min(...points.map((p) => p!.score));
    if (score > bestScore) {
      best = points as Landmark[];
      bestScore = score;
    }
  }

  return best && bestScore >= MIN_LANDMARK_SCORE ? best : null;
}

function sameSideAngle(frame: PoseFrame, joints: [string, string, string]): number | null {
  const points = sameSidePoints(frame, joints);
  return points ? angleAt(points[0], points[1], points[2]) : null;
}

/** The named keypoint only when it is clearly tracked (score ≥ MIN_LANDMARK_SCORE) and has finite coordinates. */
export function confidentPoint(frame: PoseFrame, name: string): Landmark | null {
  const point = frame[name];
  return point && point.score >= MIN_LANDMARK_SCORE && Number.isFinite(point.x) && Number.isFinite(point.y)
    ? point
    : null;
}

/** The angle at the middle joint on ONE named side, or null unless all three are clearly tracked. */
export function sideAngle(frame: PoseFrame, side: Side, joints: [string, string, string]): number | null {
  const [a, b, c] = joints.map((joint) => confidentPoint(frame, `${side}_${joint}`));
  return a && b && c ? angleAt(a, b, c) : null;
}

/**
 * Bar-proxy point: midpoint of both sides when both are clearly tracked,
 * else the one clearly tracked side (in a side view the two project onto
 * nearly the same point), else null — a low-score keypoint never moves the
 * bar-path or velocity trace.
 */
// ponytail: a front view where one side flickers below the floor makes the proxy
// hop half a grip-width; a per-rep fixed side is the upgrade if that shows up in real clips.
function confidentMidpoint(frame: PoseFrame, joint: string): Landmark | null {
  const left = confidentPoint(frame, `left_${joint}`);
  const right = confidentPoint(frame, `right_${joint}`);

  if (left && right) return midpoint(left, right);
  return left ?? right;
}

const wristMidpoint = (frame: PoseFrame) => confidentMidpoint(frame, "wrist");
const shoulderMidpoint = (frame: PoseFrame) => confidentMidpoint(frame, "shoulder");

const ELBOW: [string, string, string] = ["shoulder", "elbow", "wrist"];
const KNEE: [string, string, string] = ["hip", "knee", "ankle"];
const HIP: [string, string, string] = ["shoulder", "hip", "knee"];
const SHOULDER: [string, string, string] = ["hip", "shoulder", "elbow"];

const ELBOW_LABEL = "elbow angle (shoulder–elbow–wrist)";

/** Shared shape of the single-joint arm engines. */
function armEngine(
  config: Omit<ExerciseConfig, "joints" | "signalLabel" | "requiredLandmarks" | "sideMode" | "primaryAngleDeg" | "barProxy" | "referenceRangeDeg"> & {
    joints?: [string, string, string];
    signalLabel?: string;
  },
): ExerciseConfig {
  const joints = config.joints ?? ELBOW;
  return {
    ...config,
    joints,
    signalLabel: config.signalLabel ?? ELBOW_LABEL,
    requiredLandmarks: [...new Set([...joints, "hip"])],
    sideMode: "per-clip",
    primaryAngleDeg: (frame) => sameSideAngle(frame, joints),
    barProxy: null,
    referenceRangeDeg: Math.abs(config.topAngleThresholdDeg - config.bottomAngleThresholdDeg),
  };
}

const PRESS_PHASES: [string, string, string, string] = ["Lowering", "Bottom", "Pressing", "Lockout"];
const PULL_PHASES: [string, string, string, string] = ["Pulling", "Peak", "Returning", "Arms extended"];

export const EXERCISE_CONFIGS: Record<SetVisionExerciseId, ExerciseConfig> = {
  squat: {
    id: "squat",
    displayName: "Squat",
    family: "Knee-dominant lower body",
    signalLabel: "knee angle (hip–knee–ankle)",
    requiredLandmarks: ["hip", "knee", "ankle"],
    joints: KNEE,
    sideMode: "per-frame",
    primaryAngleDeg: (frame) => sameSideAngle(frame, KNEE),
    rest: "high",
    topAngleThresholdDeg: 160,
    bottomAngleThresholdDeg: 90,
    outbound: "eccentric",
    phaseNames: ["Descent", "Bottom", "Ascent", "Standing"],
    barProxy: shoulderMidpoint,
    referenceRangeDeg: 70,
    rangeViews: ["side"],
    criterion: "Knee opens to ≥ 160° (standing), bends to ≤ 90° (depth), and opens to ≥ 160° again.",
    views: "Side-on is best; a front view counts reps but reports no joint range.",
  },
  deadlift: {
    id: "deadlift",
    displayName: "Deadlift",
    family: "Hip hinge",
    signalLabel: "hip angle (shoulder–hip–knee)",
    requiredLandmarks: ["shoulder", "hip", "knee"],
    joints: HIP,
    sideMode: "per-frame",
    primaryAngleDeg: (frame) => sameSideAngle(frame, HIP),
    rest: "high",
    topAngleThresholdDeg: 165,
    // Was 70°: real hinges bottom out at 71–100° in 2D (the 2026-11-01 rear-oblique
    // deadlift read 71° and 95°), so the second rep never registered. 110° still
    // needs a clear hinge; a standing torso lean stays far above it.
    bottomAngleThresholdDeg: 110,
    outbound: "eccentric",
    phaseNames: ["Lowering", "Bottom", "Lifting", "Lockout"],
    barProxy: wristMidpoint,
    referenceRangeDeg: 55,
    rangeViews: ["side"],
    criterion: "Hip opens to ≥ 165° (lockout), closes to ≤ 110° (hinged), and opens to ≥ 165° again. A set may start from the floor.",
    views: "Side-on is best; other views count reps but report no joint range.",
  },
  bench_press: armEngine({
    id: "bench_press",
    displayName: "Horizontal press",
    family: "Horizontal press",
    rest: "high",
    topAngleThresholdDeg: 150,
    bottomAngleThresholdDeg: 90,
    outbound: "eccentric",
    phaseNames: PRESS_PHASES,
    rangeViews: ["side"],
    position: {
      at: "high",
      shoulderDeg: [45, 160],
      failure: "At lockout the arms did not point away from the chest (they ended overhead in line with the body, or down by the sides), so this does not look like a horizontal press from this camera angle.",
    },
    criterion: "Elbow opens to ≥ 150° (lockout), bends to ≤ 90° (bottom), and opens to ≥ 150° again.",
    views: "Side or a raised front-oblique view of a lying/incline press. A seated press filmed head-on moves toward the camera and is refused.",
  }),
  vertical_press: armEngine({
    id: "vertical_press",
    displayName: "Vertical press",
    family: "Vertical press",
    rest: "low",
    topAngleThresholdDeg: 90,
    bottomAngleThresholdDeg: 145,
    outbound: "concentric",
    phaseNames: ["Pressing", "Lockout", "Lowering", "Rack position"],
    rangeViews: ["frontal"],
    position: {
      at: "high",
      shoulderDeg: [130, 180],
      wrist: "above_shoulder",
      failure: "At the top the hands did not finish overhead, so this does not look like an overhead press.",
    },
    criterion: "Elbow bends to ≤ 90° (rack), opens to ≥ 145° overhead (lockout), and bends to ≤ 90° again.",
    views: "Front or back view. Pose alone cannot tell a press from a pulldown — both move the arms the same way.",
  }),
  vertical_pull: armEngine({
    id: "vertical_pull",
    displayName: "Vertical pull",
    family: "Vertical pull",
    rest: "high",
    topAngleThresholdDeg: 145,
    bottomAngleThresholdDeg: 90,
    outbound: "concentric",
    phaseNames: PULL_PHASES,
    rangeViews: ["frontal"],
    position: {
      at: "high",
      shoulderDeg: [130, 180],
      wrist: "above_shoulder",
      failure: "With the arms extended the hands were not overhead, so this does not look like a pulldown or pull-up.",
    },
    criterion: "Elbow opens to ≥ 145° with the hands overhead, bends to ≤ 90° (pulled), and opens to ≥ 145° again.",
    views: "Front or back view. In a pull-up the body moves and in a pulldown the bar does; both are measured as the elbow angle, so the count does not depend on which.",
  }),
  horizontal_pull: armEngine({
    id: "horizontal_pull",
    displayName: "Horizontal pull",
    family: "Horizontal pull",
    rest: "high",
    topAngleThresholdDeg: 145,
    bottomAngleThresholdDeg: 100,
    outbound: "concentric",
    phaseNames: PULL_PHASES,
    rangeViews: ["side"],
    position: {
      at: "high",
      // Not overhead. A tighter lower bound (arms away from the sides) refused a real
      // bent-over row: filmed front-oblique, the bent torso foreshortens and the
      // hanging arms read like arms at the sides. Pose alone cannot tell a row from a
      // curl or pushdown here; the user's choice decides which movement it is.
      shoulderDeg: [0, 125],
      wrist: "below_shoulder",
      failure: "With the arms extended the hands were overhead, so this does not look like a row.",
    },
    criterion: "Elbow opens to ≥ 145° (arms extended), bends to ≤ 100° (pulled), and opens to ≥ 145° again.",
    views: "Side or front-oblique view. Straight from the front a row moves toward the camera, which usually shows too little elbow movement to count.",
  }),
  elbow_flexion: armEngine({
    id: "elbow_flexion",
    displayName: "Elbow flexion",
    family: "Elbow flexion (curl)",
    rest: "high",
    topAngleThresholdDeg: 140,
    bottomAngleThresholdDeg: 70,
    outbound: "concentric",
    phaseNames: ["Curling", "Top", "Lowering", "Arms extended"],
    rangeViews: ["side"],
    position: {
      at: "high",
      shoulderDeg: [0, 65],
      wrist: "below_shoulder",
      failure: "With the arms extended the upper arms were not down by the body, so this does not look like a curl.",
    },
    criterion: "Elbow opens to ≥ 140°, bends to ≤ 70° (curled), and opens to ≥ 140° again.",
    views: "Side view is best; a front view still counts reps but reports no joint range.",
  }),
  triceps_pushdown: armEngine({
    id: "triceps_pushdown",
    displayName: "Elbow extension (elbows down)",
    family: "Elbow extension",
    rest: "low",
    topAngleThresholdDeg: 105,
    bottomAngleThresholdDeg: 150,
    outbound: "concentric",
    phaseNames: ["Pushing", "Arms straight", "Returning", "Elbows bent"],
    rangeViews: ["side"],
    position: {
      at: "high",
      // ≤ 35°: elbows pinned to the sides. A bent-over row's hanging arms read ~45°.
      shoulderDeg: [0, 35],
      wrist: "below_shoulder",
      failure: "With the arms straight the upper arms were not pinned to the sides with the hands down, so this does not look like a pushdown.",
    },
    criterion: "Elbow bends to ≤ 105°, straightens to ≥ 150° with the hands down, and bends to ≤ 105° again.",
    views: "Side view is best; a front view still counts reps but reports no joint range.",
  }),
  overhead_triceps_extension: armEngine({
    id: "overhead_triceps_extension",
    displayName: "Elbow extension (overhead)",
    family: "Elbow extension",
    rest: "low",
    topAngleThresholdDeg: 90,
    bottomAngleThresholdDeg: 145,
    outbound: "concentric",
    phaseNames: ["Extending", "Arms straight", "Lowering", "Elbows bent"],
    rangeViews: ["side"],
    position: {
      at: "high",
      shoulderDeg: [130, 180],
      wrist: "above_shoulder",
      failure: "With the arms straight the hands were not overhead, so this does not look like an overhead extension.",
    },
    criterion: "Elbow bends to ≤ 90° behind the head, straightens to ≥ 145° overhead, and bends to ≤ 90° again.",
    views: "Side view is best; a front view still counts reps but reports no joint range.",
  }),
  lateral_raise: armEngine({
    id: "lateral_raise",
    displayName: "Lateral raise",
    family: "Shoulder abduction",
    joints: SHOULDER,
    signalLabel: "shoulder angle (hip–shoulder–elbow)",
    rest: "low",
    topAngleThresholdDeg: 35,
    bottomAngleThresholdDeg: 70,
    outbound: "concentric",
    phaseNames: ["Raising", "Top", "Lowering", "Arms down"],
    rangeViews: ["frontal"],
    refusedViews: ["side"],
    position: {
      at: "high",
      shoulderDeg: [70, 125],
      failure: "At the top the arms went overhead, so this does not look like a lateral raise.",
    },
    criterion: "Upper arm hangs at ≤ 35° from the body, rises to ≥ 70° (not overhead), and returns to ≤ 35°.",
    views: "Front or back view only — from the side a lateral raise cannot be told from a front raise.",
  }),
};

export function getExerciseConfig(id: SetVisionExerciseId): ExerciseConfig {
  return EXERCISE_CONFIGS[id];
}
