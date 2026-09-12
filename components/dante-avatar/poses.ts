/**
 * Dante pose library (spec Part D §22-23).
 *
 * Each pose is a set of target rotations (radians, Euler XYZ) for the
 * named limb groups in dante-figure.tsx. use-dante-pose.ts lerps the
 * CURRENT rotation of each group toward these targets every frame —
 * no pose ever snaps instantly (spec: "Avoid robotic snap
 * transitions").
 *
 * HONESTY NOTE: these are hand-authored joint-angle targets applied
 * to a procedural placeholder figure (dante-figure.tsx), NOT
 * keyframe/mocap animation clips on a sculpted character model. This
 * is a real, working animation STATE MACHINE — the part that's a
 * stand-in is the character mesh itself. See docs/dante-avatar.md.
 */

export type DantePoseName =
  | "idle_breathing"
  | "walk_in"
  | "classic_vacuum"
  | "front_double_biceps"
  | "side_chest"
  | "point_to_ui"
  | "explain_gesture"
  | "handoff";

export type LimbRotations = {
  spine: [number, number, number];
  head: [number, number, number];
  shoulderL: [number, number, number];
  shoulderR: [number, number, number];
  elbowL: [number, number, number];
  elbowR: [number, number, number];
  hipL: [number, number, number];
  hipR: [number, number, number];
  kneeL: [number, number, number];
  kneeR: [number, number, number];
};

const NEUTRAL: LimbRotations = {
  spine: [0, 0, 0],
  head: [0, 0, 0],
  shoulderL: [0, 0, 0.05],
  shoulderR: [0, 0, -0.05],
  elbowL: [0.1, 0, 0],
  elbowR: [0.1, 0, 0],
  hipL: [0, 0, 0.02],
  hipR: [0, 0, -0.02],
  kneeL: [0, 0, 0],
  kneeR: [0, 0, 0],
};

export const DANTE_POSES: Record<DantePoseName, LimbRotations> = {
  idle_breathing: NEUTRAL,

  // Walking is additionally time-animated (leg/arm swing) in
  // use-dante-pose.ts — this is just the neutral base it swings around.
  walk_in: NEUTRAL,

  classic_vacuum: {
    ...NEUTRAL,
    spine: [-0.08, 0, 0],
    shoulderL: [0.3, 0, 1.1],
    shoulderR: [0.3, 0, -1.1],
    elbowL: [1.6, 0, 0],
    elbowR: [1.6, 0, 0],
  },

  front_double_biceps: {
    ...NEUTRAL,
    spine: [0.05, 0, 0],
    shoulderL: [0.2, 0, 1.5],
    shoulderR: [0.2, 0, -1.5],
    elbowL: [2.1, 0, 0],
    elbowR: [2.1, 0, 0],
    hipL: [0, 0, 0.15],
    hipR: [0, 0, -0.15],
  },

  side_chest: {
    ...NEUTRAL,
    spine: [0, 0.6, 0.1],
    shoulderL: [0.9, 0.3, 0.4],
    shoulderR: [0.4, -0.2, -1.0],
    elbowL: [1.8, 0, 0],
    elbowR: [1.3, 0, 0],
  },

  point_to_ui: {
    ...NEUTRAL,
    spine: [0, 0.15, 0],
    shoulderR: [1.1, 0, -0.3],
    elbowR: [0.15, 0, 0],
    head: [0, 0.15, 0],
  },

  explain_gesture: {
    ...NEUTRAL,
    shoulderR: [0.7, 0.2, -0.5],
    elbowR: [0.9, 0, 0],
    head: [0, -0.1, 0],
  },

  handoff: {
    ...NEUTRAL,
    spine: [0.1, 0, 0],
    shoulderL: [0.5, -0.3, 0.6],
    shoulderR: [0.5, 0.3, -0.6],
    elbowL: [0.3, 0, 0],
    elbowR: [0.3, 0, 0],
    head: [0.05, 0, 0],
  },
};

/**
 * App-state -> pose mapping (spec §23). Deliberately narrow: not
 * every screen gets a distinct pose ("do not overanimate every
 * screen").
 */
export type DanteAppState = "ready" | "recovery_low" | "personal_best" | "explanation" | "warning";

export const APP_STATE_POSE: Record<DanteAppState, DantePoseName> = {
  ready: "idle_breathing",
  recovery_low: "idle_breathing",
  personal_best: "front_double_biceps",
  explanation: "explain_gesture",
  warning: "point_to_ui",
};
