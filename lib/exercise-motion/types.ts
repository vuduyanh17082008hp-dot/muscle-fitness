/**
 * Procedural joint-vector model for exercise technique animation.
 *
 * This is intentionally NOT pose-estimation (that's MoveNet/COCO-17,
 * already used by SetVision/Form Coach for live camera analysis —
 * see lib/vision). This is a small, hand-authored stick-figure model
 * used purely to illustrate technique: a fixed set of named joints,
 * a handful of keyframe poses ("phases") per exercise, and simple
 * linear interpolation between them. No images, no GIFs, no external
 * assets — just SVG lines/circles driven by coordinates.
 */

export type JointId =
  | "head"
  | "neck"
  | "shoulderL"
  | "shoulderR"
  | "elbowL"
  | "elbowR"
  | "wristL"
  | "wristR"
  | "hipL"
  | "hipR"
  | "kneeL"
  | "kneeR"
  | "ankleL"
  | "ankleR";

export const JOINT_IDS: JointId[] = [
  "head",
  "neck",
  "shoulderL",
  "shoulderR",
  "elbowL",
  "elbowR",
  "wristL",
  "wristR",
  "hipL",
  "hipR",
  "kneeL",
  "kneeR",
  "ankleL",
  "ankleR",
];

export type Point = { x: number; y: number };

export type Pose = Record<JointId, Point>;

/** Skeleton connectivity used to draw limb lines between joints. */
export const BONES: Array<[JointId, JointId]> = [
  ["head", "neck"],
  ["neck", "shoulderL"],
  ["neck", "shoulderR"],
  ["shoulderL", "shoulderR"],
  ["shoulderL", "elbowL"],
  ["elbowL", "wristL"],
  ["shoulderR", "elbowR"],
  ["elbowR", "wristR"],
  ["neck", "hipL"],
  ["neck", "hipR"],
  ["hipL", "hipR"],
  ["hipL", "kneeL"],
  ["kneeL", "ankleL"],
  ["hipR", "kneeR"],
  ["kneeR", "ankleR"],
];

export type MotionPhase = {
  id: string;
  /** Short label shown under the timeline, e.g. "Start", "Contract", "Return". */
  label: string;
  pose: Pose;
  /** Relative hold weight for this phase in the loop (default 1). */
  weight?: number;
};

export type ExerciseMotionData = {
  id: string;
  name: string;
  /** "sagittal" (side-on) or "frontal" (facing the viewer) — purely descriptive, both use the same joint model. */
  view: "sagittal" | "frontal";
  viewBox?: string;
  phases: MotionPhase[];
};
