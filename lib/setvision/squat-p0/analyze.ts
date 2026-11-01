import { SQUAT_P0 } from "@/lib/setvision/squat-p0/config";
import {
  assessFrames,
  buildTrackingLoss,
  clipQualityChecks,
  lockSide,
} from "@/lib/setvision/squat-p0/quality-gate";
import { createSquatRepCounter, smoothMedian3 } from "@/lib/setvision/squat-p0/rep-counter";
import type { PoseObservation, RepCorrection, RepEvent, SquatAnalysis } from "@/lib/setvision/squat-p0/types";

const LIMITATIONS = [
  "Counts movement cycles only. It does not judge squat depth, technique, safety, competition validity or injury risk.",
  "Knee angles are 2D image-plane projections from one camera, not measured 3D joint angles.",
  "Thresholds were set a priori and have not been evaluated against annotated real-world clips.",
  "Rep boundaries are resolved to the 100 ms sampling grid; the analysed frame can precede its timestamp by up to one frame.",
  "Designed for a side-on, fixed camera with one person fully in frame. Other setups may be rejected or miscounted.",
];

/**
 * Pose observations → quality gate → knee-angle series → state machine →
 * evidence. Pure and deterministic: same observations, same analysis.
 */
export function analyzeSquatObservations(
  observations: PoseObservation[],
  durationMs: number,
): SquatAnalysis {
  const side = lockSide(observations);
  const frames = assessFrames(observations, side);
  const trackingLoss = buildTrackingLoss(frames, durationMs);
  const { checks, abstainReasons } = clipQualityChecks(observations, frames, side);

  const smoothed = smoothMedian3(
    frames.filter((f) => f.valid).map((f) => ({ t: f.timestampMs, kneeDeg: f.kneeAngleDeg! })),
  );
  const byT = new Map(smoothed.map((s) => [s.t, s.kneeDeg]));
  const series = frames
    .filter((f) => f.issue !== "invalid_timestamp")
    .map((f) => ({ t: f.timestampMs, kneeDeg: byT.get(f.timestampMs) ?? null }));

  if (smoothed.length > 0 && !smoothed.some((s) => s.kneeDeg >= SQUAT_P0.standMinDeg)) {
    abstainReasons.push("The person was never observed standing, so no movement cycle can be anchored.");
  }

  const base = {
    engineVersion: SQUAT_P0.engineVersion,
    exercise: "bodyweight_squat" as const,
    cameraView: "side" as const,
    trackingLoss,
    quality: {
      checks,
      sampledFrames: frames.length,
      validFrames: smoothed.length,
      lockedSide: side,
    },
    series,
    durationMs,
    limitations: LIMITATIONS,
  };

  if (abstainReasons.length > 0) {
    return { ...base, status: "INSUFFICIENT_EVIDENCE", insufficientReasons: abstainReasons, counts: null, events: [] };
  }

  const counter = createSquatRepCounter();
  for (const s of smoothed) counter.push(s);
  const events = counter.finish();

  return {
    ...base,
    status: "ANALYZED",
    insufficientReasons: [],
    counts: summarize(events.map((e) => e.outcome)),
    events,
  };
}

function summarize(outcomes: string[]) {
  return {
    completed: outcomes.filter((o) => o === "COMPLETED").length,
    partial: outcomes.filter((o) => o === "PARTIAL").length,
    uncertain: outcomes.filter((o) => o === "UNCERTAIN").length,
  };
}

/**
 * Detected events with the user's corrections applied on top. The detected
 * result is never mutated; every corrected item stays attributed to the user.
 */
export function applyCorrections(events: RepEvent[], corrections: RepCorrection[]) {
  const relabels = new Map<string, RepCorrection & { kind: "relabel" }>();
  for (const c of corrections) if (c.kind === "relabel") relabels.set(c.eventId, c);

  const items = [
    ...events.map((e) => {
      const r = relabels.get(e.id);
      return { id: e.id, atMs: e.startMs, detected: e.outcome, outcome: r ? r.outcome : e.outcome, correctedByUser: Boolean(r) };
    }),
    ...corrections
      .filter((c): c is RepCorrection & { kind: "added" } => c.kind === "added")
      .map((c) => ({ id: c.id, atMs: c.atMs, detected: null, outcome: c.outcome, correctedByUser: true })),
  ].sort((a, b) => a.atMs - b.atMs);

  const kept = items.filter((i) => i.outcome !== "NOT_A_REP").map((i) => i.outcome);
  return { items, counts: summarize(kept), corrected: corrections.length > 0 };
}
