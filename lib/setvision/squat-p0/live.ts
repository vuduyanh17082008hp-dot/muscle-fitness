import { assembleSquatAnalysis, summarize } from "@/lib/setvision/squat-p0/analyze";
import { SQUAT_P0 } from "@/lib/setvision/squat-p0/config";
import { assessFrames, clipQualityChecks, createFrameAssessor, lockSide } from "@/lib/setvision/squat-p0/quality-gate";
import { createSquatRepCounter, type AngleSample } from "@/lib/setvision/squat-p0/rep-counter";
import type {
  FrameAssessment,
  FrameIssue,
  PoseObservation,
  RepEvent,
  Side,
  SquatAnalysis,
} from "@/lib/setvision/squat-p0/types";

/**
 * Form Coach P1A — live camera adapter for the P0 squat engine.
 *
 * Camera frames → PoseObservation (timestampSource "clock") → the SAME
 * frame gate, median-of-3 smoothing, state machine and clip-level checks as
 * the uploaded-clip path. Nothing here knows about React, <video> or
 * MediaPipe. Every threshold below is a-priori and unevaluated.
 */
export const LIVE_P1A = {
  adapterVersion: "form-coach-live-p1a@1",
  /** 10 Hz — the rate every P0 threshold (confirmMs, bridgeGapMs) was written for. Faster frames are skipped, not queued. */
  analysisIntervalMs: SQUAT_P0.sampleIntervalMs,
  /** A set is auto-ended after this (bounded memory: ≤ ~1,800 observations). */
  maxSetMs: 180_000,
  /** Setup checks look at this much recent footage. */
  readinessWindowMs: 1_000,
  /** ≥ this many analysed frames in the window before any setup verdict (~60 % of 10 Hz). */
  readinessMinFrames: 6,
  /** Share of window frames that must pass the per-frame gate to be Ready. */
  readinessMinValidRatio: 0.8,
} as const;

/* ---------------- frame scheduler ---------------- */

/**
 * Decides, per presented camera frame, whether to run pose inference on it.
 * Never queues: a frame that arrives while inference is busy or before the
 * analysis interval has elapsed is skipped, so latency cannot build up.
 */
export function createFrameScheduler(intervalMs: number = LIVE_P1A.analysisIntervalMs) {
  let busy = false;
  let lastTs = -Infinity;
  const stats = { offered: 0, analysed: 0, skippedInterval: 0, skippedBusy: 0, skippedNonMonotonic: 0 };
  return {
    /** true → the caller must run inference now and call `done()` afterwards. */
    tryBegin(frameTimeMs: number): boolean {
      stats.offered += 1;
      if (busy) return (stats.skippedBusy += 1), false;
      if (!Number.isFinite(frameTimeMs) || frameTimeMs <= lastTs) return (stats.skippedNonMonotonic += 1), false;
      // 2 ms slack: a 30 fps camera presents frames 33.3 ms apart, so a strict ≥ 100 would drift to 133 ms.
      if (frameTimeMs - lastTs < intervalMs - 2) return (stats.skippedInterval += 1), false;
      busy = true;
      lastTs = frameTimeMs;
      stats.analysed += 1;
      return true;
    },
    done() {
      busy = false;
    },
    stats: () => ({ ...stats }),
  };
}

/* ---------------- setup / framing ---------------- */

export type ReadinessIssue =
  | "waiting_for_frames"
  | "no_person"
  | "multiple_people"
  | "low_visibility"
  | "out_of_frame"
  | "not_side_on"
  | "not_standing"
  | "unsteady";

export type Readiness =
  | { state: "cannot_verify"; issue: ReadinessIssue; frames: number }
  | { state: "adjust"; issue: ReadinessIssue; frames: number }
  | { state: "ready"; side: Side; frames: number };

/**
 * Camera-setup verdict from real recent observations. These are the P0
 * HEURISTIC_ONLY checks applied to a 1 s window — framing guidance, not a
 * measured camera-quality score, and never a technique judgement.
 */
export function assessReadiness(recent: PoseObservation[], nowMs: number): Readiness {
  const window = recent.filter((o) => nowMs - o.timestampMs <= LIVE_P1A.readinessWindowMs);
  const n = window.length;
  if (n < LIVE_P1A.readinessMinFrames) return { state: "cannot_verify", issue: "waiting_for_frames", frames: n };

  const share = (pred: (o: PoseObservation) => boolean) => window.filter(pred).length / n;
  if (share((o) => o.poseCount > 1) > SQUAT_P0.maxMultiPersonRatio) return { state: "adjust", issue: "multiple_people", frames: n };
  if (share((o) => o.poseCount === 0) > 0.5) return { state: "cannot_verify", issue: "no_person", frames: n };

  const side = lockSide(window);
  const frames = assessFrames(window, side);
  const valid = frames.filter((f) => f.valid);
  if (!side || valid.length / n < LIVE_P1A.readinessMinValidRatio) {
    const issue = dominantIssue(frames) ?? "low_visibility";
    return { state: issue === "no_person" ? "cannot_verify" : "adjust", issue, frames: n };
  }

  const { checks } = clipQualityChecks(window, frames, side);
  if (checks.find((c) => c.id === "side_view")?.result === "fail") return { state: "adjust", issue: "not_side_on", frames: n };

  const last = valid[valid.length - 1];
  if (last.kneeAngleDeg! < SQUAT_P0.standMinDeg) return { state: "adjust", issue: "not_standing", frames: n };
  // Standing still: the knee angle should not swing more than the standing hysteresis band.
  const span = Math.max(...valid.map((f) => f.kneeAngleDeg!)) - Math.min(...valid.map((f) => f.kneeAngleDeg!));
  if (span > SQUAT_P0.standMinDeg - SQUAT_P0.descentTriggerDeg + SQUAT_P0.turnDeg) return { state: "adjust", issue: "unsteady", frames: n };

  return { state: "ready", side, frames: n };
}

function dominantIssue(frames: FrameAssessment[]): ReadinessIssue | null {
  const counts = new Map<FrameIssue, number>();
  for (const f of frames) if (f.issue) counts.set(f.issue, (counts.get(f.issue) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (top === "out_of_frame") return "out_of_frame";
  if (top === "multiple_people") return "multiple_people";
  if (top === "no_pose") return "no_person";
  return top ? "low_visibility" : null;
}

/* ---------------- live set ---------------- */

export type LiveTracking = "tracking" | "paused" | "lost";
export type LivePhase = "unknown" | "standing" | "descending" | "ascending";

export type LiveSnapshot = {
  tMs: number;
  /** tracking: counting; paused: no usable frame for > bridgeGapMs (counting paused); lost: > maxBridgeGapMs, open cycle closed UNCERTAIN. */
  tracking: LiveTracking;
  /** Most recent per-frame problem while not tracking. */
  issue: FrameIssue | null;
  phase: LivePhase;
  counts: { completed: number; partial: number; uncertain: number };
  events: RepEvent[];
  /** Live time (set clock) of the frame whose push confirmed the newest event; null when this push confirmed none. */
  confirmedAtMs: number | null;
  userPaused: boolean;
  /** The set-so-far fails the clip-level side-view check, so End Set will most likely abstain. Re-checked every ~1 s. */
  viewWarning: boolean;
};

export type LiveInterruption = { startMs: number; endMs: number; reason: "paused" | "camera" | "frame_size" | "hidden" };

export type LiveSetResult = {
  adapterVersion: string;
  /** End-of-set evidence from the shared assembly; events are [] when the set abstains. */
  analysis: SquatAnalysis;
  /** What the live counter produced, frozen at End Set — shown even when the set abstains, flagged unconfirmed. */
  liveEvents: RepEvent[];
  interruptions: LiveInterruption[];
};

const LIVE_LIMITATIONS = [
  "Counts movement cycles only. It does not judge squat depth, technique, safety, competition validity or injury risk.",
  "Knee angles are 2D image-plane projections from one camera, not measured 3D joint angles.",
  "Thresholds were set a priori for uploaded clips and have not been evaluated against annotated live sessions.",
  "Timestamps are the browser's monotonic clock at frame capture/presentation, sampled at about 10 per second; boundaries are accurate to roughly one sample.",
  "Designed for a side-on, fixed camera with one person fully in frame. People are not identified: frames with two people are discarded, and a different person stepping in is not reliably detected.",
];

/**
 * One live set on a side locked at setup. push() each analysed frame in time
 * order, tick() on a timer so a stalled camera still pauses counting, and
 * finish() once at End Set.
 *
 * Smoothing is the batch median-of-3 with a one-sample delay; for an
 * uninterrupted stream the events equal analyzeSquatObservations' on the
 * same observations and side. Interruptions (prolonged tracking loss, pause,
 * camera stop, frame-size change) close any open cycle UNCERTAIN at once and
 * are never joined across.
 */
export function createLiveSquatSession(side: Side) {
  const assess = createFrameAssessor(side);
  const counter = createSquatRepCounter();
  const observations: PoseObservation[] = [];
  const frames: FrameAssessment[] = [];
  const valid: AngleSample[] = [];
  const smoothed: AngleSample[] = [];
  const interruptions: LiveInterruption[] = [];
  let emitted = 0;
  let lastValidT: number | null = null;
  let lastT = 0;
  let lastIssue: FrameIssue | null = null;
  let lostHandled = false;
  let paused: LiveInterruption | null = null;
  let lastSize: string | null = null;
  let finished = false;
  let viewWarning = false;

  function emit(s: AngleSample) {
    smoothed.push(s);
    counter.push(s);
  }

  /** Emit every sample whose centered window is complete (batch smoothMedian3, one sample late). */
  function drain() {
    const n = valid.length;
    while (n >= 3 && emitted <= n - 2) {
      const i = emitted;
      const lo = Math.max(0, i - 1);
      const w = valid.slice(lo, lo + 3);
      const bridged = w[1].t - w[0].t <= SQUAT_P0.maxBridgeGapMs && w[2].t - w[1].t <= SQUAT_P0.maxBridgeGapMs;
      emit(bridged ? { t: valid[i].t, kneeDeg: [...w].map((x) => x.kneeDeg).sort((a, b) => a - b)[1] } : valid[i]);
      emitted += 1;
    }
  }

  /** Before an interruption: the held sample's next neighbour lies beyond a break, so batch would keep it raw. */
  function flushRaw() {
    while (emitted < valid.length) emit(valid[emitted++]);
  }

  function interrupt(reason: "tracking_lost" | "session_interrupted") {
    flushRaw();
    counter.interrupt(reason);
  }

  function tracking(tMs: number): LiveTracking {
    if (paused) return "paused";
    if (lastValidT === null) return "paused";
    const since = tMs - lastValidT;
    if (since > SQUAT_P0.maxBridgeGapMs) return "lost";
    if (since > SQUAT_P0.bridgeGapMs) return "paused";
    return "tracking";
  }

  function checkLoss(tMs: number) {
    if (!lostHandled && lastValidT !== null && tMs - lastValidT > SQUAT_P0.maxBridgeGapMs) {
      lostHandled = true;
      interrupt("tracking_lost");
    }
  }

  function resume(tMs: number) {
    if (!paused) return;
    paused.endMs = tMs;
    interruptions.push(paused);
    paused = null;
    // Resuming is not evidence of anything: counting restarts from "unknown" and needs a standing frame.
    lastValidT = null;
  }

  function snapshot(tMs: number, confirmedAtMs: number | null): LiveSnapshot {
    const events = counter.getEvents().map((e) => ({ ...e, phases: e.phases.map((p) => ({ ...p })), features: { ...e.features }, reasons: [...e.reasons] }));
    return {
      tMs,
      tracking: tracking(tMs),
      issue: tracking(tMs) === "tracking" ? null : lastIssue,
      phase: counter.getState(),
      counts: summarize(events.map((e) => e.outcome)),
      events,
      confirmedAtMs,
      userPaused: paused !== null,
      viewWarning,
    };
  }

  return {
    side,
    push(o: PoseObservation): LiveSnapshot {
      if (finished || paused) return snapshot(lastT, null);
      const size = `${o.frameWidth}x${o.frameHeight}`;
      if (lastSize !== null && size !== lastSize && o.frameWidth > 0) {
        // Rotation / resolution change: pixel-space geometry is not comparable across it.
        interrupt("session_interrupted");
        interruptions.push({ startMs: lastT, endMs: o.timestampMs, reason: "frame_size" });
      }
      if (o.frameWidth > 0) lastSize = size;

      const before = counter.getEvents().length;
      const f = assess(o);
      observations.push(o);
      frames.push(f);
      if (f.issue !== "invalid_timestamp") lastT = o.timestampMs;

      if (f.valid) {
        lastValidT = f.timestampMs;
        lostHandled = false;
        lastIssue = null;
        valid.push({ t: f.timestampMs, kneeDeg: f.kneeAngleDeg! });
        drain();
        // Same rule End Set applies; a 1 s setup window can pass a borderline view that the whole set fails.
        if (valid.length % 10 === 0) {
          viewWarning = clipQualityChecks(observations, frames, side).checks.find((c) => c.id === "side_view")?.result === "fail";
        }
      } else {
        lastIssue = f.issue;
        checkLoss(o.timestampMs);
      }
      return snapshot(lastT, counter.getEvents().length > before ? o.timestampMs : null);
    },
    /** Timer-driven: a camera that stops delivering frames still pauses counting and closes the open cycle. */
    tick(tMs: number): LiveSnapshot {
      if (!finished && !paused) {
        const before = counter.getEvents().length;
        checkLoss(tMs);
        return snapshot(tMs, counter.getEvents().length > before ? tMs : null);
      }
      return snapshot(tMs, null);
    },
    pause(tMs: number, reason: LiveInterruption["reason"] = "paused") {
      if (finished || paused) return;
      interrupt("session_interrupted");
      paused = { startMs: tMs, endMs: tMs, reason };
    },
    resume,
    snapshot: (tMs: number) => snapshot(tMs, null),
    finish(endMs: number): LiveSetResult {
      resume(endMs);
      finished = true;
      const n = valid.length;
      // Batch edge rule for the last held sample(s): window = the last three.
      while (emitted < n) {
        const i = emitted;
        const lo = Math.max(0, Math.min(i - 1, n - 3));
        const w = valid.slice(lo, lo + 3);
        const ok = w.length === 3 && w[1].t - w[0].t <= SQUAT_P0.maxBridgeGapMs && w[2].t - w[1].t <= SQUAT_P0.maxBridgeGapMs;
        emit(ok ? { t: valid[i].t, kneeDeg: w.map((x) => x.kneeDeg).sort((a, b) => a - b)[1] } : valid[i]);
        emitted += 1;
      }
      const liveEvents = counter.finish();
      const analysis = assembleSquatAnalysis({
        observations,
        frames,
        side,
        smoothed,
        durationMs: Math.max(endMs, lastT),
        countEvents: () => liveEvents,
      });
      return {
        adapterVersion: LIVE_P1A.adapterVersion,
        analysis: { ...analysis, limitations: LIVE_LIMITATIONS },
        liveEvents,
        interruptions,
      };
    },
    observationCount: () => observations.length,
    isPaused: () => paused !== null,
  };
}

export type LiveSquatSession = ReturnType<typeof createLiveSquatSession>;
