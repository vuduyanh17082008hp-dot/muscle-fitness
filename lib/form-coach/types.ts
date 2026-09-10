export type ExerciseId = "squat" | "pushup" | "plank"

export type Landmark = {
  x: number
  y: number
  score: number
}

/** A single detected pose, keyed by MoveNet/COCO keypoint name. */
export type PoseFrame = Partial<Record<string, Landmark>>

export type Quality = "good" | "watch" | "poor" | "unknown"

export type LiveCue = {
  message: string
  severity: "info" | "watch" | "good"
}

/* =========================================================
   VISIBILITY
========================================================= */

export type VisibilityResult = {
  ok: boolean
  message: string | null
}

/* =========================================================
   SQUAT
========================================================= */

export type SquatPhase =
  | "standing"
  | "descending"
  | "bottom"
  | "ascending"

export type SquatRepQuality = {
  repNumber: number
  depth: Quality
  torso: Quality
  kneeTracking: Quality
  minKneeAngle: number
  descentMs: number
}

export type SquatFrameResult = {
  visibility: VisibilityResult
  phase: SquatPhase
  repCount: number
  hipAngle: number | null
  kneeAngle: number | null
  torsoInclinationDeg: number | null
  kneeTrackingOffset: number | null
  currentRepDepth: Quality
  currentRepTorso: Quality
  currentRepKneeTracking: Quality
  movement: "controlled" | "rushed" | "unknown"
  cue: LiveCue | null
  lastCompletedRep: SquatRepQuality | null
}

/* =========================================================
   PUSH-UP
========================================================= */

export type PushupPhase = "up" | "descending" | "down" | "ascending"

export type PushupRepQuality = {
  repNumber: number
  depth: Quality
  bodyLine: Quality
  minElbowAngle: number
}

export type PushupFrameResult = {
  visibility: VisibilityResult
  phase: PushupPhase
  repCount: number
  elbowAngle: number | null
  bodyLineAngleDeg: number | null
  currentRepDepth: Quality
  currentRepBodyLine: Quality
  cue: LiveCue | null
  lastCompletedRep: PushupRepQuality | null
}

/* =========================================================
   PLANK
========================================================= */

export type PlankFrameResult = {
  visibility: VisibilityResult
  bodyLineAngleDeg: number | null
  bodyLine: Quality
  holdMs: number
  stability: Quality
  cue: LiveCue | null
}

/* =========================================================
   SESSION SUMMARY (sent to Dante — compact, never raw video)
========================================================= */

export type FormSessionSummary = {
  exercise: ExerciseId
  repsAnalyzed: number
  durationMs: number
  depthAcceptable: number | null
  torsoWarningReps: number | null
  kneeTrackingWarningReps: number | null
  bodyLineWarningReps: number | null
  holdMs: number | null
}
