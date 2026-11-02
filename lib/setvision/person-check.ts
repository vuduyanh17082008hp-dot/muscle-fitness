import { confidentPoint } from "@/lib/setvision/exercise-config";
import type { DetectedPerson, TimedPoseFrame } from "@/lib/setvision/types";

/**
 * Who is in the clip? Runs on the MultiPose detections the upload collector
 * stores per sample (TimedPoseFrame.people). Rep analysis is only allowed when
 * the evidence says ONE credible person was tracked as ONE identity; any
 * other answer — a second person, an identity change, or a check that could
 * not see the athlete — refuses the clip. Seeing one person is never taken
 * as proof that nobody else was there (see RESIDUAL_LIMITATION).
 */

/** A person = a pose at the detector floor (0.2) with ≥ 8 confident keypoints. Real bystanders in test clips scored 0.20–0.33 with 13–17 keypoints; 0.3 missed half of them. */
export const MIN_PERSON_SCORE = 0.2;
export const MIN_PERSON_KEYPOINTS = 8;
/** Consecutive samples (≈ 0.2 s at 10 Hz) before a second person / new identity is believed. */
export const MIN_RUN = 2;
/** Share of athlete-visible samples in which the person check must also find someone. */
export const MIN_COVERAGE = 0.6;

export const RESIDUAL_LIMITATION =
  "The person check found one person throughout, but someone fully hidden, very small or cut off at the frame edge can still go undetected — re-record if anyone else was in view.";

export type PersonCheck =
  | { verdict: "single"; limitations: string[] }
  | { verdict: "not_run"; limitations: string[] }
  | { verdict: "multiple" | "identity_changed" | "unconfirmed"; reason: string; limitations: string[] };

export const credible = (p: DetectedPerson) => p.score >= MIN_PERSON_SCORE && p.visible >= MIN_PERSON_KEYPOINTS;

const sec = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** [startMs, endMs] runs of ≥ MIN_RUN consecutive samples where `hit` holds. */
function runs(frames: TimedPoseFrame[], hit: (f: TimedPoseFrame) => boolean): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  frames.forEach((f, i) => {
    if (hit(f) && start < 0) start = i;
    const ends = start >= 0 && (!hit(f) || i === frames.length - 1);
    if (!ends) return;
    const last = hit(f) ? i : i - 1;
    if (last - start + 1 >= MIN_RUN) out.push([frames[start].timestampMs, frames[last].timestampMs]);
    start = -1;
  });
  return out;
}

const athleteVisible = (f: TimedPoseFrame) =>
  Boolean(confidentPoint(f.frame, "left_shoulder") || confidentPoint(f.frame, "right_shoulder")) &&
  Boolean(confidentPoint(f.frame, "left_hip") || confidentPoint(f.frame, "right_hip"));

/**
 * Hard cuts: the whole picture changes at once — an edited, spliced or composite video, where the
 * person after the cut need not be the person before it (a MultiPose tracker id can survive a cut).
 * A cut = a sample whose change is ≥ CUT_MIN_DIFF AND ≥ CUT_RATIO × the median change of its ±1 s
 * neighbours (so a hand-held, constantly moving camera is not a cut), with neither side black
 * (a fade or blackout is left to the identity check). Calibrated 2026-11-02 on real clips: single
 * takes peak at ≤ 5.4, a hand-held curl at 20–46 sustained; real cuts 32–84 against neighbours ≤ 6.
 */
// ponytail: a-priori thresholds from ~20 clips; recalibrate with more real phone recordings.
export const CUT_MIN_DIFF = 25;
export const CUT_RATIO = 4;
const BLACK_LUMA = 16;
/**
 * Dissolves and fades change each frame only a little, but replace most of the picture within a
 * second: ≥ SPAN_CHANGED of the thumbnail changing by > 30 levels vs ~1 s earlier. Real cross-dissolves
 * measured 0.56–0.71; fixed-camera single takes ≤ 0.15 and a split-screen composite 0.36. A hand-held
 * camera swinging around also exceeds it (0.81) and is refused too — tracking can't hold it either.
 */
export const SPAN_CHANGED = 0.5;

export function findSceneCuts(frames: TimedPoseFrame[]): number[] {
  const cuts: number[] = [];
  frames.forEach((f, i) => {
    const d = f.scene?.diff;
    const prev = frames[i - 1]?.scene;
    if (d == null || !prev || d < CUT_MIN_DIFF || f.scene!.luma < BLACK_LUMA || prev.luma < BLACK_LUMA) return;
    const around = frames
      .filter((g, j) => j !== i && Math.abs(g.timestampMs - f.timestampMs) <= 1000 && g.scene?.diff != null)
      .map((g) => g.scene!.diff as number)
      .sort((a, b) => a - b);
    const med = around.length ? around[Math.floor(around.length / 2)] : 0;
    if (d >= CUT_RATIO * Math.max(med, 1)) cuts.push(f.timestampMs);
  });
  // Gradual transitions: first sample of each run over SPAN_CHANGED (dated ~1 s back, where it began).
  frames.forEach((f, i) => {
    const over = (g?: TimedPoseFrame) => (g?.scene?.span ?? 0) >= SPAN_CHANGED;
    if (over(f) && !over(frames[i - 1])) {
      const start = Math.max(0, f.timestampMs - 1000);
      if (!cuts.some((c) => Math.abs(c - start) <= 1500)) cuts.push(start);
    }
  });
  return cuts.sort((a, b) => a - b);
}

export function checkPersonAttribution(frames: TimedPoseFrame[]): PersonCheck {
  if (frames.length === 0 || frames.every((f) => f.people === undefined)) {
    return { verdict: "not_run", limitations: [] };
  }

  const people = (f: TimedPoseFrame) => (f.people ?? []).filter(credible);

  const many = runs(frames, (f) => people(f).length >= 2);
  if (many.length > 0) {
    const when = many.slice(0, 3).map(([a, b]) => (a === b ? sec(a) : `${sec(a)}–${sec(b)}`)).join(", ");
    return {
      verdict: "multiple",
      reason: `More than one person was detected in the video (${when}). SetVision can't be sure whose movement it measured, so no reps or form results are reported. Re-record with only you in view.`,
      limitations: [],
    };
  }

  // Identity: the tracker id of the one credible person, held for at least MIN_RUN samples.
  // Reported time = when the identity FIRST appeared in that run, not when it became confirmed.
  const ids = new Map<number, number>();
  let prevId: number | null = null;
  let streak = 0;
  let streakStartMs = 0;
  for (const f of frames) {
    const p = people(f);
    const id = p.length === 1 ? p[0].id : null;
    if (id !== null && id === prevId) streak += 1;
    else {
      streak = id !== null ? 1 : 0;
      streakStartMs = f.timestampMs;
    }
    prevId = id;
    if (id !== null && streak === MIN_RUN && !ids.has(id)) ids.set(id, streakStartMs);
  }
  if (ids.size > 1) {
    const changes = [...ids.values()].slice(1, 4).map(sec).join(", ");
    return {
      verdict: "identity_changed",
      reason: `The person tracker lost the athlete and picked up a new identity at ${changes} (someone else, or you after being hidden or leaving the frame). Reps can't be attributed to one person, so none are reported. Re-record with only you in view and nothing passing in front of the camera.`,
      limitations: [],
    };
  }

  const visible = frames.filter(athleteVisible);
  const confirmed = visible.filter((f) => f.people !== null && people(f).length === 1).length;
  if (visible.length > 0 && confirmed / visible.length < MIN_COVERAGE) {
    return {
      verdict: "unconfirmed",
      reason: `The person check could confirm a single person in only ${Math.round((confirmed / visible.length) * 100)}% of the frames where a body was tracked, so it can't rule out someone else being measured. Re-record in better light with your whole body in view.`,
      limitations: [],
    };
  }

  const blips = frames.filter((f) => people(f).length >= 2).map((f) => f.timestampMs);
  return {
    verdict: "single",
    limitations: [
      ...(blips.length > 0 ? [`A second person was briefly detected in single frames (${blips.slice(0, 3).map(sec).join(", ")}) — too short to confirm; check the video.`] : []),
      RESIDUAL_LIMITATION,
    ],
  };
}
