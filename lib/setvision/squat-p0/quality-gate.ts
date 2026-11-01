import { angleAt } from "@/lib/form-coach/geometry";
import { SQUAT_P0 } from "@/lib/setvision/squat-p0/config";
import type {
  FrameAssessment,
  FrameIssue,
  JointName,
  PoseObservation,
  PosePoint,
  QualityCheck,
  Side,
  TrackingLossInterval,
} from "@/lib/setvision/squat-p0/types";

const REQUIRED: JointName[] = ["shoulder", "hip", "knee", "ankle"];

type Px = { x: number; y: number; score: number };

function px(p: PosePoint, o: PoseObservation): Px {
  return { x: p.x * o.frameWidth, y: p.y * o.frameHeight, score: p.visibility };
}

function dist(a: Px, b: Px): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Lock ONE side for the whole clip: the side whose hip/knee/ankle the model
 * sees best on average. Picking per frame would let left and right joints
 * mix and the angle jump when the far leg briefly scores higher.
 */
export function lockSide(observations: PoseObservation[]): Side | null {
  const score: Record<Side, number[]> = { left: [], right: [] };
  for (const o of observations) {
    if (o.poseCount !== 1 || !o.landmarks) continue;
    for (const side of ["left", "right"] as const) {
      const l = o.landmarks[side];
      score[side].push(Math.min(l.hip.visibility, l.knee.visibility, l.ankle.visibility));
    }
  }
  if (score.left.length === 0) return null;
  const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
  return mean(score.left) >= mean(score.right) ? "left" : "right";
}

/** Per-frame validity + the knee-angle feature. Pure; one pass in time order. */
export function assessFrames(observations: PoseObservation[], side: Side | null): FrameAssessment[] {
  const out: FrameAssessment[] = [];
  let lastT = -Infinity;
  let lastValidHip: { t: number; hip: Px; leg: number } | null = null;

  for (const o of observations) {
    const t = o.timestampMs;
    const base = { timestampMs: t, valid: false, kneeAngleDeg: null };

    if (!Number.isFinite(t) || t < 0 || t <= lastT) {
      out.push({ ...base, issue: "invalid_timestamp" });
      continue;
    }
    lastT = t;

    if (o.frameStatus === "stale") {
      out.push({ ...base, issue: "stale_frame" });
      continue;
    }

    if (o.poseCount === 0 || !o.landmarks || !side) {
      out.push({ ...base, issue: o.poseCount > 1 ? "multiple_people" : "no_pose" });
      continue;
    }
    if (o.poseCount > 1) {
      out.push({ ...base, issue: "multiple_people" });
      continue;
    }

    const l = o.landmarks[side];
    const pts = REQUIRED.map((j) => l[j]);
    if (pts.some((p) => p.visibility < SQUAT_P0.minVisibility)) {
      out.push({ ...base, issue: "low_visibility" });
      continue;
    }
    const m = SQUAT_P0.frameMargin;
    if (pts.some((p) => p.x < -m || p.x > 1 + m || p.y < -m || p.y > 1 + m)) {
      out.push({ ...base, issue: "out_of_frame" });
      continue;
    }

    const hip = px(l.hip, o);
    const knee = px(l.knee, o);
    const ankle = px(l.ankle, o);
    const leg = dist(hip, knee) + dist(knee, ankle);

    if (
      lastValidHip &&
      t - lastValidHip.t <= SQUAT_P0.discontinuityWindowMs &&
      dist(hip, lastValidHip.hip) > SQUAT_P0.discontinuityLegRatio * Math.max(leg, lastValidHip.leg)
    ) {
      // Do not update lastValidHip: the jump itself is the suspect frame.
      out.push({ ...base, issue: "discontinuity" });
      continue;
    }

    lastValidHip = { t, hip, leg };
    out.push({ timestampMs: t, valid: true, issue: null, kneeAngleDeg: angleAt(hip, knee, ankle) });
  }
  return out;
}

/** Runs of invalid frames → intervals bounded by the surrounding valid frames. */
export function buildTrackingLoss(frames: FrameAssessment[], durationMs: number): TrackingLossInterval[] {
  const intervals: TrackingLossInterval[] = [];
  let i = 0;
  while (i < frames.length) {
    if (frames[i].valid || frames[i].issue === "invalid_timestamp") {
      i += 1;
      continue;
    }
    const runStart = i;
    const counts = new Map<FrameIssue, number>();
    while (i < frames.length && !frames[i].valid) {
      const issue = frames[i].issue;
      if (issue && issue !== "invalid_timestamp") counts.set(issue, (counts.get(issue) ?? 0) + 1);
      i += 1;
    }
    const prevValid = runStart > 0 ? frames[runStart - 1].timestampMs : 0;
    const nextValid = i < frames.length ? frames[i].timestampMs : durationMs;
    const span = nextValid - prevValid;
    const issue = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "no_pose";
    intervals.push({
      startMs: prevValid,
      endMs: nextValid,
      issue,
      severity:
        span <= SQUAT_P0.bridgeGapMs ? "bridged" : span <= SQUAT_P0.maxBridgeGapMs ? "gap" : "lost",
    });
  }
  return intervals;
}

/**
 * Clip-level checks. Each declares its implementation status honestly:
 * HEURISTIC_ONLY means a plausible rule with no measured error rate.
 */
export function clipQualityChecks(
  observations: PoseObservation[],
  frames: FrameAssessment[],
  side: Side | null,
): { checks: QualityCheck[]; abstainReasons: string[] } {
  const n = frames.length;
  const valid = frames.filter((f) => f.valid).length;
  const count = (issue: FrameIssue) => frames.filter((f) => f.issue === issue).length;
  const pct = (k: number) => (n ? Math.round((k / n) * 100) : 0);
  const abstain: string[] = [];
  const checks: QualityCheck[] = [];

  const badTs = count("invalid_timestamp");
  const tsFail = n > 0 && badTs / n > SQUAT_P0.maxInvalidTimestampRatio;
  if (tsFail) abstain.push(`${pct(badTs)}% of frames had invalid or non-increasing timestamps.`);
  checks.push({
    id: "timestamps",
    label: "Frame timestamps",
    status: "IMPLEMENTED_AND_MEASURED",
    result: tsFail ? "fail" : badTs > 0 ? "warn" : "pass",
    detail: `${badTs} of ${n} frames rejected for a non-finite, negative or non-increasing media timestamp.`,
  });

  const stale = frames.filter((f) => f.issue === "stale_frame");
  const staleFail = n > 0 && stale.length / n > SQUAT_P0.maxStaleFrameRatio;
  if (staleFail) {
    abstain.push(`The video stopped producing new frames from ${(stale[0].timestampMs / 1000).toFixed(1)} s; the file may be damaged or truncated.`);
  }
  checks.push({
    id: "decoded",
    label: "Every sampled position decoded",
    status: "HEURISTIC_ONLY",
    result: staleFail ? "fail" : stale.length > 0 ? "warn" : "pass",
    detail: `${stale.length} of ${n} seeks produced no newly decoded frame (browser decoded-frame counter did not advance); those frames are never analysed. Relies on getVideoPlaybackQuality().`,
  });

  const multi = count("multiple_people");
  const multiFail = n > 0 && multi / n > SQUAT_P0.maxMultiPersonRatio;
  if (multiFail) abstain.push(`More than one person was detected in ${pct(multi)}% of frames; the engine cannot tell who to follow.`);
  checks.push({
    id: "single_person",
    label: "Single person in frame",
    status: "HEURISTIC_ONLY",
    result: multiFail ? "fail" : multi > 0 ? "warn" : "pass",
    detail: `Detector returned >1 person in ${multi} frames. Those frames are discarded, never re-assigned to a guessed identity. Detection is limited by the model; a partly visible bystander may go unnoticed.`,
  });

  const lowVis = count("low_visibility") + count("no_pose");
  checks.push({
    id: "landmarks",
    label: "Hip, knee, ankle and shoulder visible",
    status: "HEURISTIC_ONLY",
    result: lowVis === 0 ? "pass" : lowVis / Math.max(1, n) > 0.3 ? "fail" : "warn",
    detail: `${lowVis} frames had no person or a required joint below visibility ${SQUAT_P0.minVisibility} on the ${side ?? "unknown"} side. Visibility is the model's own estimate, not a measured occlusion rate.`,
  });

  const oof = count("out_of_frame");
  checks.push({
    id: "framing",
    label: "Full body inside the frame",
    status: "HEURISTIC_ONLY",
    result: oof === 0 ? "pass" : oof / Math.max(1, n) > 0.3 ? "fail" : "warn",
    detail: `${oof} frames had a required joint outside the image (model extrapolation is not trusted).`,
  });

  const disc = count("discontinuity");
  checks.push({
    id: "continuity",
    label: "Tracking continuity",
    status: "HEURISTIC_ONLY",
    result: disc === 0 ? "pass" : "warn",
    detail: `${disc} frames discarded where the hip jumped more than ${SQUAT_P0.discontinuityLegRatio}× leg length between nearby frames (possible identity switch, cut or glitch).`,
  });

  // Side view: in profile the two hips overlap horizontally; frontally they sit a hip-width apart.
  let sepMedian: number | null = null;
  if (side) {
    const seps: number[] = [];
    observations.forEach((o, i) => {
      if (!frames[i]?.valid || !o.landmarks) return;
      const l = o.landmarks[side];
      const torso = dist(px(l.shoulder, o), px(l.hip, o));
      if (torso > 0) seps.push(Math.abs(o.landmarks.left.hip.x - o.landmarks.right.hip.x) * o.frameWidth / torso);
    });
    sepMedian = median(seps);
  }
  const notSide = sepMedian !== null && sepMedian > SQUAT_P0.sideViewMaxHipSeparation;
  if (notSide) abstain.push("The camera does not appear to be side-on; 2D knee angles from this view are not usable for counting.");
  checks.push({
    id: "side_view",
    label: "Side-on camera view",
    status: "HEURISTIC_ONLY",
    result: sepMedian === null ? "not_assessed" : notSide ? "fail" : "pass",
    detail:
      sepMedian === null
        ? "Not enough valid frames to assess the view."
        : `Median left–right hip separation ${sepMedian.toFixed(2)}× torso length (side view expected ≤ ${SQUAT_P0.sideViewMaxHipSeparation}). Threshold not calibrated on real clips.`,
  });

  // Ankle drift: the feet stay planted in a bodyweight squat, so a moving ankle means the
  // person stepped or the camera moved. Knee angle itself is unaffected by camera translation.
  let drift: number | null = null;
  if (side) {
    const pts: Array<{ t: number; x: number; y: number; leg: number }> = [];
    observations.forEach((o, i) => {
      if (!frames[i]?.valid || !o.landmarks) return;
      const l = o.landmarks[side];
      const hip = px(l.hip, o), knee = px(l.knee, o), ankle = px(l.ankle, o);
      pts.push({ t: o.timestampMs, x: ankle.x, y: ankle.y, leg: dist(hip, knee) + dist(knee, ankle) });
    });
    if (pts.length >= SQUAT_P0.minValidFrames) {
      const early = pts.slice(0, 10);
      const ax = median(early.map((p) => p.x))!, ay = median(early.map((p) => p.y))!;
      const leg = median(pts.map((p) => p.leg))!;
      drift = leg > 0 ? Math.max(...pts.map((p) => Math.hypot(p.x - ax, p.y - ay))) / leg : null;
    }
  }
  checks.push({
    id: "camera_or_feet_moved",
    label: "Feet / camera stayed put",
    status: "HEURISTIC_ONLY",
    result: drift === null ? "not_assessed" : drift > SQUAT_P0.ankleDriftLegRatio ? "warn" : "pass",
    detail:
      drift === null
        ? "Not enough valid frames."
        : `Max ankle drift ${drift.toFixed(2)}× leg length. Cannot tell camera motion from the person stepping.`,
  });

  checks.push({
    id: "camera_stability",
    label: "Camera stability",
    status: "NOT_IMPLEMENTED",
    result: "not_assessed",
    detail: "Camera shake/pan/zoom is not detected from the image. Record with a fixed camera (tripod or propped phone).",
  });
  checks.push({
    id: "lighting",
    label: "Lighting",
    status: "NOT_IMPLEMENTED",
    result: "not_assessed",
    detail: "Lighting is not measured directly; poor light shows up only indirectly as low landmark visibility.",
  });

  if (n > 0 && valid < SQUAT_P0.minValidFrames) abstain.push(`Only ${valid} usable frames (need ${SQUAT_P0.minValidFrames}).`);
  else if (n > 0 && valid / n < SQUAT_P0.minValidRatio) abstain.push(`Only ${pct(valid)}% of frames were usable (need ${SQUAT_P0.minValidRatio * 100}%).`);
  if (n === 0) abstain.push("No frames were analysed.");

  return { checks, abstainReasons: abstain };
}
