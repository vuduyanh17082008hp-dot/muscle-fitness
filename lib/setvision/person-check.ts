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

/**
 * Mid-frame M vs the best linear mix of the frames before (A) and after (B) it: mean |M − (αA + (1−α)B)|
 * over mean |A − B|. A dissolve between two shots IS such a mix (≈ 0); camera or body motion is not.
 * Real clips (2026-11-03, 5 Hz): dissolves 0.00–0.12 (one slow 1.2 s close-up→wide dissolve of the
 * same person 0.46); hand-held/zoom/follow-cam motion 0.24–0.45.
 */
export function blendResidual(a: ArrayLike<number>, m: ArrayLike<number>, b: ArrayLike<number>): number {
  let num = 0;
  let den = 0;
  let ab = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = a[i] - b[i];
    num += (m[i] - b[i]) * d;
    den += d * d;
    ab += Math.abs(d);
  }
  if (ab === 0) return 1;
  const alpha = Math.min(1, Math.max(0, num / (den || 1)));
  let resid = 0;
  for (let i = 0; i < a.length; i += 1) resid += Math.abs(m[i] - (alpha * a[i] + (1 - alpha) * b[i]));
  return resid / ab;
}

/** Below this blend residual a big 1 s change is a dissolve (an edit), above it camera/body motion. */
// ponytail: a-priori from 11 real clips; the one miss is a slow same-person dissolve, still covered by the person check.
export const DISSOLVE_BLEND = 0.2;

export type SceneChanges = {
  /** Hard cuts — an edited or spliced clip. */
  cuts: number[];
  /** Cross-fades between shots — an edit, like a cut. */
  dissolves: number[];
  /** Most of the picture changed within ~1 s without being a mix of two shots — the camera moved or zoomed. */
  cameraMoves: number[];
};

export function classifySceneChanges(frames: TimedPoseFrame[]): SceneChanges {
  const spans = sceneChangeSpans(frames);
  // A cut is dated at the first new sample; a gradual change at where it began (~1 s back).
  const of = (kind: SceneChangeSpan["kind"]) => spans.filter((s) => s.kind === kind).map((s) => (kind === "cut" ? s.endMs : s.startMs));
  return { cuts: of("cut"), dissolves: of("dissolve"), cameraMoves: of("camera_move") };
}

/** One scene change with its extent: a cut is the instant between two samples; a dissolve / camera move spans its run. */
export type SceneChangeSpan = { kind: "cut" | "dissolve" | "camera_move"; startMs: number; endMs: number };

export function sceneChangeSpans(frames: TimedPoseFrame[]): SceneChangeSpan[] {
  const spans: SceneChangeSpan[] = [];
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
    if (d >= CUT_RATIO * Math.max(med, 1)) {
      cuts.push(f.timestampMs);
      spans.push({ kind: "cut", startMs: frames[i - 1].timestampMs, endMs: f.timestampMs });
    }
  });

  // Gradual changes: each run of samples over SPAN_CHANGED, dated ~1 s back (where it began). A run is a
  // dissolve if any of its samples is a near-perfect mix of two shots — or if the mix wasn't measured (old data).
  const over = (g?: TimedPoseFrame) => (g?.scene?.span ?? 0) >= SPAN_CHANGED;
  for (let i = 0; i < frames.length; i += 1) {
    if (!over(frames[i]) || over(frames[i - 1])) continue;
    let end = i;
    while (over(frames[end + 1])) end += 1;
    const run = frames.slice(i, end + 1);
    const start = Math.max(0, frames[i].timestampMs - 1000);
    if (cuts.some((c) => Math.abs(c - start) <= 1500)) continue;
    const mixed = run.some((g) => g.scene?.blend == null || g.scene.blend < DISSOLVE_BLEND);
    // The changed run itself is untrusted; the first sample after it is the new, settled picture.
    const endMs = frames[end + 1]?.timestampMs ?? frames[end].timestampMs + 1;
    spans.push({ kind: mixed ? "dissolve" : "camera_move", startMs: start, endMs });
  }
  return spans.sort((a, b) => a.startMs - b.startMs);
}

/**
 * When the lone credible person's tracker id changed to a NEW identity: the first sample of each new id's run of
 * ≥ MIN_RUN (same rule as checkPersonAttribution's identity_changed verdict). Empty when no person check ran.
 */
// A switch back to an earlier id (A → B → A) is a change too: the B stretch is someone (or something) else.
export function identityChangeTimes(frames: TimedPoseFrame[]): number[] {
  let confirmed: number | null = null;
  const changes: number[] = [];
  let prevId: number | null = null;
  let streak = 0;
  let streakStartMs = 0;
  for (const f of frames) {
    const p = (f.people ?? []).filter(credible);
    const id = p.length === 1 ? p[0].id : null;
    if (id !== null && id === prevId) streak += 1;
    else {
      streak = id !== null ? 1 : 0;
      streakStartMs = f.timestampMs;
    }
    prevId = id;
    if (id !== null && streak === MIN_RUN && id !== confirmed) {
      if (confirmed !== null) changes.push(streakStartMs);
      confirmed = id;
    }
  }
  return changes;
}

/** Every scene change of any kind, sorted (kept for callers that only need "did the picture change?"). */
export function findSceneCuts(frames: TimedPoseFrame[]): number[] {
  const { cuts, dissolves, cameraMoves } = classifySceneChanges(frames);
  return [...cuts, ...dissolves, ...cameraMoves].sort((a, b) => a - b);
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
