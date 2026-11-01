/**
 * SetVision P0 — evidence-grounded uploaded-video analysis.
 * Scope: bodyweight squat, side view, ≤ 30 s clip. See docs/setvision.md "P0".
 *
 * COORDINATE SYSTEM
 * `PosePoint.x/y` are MediaPipe Pose Landmarker *normalized image*
 * coordinates: x ∈ [0,1] of frame width, y ∈ [0,1] of frame height,
 * origin top-left, y pointing down. Values slightly outside [0,1] mean the
 * model extrapolated a landmark beyond the frame. The model's `z` and its
 * metric world landmarks are deliberately NOT used. Every angle in this
 * module is a 2D image-plane angle computed in pixel space
 * (x·frameWidth, y·frameHeight) — a camera-dependent projection, not a
 * validated 3D joint angle.
 */

export type Side = "left" | "right";
export type JointName = "shoulder" | "hip" | "knee" | "ankle";

export type PosePoint = {
  x: number;
  y: number;
  /** MediaPipe `visibility` (0–1): model's likelihood the point is visible, not occluded. */
  visibility: number;
};

/**
 * One timestamped pose observation — the single input the movement engine
 * accepts. Producers: the uploaded-video sampler today; a live camera
 * adapter later. The engine never sees a <video>, a camera or React.
 */
export type PoseObservation = {
  /** Media time of the analysed frame in ms from the start of the video (never wall-clock). */
  timestampMs: number;
  /**
   * "seek": the analysed frame is the one the browser decoded for a seek to
   * `timestampMs` (true frame PTS is ≤ timestampMs by < 1 frame interval).
   * "frame": exact presented-frame media time (e.g. requestVideoFrameCallback).
   */
  timestampSource: "seek" | "frame";
  frameWidth: number;
  frameHeight: number;
  /** How many people the detector returned for this frame. */
  poseCount: number;
  /** Landmarks of the single detected person; null when poseCount !== 1 (no identity is guessed). */
  landmarks: Record<Side, Record<JointName, PosePoint>> | null;
};

/* ---------------- quality gate ---------------- */

export type FrameIssue =
  | "invalid_timestamp"
  | "no_pose"
  | "multiple_people"
  | "low_visibility"
  | "out_of_frame"
  | "discontinuity";

export type FrameAssessment = {
  timestampMs: number;
  valid: boolean;
  issue: FrameIssue | null;
  /** 2D image-plane knee angle (hip–knee–ankle) on the locked side; null when the frame is invalid. */
  kneeAngleDeg: number | null;
};

export type QualityCheckStatus = "IMPLEMENTED_AND_MEASURED" | "HEURISTIC_ONLY" | "NOT_IMPLEMENTED";

export type QualityCheck = {
  id: string;
  label: string;
  status: QualityCheckStatus;
  result: "pass" | "warn" | "fail" | "not_assessed";
  detail: string;
};

export type TrackingLossInterval = {
  startMs: number;
  endMs: number;
  /** Most frequent per-frame issue inside the interval. */
  issue: FrameIssue;
  /** "bridged": short enough to interpolate across; "gap": rep inside is UNCERTAIN; "lost": state reset, reps inside cannot be counted. */
  severity: "bridged" | "gap" | "lost";
};

/* ---------------- rep events ---------------- */

export type RepOutcome = "COMPLETED" | "PARTIAL" | "UNCERTAIN";

export type RepReason =
  | "below_cycle_flexion"
  | "tracking_gap"
  | "tracking_lost"
  | "onset_not_observed"
  | "video_ended_mid_cycle"
  | "implausibly_fast";

export type RepPhase = { phase: "descent" | "ascent"; startMs: number; endMs: number };

export type RepEvent = {
  id: string;
  index: number;
  outcome: RepOutcome;
  startMs: number;
  endMs: number;
  /** Time of the smallest observed knee angle (the turning point); null if never observed. */
  bottomMs: number | null;
  phases: RepPhase[];
  features: {
    /** 2D image-plane knee angle at the start / turning point / end of the cycle (smoothed). */
    startKneeDeg: number | null;
    minKneeDeg: number | null;
    endKneeDeg: number | null;
    /** Times the movement reversed direction mid-cycle (e.g. a bounce) — still one cycle. */
    reversals: number;
    validFrames: number;
    /** Longest interval between consecutive valid frames inside the cycle. */
    maxGapMs: number;
  };
  reasons: RepReason[];
};

export type SquatAnalysis = {
  engineVersion: string;
  exercise: "bodyweight_squat";
  cameraView: "side";
  status: "ANALYZED" | "INSUFFICIENT_EVIDENCE";
  /** Why the engine abstained (empty when ANALYZED). */
  insufficientReasons: string[];
  /** Null when the engine abstained — no count is reported without evidence. */
  counts: { completed: number; partial: number; uncertain: number } | null;
  events: RepEvent[];
  trackingLoss: TrackingLossInterval[];
  quality: {
    checks: QualityCheck[];
    sampledFrames: number;
    validFrames: number;
    lockedSide: Side | null;
  };
  /** Smoothed knee-angle series used by the state machine (inspectable intermediate). */
  series: Array<{ t: number; kneeDeg: number | null }>;
  durationMs: number;
  limitations: string[];
};

/* ---------------- user corrections ---------------- */

/** A correction is the user's claim, never expert ground truth. */
export type RepCorrection =
  | { kind: "relabel"; eventId: string; outcome: RepOutcome | "NOT_A_REP"; by: "user"; atIso: string }
  | { kind: "added"; id: string; atMs: number; outcome: RepOutcome; by: "user"; atIso: string };
