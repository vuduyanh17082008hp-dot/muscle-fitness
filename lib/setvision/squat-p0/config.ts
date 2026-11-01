/**
 * Every threshold the P0 squat engine uses, in one place.
 *
 * NONE of these values has been empirically evaluated against annotated
 * real-world clips (REAL_WORLD_COUNTING_EVALUATION = BLOCKED, see
 * docs/setvision.md). They were set a priori from the movement's geometry
 * and the sampling rate, and are exercised only by synthetic tests. Treat
 * them as starting points for an evaluation, not validated constants.
 */
export const SQUAT_P0 = {
  engineVersion: "setvision-squat-p0@1",

  /* ---- media / resource limits (enforced before any decoding) ---- */
  maxDurationMs: 30_000,
  /** Small grace for container rounding (a "30 s" phone clip often reports 30.03 s). */
  durationToleranceMs: 100,
  /** ~1080p phone clip of 30 s is 40–80 MB; 150 MB leaves headroom without inviting 4K uploads. */
  maxFileBytes: 150 * 1024 * 1024,
  /** 10 Hz: ≥ 10 samples per rep for a ~1 s+ squat; ≤ 301 inferences per clip. Boundary resolution ±1 sample. */
  sampleIntervalMs: 100,
  /** A seek that never completes is treated as a decode failure. */
  seekTimeoutMs: 5_000,

  /* ---- per-frame quality gate ---- */
  /** MediaPipe visibility below this on any required joint → frame invalid. */
  minVisibility: 0.5,
  /** Required joints must lie inside the frame (normalized) with this margin. */
  frameMargin: 0.02,
  /** Hip moving > this × (thigh + shank length) between valid frames ≤ 400 ms apart → discontinuity (likely identity switch / glitch). */
  discontinuityLegRatio: 0.5,
  discontinuityWindowMs: 400,

  /* ---- clip-level gate (abstain → INSUFFICIENT_EVIDENCE) ---- */
  minValidFrames: 10,
  minValidRatio: 0.5,
  maxMultiPersonRatio: 0.2,
  maxInvalidTimestampRatio: 0.05,
  /** More than this share of seeks without a newly decoded frame → damaged/truncated file. */
  maxStaleFrameRatio: 0.1,
  /** Median |leftHip.x − rightHip.x| / torso length above this → not a side view (hips separate in a frontal view). */
  sideViewMaxHipSeparation: 0.35,
  /** Ankle displacement from its early median > this × leg length → feet or camera moved (warn only). */
  ankleDriftLegRatio: 0.35,

  /* ---- squat state machine (2D knee angle, degrees) ---- */
  /** At/above → standing. */
  standMinDeg: 155,
  /** Below → leaves standing (5° hysteresis band against jitter). */
  descentTriggerDeg: 150,
  /** Cycle minimum must reach ≤ this to be COMPLETED; otherwise PARTIAL. Not a depth standard. */
  cycleFlexionMaxDeg: 120,
  /**
   * Boundary refinement: a rep starts where the knee began flexing monotonically (walking back from the
   * descent trigger while each earlier sample is ≥ this many degrees higher) and ends where the return
   * rise flattens (< this per sample). Replaced an a-priori "within 3° of the standing peak" rule that the
   * first real clip showed anchors onsets seconds early when the lifter's knees drift while standing.
   */
  monotonicStepDeg: 1,
  /** Rise above the running minimum that confirms the turn into ascent (and vice versa for a reversal). */
  turnDeg: 8,
  /** A transition condition must hold over samples spanning ≥ this (2 samples at 10 Hz). */
  confirmMs: 100,
  /** Gaps between valid frames up to this are bridged silently (one dropped 10 Hz sample). */
  bridgeGapMs: 250,
  /** Longer gaps lose tracking: the open cycle closes UNCERTAIN and state resets. */
  maxBridgeGapMs: 1_000,
  /** A full stand→stand cycle faster than this is physically implausible for a bodyweight squat. */
  minCycleMs: 400,
} as const;

export type SquatP0Config = typeof SQUAT_P0;
