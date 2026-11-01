import { describe, expect, it } from "vitest";

import {
  AnalysisCancelledError,
  analyzeSquatObservations,
  applyCorrections,
  sampleObservations,
  validateDecodedMedia,
  validateVideoFile,
  type PoseObservation,
  type RepCorrection,
} from "@/lib/setvision/squat-p0";

/*
 * SYNTHETIC tests only. They prove the engine's logic does what the
 * documented rules say; they say nothing about real-world accuracy.
 */

const STAND = 175;
const BOTTOM = 85;
const STEP = 100;

type Key = [t: number, deg: number];

function angleAtTime(keys: Key[], t: number): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i += 1) {
    const [t1, a1] = keys[i];
    const [t0, a0] = keys[i - 1];
    if (t <= t1) return a0 + ((a1 - a0) * (t - t0)) / (t1 - t0);
  }
  return keys[keys.length - 1][1];
}

/** Side-view pose whose 2D knee angle equals `deg` (square frame, so normalized = pixel angles). */
function poseFor(deg: number, opts: { hipSeparation?: number; visibility?: number; shiftX?: number } = {}) {
  const vis = opts.visibility ?? 0.95;
  const dx = opts.shiftX ?? 0;
  const ankle = { x: 0.5 + dx, y: 0.9 };
  const knee = { x: 0.52 + dx, y: 0.7 };
  const d = { x: ankle.x - knee.x, y: ankle.y - knee.y };
  const len = Math.hypot(d.x, d.y);
  const r = (deg * Math.PI) / 180;
  // Rotate the knee→ankle direction by `deg` (clockwise in image space) for knee→hip.
  const u = { x: (d.x * Math.cos(r) + d.y * Math.sin(r)) / len, y: (-d.x * Math.sin(r) + d.y * Math.cos(r)) / len };
  const hip = { x: knee.x + 0.2 * u.x, y: knee.y + 0.2 * u.y };
  const shoulder = { x: hip.x + 0.03, y: hip.y - 0.25 };
  const near = {
    shoulder: { ...shoulder, visibility: vis },
    hip: { ...hip, visibility: vis },
    knee: { ...knee, visibility: vis },
    ankle: { ...ankle, visibility: vis },
  };
  const sep = opts.hipSeparation ?? 0.01;
  const far = {
    shoulder: { ...shoulder, x: shoulder.x + sep, visibility: 0.3 },
    hip: { ...hip, x: hip.x + sep, visibility: 0.3 },
    knee: { ...knee, visibility: 0.3 },
    ankle: { ...ankle, visibility: 0.3 },
  };
  return { left: near, right: far };
}

function observe(
  keys: Key[],
  durationMs: number,
  edit: (t: number, o: PoseObservation) => PoseObservation | null = (_t, o) => o,
  poseOpts: Parameters<typeof poseFor>[1] = {},
): PoseObservation[] {
  const out: PoseObservation[] = [];
  for (let t = 0; t <= durationMs; t += STEP) {
    const o: PoseObservation = {
      timestampMs: t,
      timestampSource: "seek",
      frameWidth: 1000,
      frameHeight: 1000,
      poseCount: 1,
      landmarks: poseFor(angleAtTime(keys, t), poseOpts),
    };
    const e = edit(t, o);
    if (e) out.push(e);
  }
  return out;
}

/** n reps: stand `lead` ms, then each rep = 1 s down + 1 s up, `rest` ms standing between. */
function repKeys(n: number, { lead = 600, rest = 400, bottom = BOTTOM, down = 1000, up = 1000, hold = 0 } = {}) {
  const keys: Key[] = [[0, STAND]];
  const truth: Array<{ start: number; end: number }> = [];
  let t = lead;
  for (let i = 0; i < n; i += 1) {
    keys.push([t, STAND]);
    const start = t;
    t += down;
    keys.push([t, bottom]);
    if (hold) {
      t += hold;
      keys.push([t, bottom]);
    }
    t += up;
    keys.push([t, STAND]);
    truth.push({ start, end: t });
    t += rest;
  }
  keys.push([t, STAND]);
  return { keys, truth, end: t + 400 };
}

describe("SetVision P0 squat engine — counting", () => {
  it("counts three clean cycles as COMPLETED with boundaries within one sample", () => {
    const { keys, truth, end } = repKeys(3);
    const a = analyzeSquatObservations(observe(keys, end), end);
    expect(a.status).toBe("ANALYZED");
    expect(a.counts).toEqual({ completed: 3, partial: 0, uncertain: 0 });
    a.events.forEach((e, i) => {
      expect(Math.abs(e.startMs - truth[i].start)).toBeLessThanOrEqual(STEP);
      expect(Math.abs(e.endMs - truth[i].end)).toBeLessThanOrEqual(STEP);
      expect(e.bottomMs).not.toBeNull();
      expect(e.phases.map((p) => p.phase)).toEqual(["descent", "ascent"]);
      expect(e.features.minKneeDeg!).toBeLessThan(95);
    });
  });

  it("anchors the start at the real onset when the knees drift a few degrees while standing", () => {
    // Stands at 177°, sags to 171° over 2 s (postural drift), then squats at 2600 ms.
    const keys: Key[] = [[0, 177], [400, 177], [2400, 171], [2600, 170], [3600, BOTTOM], [4600, STAND], [5200, STAND]];
    const a = analyzeSquatObservations(observe(keys, 5200), 5200);
    expect(a.counts).toEqual({ completed: 1, partial: 0, uncertain: 0 });
    expect(Math.abs(a.events[0].startMs - 2600)).toBeLessThanOrEqual(2 * STEP);
    expect(Math.abs(a.events[0].endMs - 4600)).toBeLessThanOrEqual(STEP);
  });

  it("is deterministic", () => {
    const { keys, end } = repKeys(2);
    const obs = observe(keys, end);
    expect(analyzeSquatObservations(obs, end)).toEqual(analyzeSquatObservations(obs, end));
  });

  it("rejects single-frame jitter spikes (no phantom reps)", () => {
    const { keys, end } = repKeys(2);
    const obs = observe(keys, end, (t, o) => {
      // Every 7th frame the knee "snaps" to 100° while standing.
      if (t % 700 === 0 && angleAtTime(keys, t) > 170) return { ...o, landmarks: poseFor(100) };
      return o;
    });
    const a = analyzeSquatObservations(obs, end);
    expect(a.counts).toEqual({ completed: 2, partial: 0, uncertain: 0 });
  });

  it("does not double-count a pause at the bottom or a bounce mid-cycle", () => {
    const paused = repKeys(2, { hold: 1500 });
    const pa = analyzeSquatObservations(observe(paused.keys, paused.end), paused.end);
    expect(pa.counts).toEqual({ completed: 2, partial: 0, uncertain: 0 });

    const bounce: Key[] = [[0, STAND], [600, STAND], [1600, 90], [1900, 120], [2200, 90], [3200, STAND], [3800, STAND]];
    const ba = analyzeSquatObservations(observe(bounce, 3800), 3800);
    expect(ba.counts).toEqual({ completed: 1, partial: 0, uncertain: 0 });
    expect(ba.events[0].features.reversals).toBe(1);
  });

  it("classifies a shallow cycle as PARTIAL, not COMPLETED", () => {
    const { keys, end } = repKeys(1, { bottom: 135 });
    const a = analyzeSquatObservations(observe(keys, end), end);
    expect(a.counts).toEqual({ completed: 0, partial: 1, uncertain: 0 });
    expect(a.events[0].reasons).toContain("below_cycle_flexion");
  });

  it("ignores sway that never leaves the standing band", () => {
    const sway: Key[] = [[0, STAND], [500, 156], [1000, STAND], [1500, 152], [2000, STAND]];
    const a = analyzeSquatObservations(observe(sway, 2000), 2000);
    expect(a.status).toBe("ANALYZED");
    expect(a.events).toHaveLength(0);
  });
});

describe("SetVision P0 squat engine — incomplete observation", () => {
  it("marks a video that starts mid-rep as UNCERTAIN (onset not observed)", () => {
    const keys: Key[] = [[0, 100], [700, STAND], [1300, STAND], [2300, BOTTOM], [3300, STAND], [3800, STAND]];
    const a = analyzeSquatObservations(observe(keys, 3800), 3800);
    expect(a.counts).toEqual({ completed: 1, partial: 0, uncertain: 1 });
    expect(a.events[0].reasons).toContain("onset_not_observed");
    expect(a.events[0].startMs).toBe(0);
  });

  it("marks a video that ends mid-rep as UNCERTAIN", () => {
    const keys: Key[] = [[0, STAND], [600, STAND], [1600, BOTTOM], [2600, STAND], [3000, STAND], [4000, 95]];
    const a = analyzeSquatObservations(observe(keys, 4000), 4000);
    expect(a.counts).toEqual({ completed: 1, partial: 0, uncertain: 1 });
    expect(a.events[1].reasons).toContain("video_ended_mid_cycle");
    expect(a.events[1].endMs).toBe(4000);
  });

  it("bridges one dropped frame but marks a rep with a longer gap UNCERTAIN", () => {
    const { keys, end } = repKeys(2);
    const oneDrop = observe(keys, end, (t, o) => (t === 1500 ? null : o));
    expect(analyzeSquatObservations(oneDrop, end).counts).toEqual({ completed: 2, partial: 0, uncertain: 0 });

    // 600 ms of no pose in the middle of rep 1's descent.
    const gap = observe(keys, end, (t, o) => (t > 900 && t < 1500 ? { ...o, poseCount: 0, landmarks: null } : o));
    const a = analyzeSquatObservations(gap, end);
    expect(a.counts).toEqual({ completed: 1, partial: 0, uncertain: 1 });
    expect(a.events[0].reasons).toContain("tracking_gap");
    expect(a.trackingLoss.some((l) => l.severity === "gap" && l.issue === "no_pose")).toBe(true);
  });

  it("closes the open rep UNCERTAIN and resets when tracking is lost, never reusing stale landmarks", () => {
    const { keys, end } = repKeys(3);
    // Person leaves the frame for 1.5 s across the end of rep 1 and the start of rep 2.
    const obs = observe(keys, end, (t, o) =>
      t >= 2000 && t <= 3500 ? { ...o, landmarks: poseFor(angleAtTime(keys, t), { shiftX: 0.6 }) } : o,
    );
    const a = analyzeSquatObservations(obs, end);
    const lost = a.trackingLoss.find((l) => l.severity === "lost");
    expect(lost?.issue).toBe("out_of_frame");
    expect(a.events[0].outcome).toBe("UNCERTAIN");
    expect(a.events[0].reasons).toContain("tracking_lost");
    expect(a.events[0].endMs).toBeLessThan(2000);
    // Rep 3 is fully observed after re-acquisition.
    expect(a.events[a.events.length - 1].outcome).toBe("COMPLETED");
    for (const e of a.events) expect(e.endMs <= 2000 || e.startMs >= 3500).toBe(true);
  });

  it("discards frames with low joint visibility", () => {
    const { keys, end } = repKeys(1);
    const obs = observe(keys, end, (t, o) => (t >= 1200 && t <= 1700 ? { ...o, landmarks: poseFor(angleAtTime(keys, t), { visibility: 0.2 }) } : o));
    const a = analyzeSquatObservations(obs, end);
    expect(a.events[0].outcome).toBe("UNCERTAIN");
    expect(a.trackingLoss[0].issue).toBe("low_visibility");
  });
});

describe("SetVision P0 squat engine — abstention", () => {
  it("abstains when several people are in frame most of the time", () => {
    const { keys, end } = repKeys(2);
    const obs = observe(keys, end, (t, o) => (t % 300 === 0 ? o : { ...o, poseCount: 2, landmarks: null }));
    const a = analyzeSquatObservations(obs, end);
    expect(a.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(a.counts).toBeNull();
    expect(a.events).toHaveLength(0);
    expect(a.insufficientReasons.join(" ")).toMatch(/more than one person/i);
  });

  it("abstains on a frontal camera view", () => {
    const { keys, end } = repKeys(2);
    const a = analyzeSquatObservations(observe(keys, end, undefined, { hipSeparation: 0.15 }), end);
    expect(a.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(a.quality.checks.find((c) => c.id === "side_view")?.result).toBe("fail");
  });

  it("abstains when no person is ever detected", () => {
    const obs = observe([[0, STAND]], 3000, (_t, o) => ({ ...o, poseCount: 0, landmarks: null }));
    const a = analyzeSquatObservations(obs, 3000);
    expect(a.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(a.counts).toBeNull();
  });

  it("abstains when the person is never seen standing", () => {
    const keys: Key[] = [[0, 100], [1500, 140], [3000, 100]];
    const a = analyzeSquatObservations(observe(keys, 3000), 3000);
    expect(a.status).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("rejects non-increasing timestamps and abstains when there are many", () => {
    const { keys, end } = repKeys(2);
    const obs = observe(keys, end);
    const shuffled = obs.map((o, i) => (i % 5 === 4 ? { ...o, timestampMs: obs[i - 2].timestampMs } : o));
    const a = analyzeSquatObservations(shuffled, end);
    expect(a.quality.checks.find((c) => c.id === "timestamps")?.result).toBe("fail");
    expect(a.status).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("labels every quality check with an implementation status", () => {
    const { keys, end } = repKeys(1);
    const a = analyzeSquatObservations(observe(keys, end), end);
    const ids = a.quality.checks.map((c) => `${c.id}:${c.status}`);
    expect(ids).toContain("camera_stability:NOT_IMPLEMENTED");
    expect(ids).toContain("lighting:NOT_IMPLEMENTED");
    expect(ids).toContain("timestamps:IMPLEMENTED_AND_MEASURED");
    expect(a.quality.checks.every((c) => ["IMPLEMENTED_AND_MEASURED", "HEURISTIC_ONLY", "NOT_IMPLEMENTED"].includes(c.status))).toBe(true);
  });
});

describe("SetVision P0 — user corrections", () => {
  it("applies relabels and additions on top of detected events, attributed to the user", () => {
    const { keys, end } = repKeys(2, { bottom: 135 });
    const a = analyzeSquatObservations(observe(keys, end), end);
    expect(a.counts).toEqual({ completed: 0, partial: 2, uncertain: 0 });
    const corrections: RepCorrection[] = [
      { kind: "relabel", eventId: a.events[0].id, outcome: "COMPLETED", by: "user", atIso: "2026-11-01T00:00:00Z" },
      { kind: "relabel", eventId: a.events[1].id, outcome: "NOT_A_REP", by: "user", atIso: "2026-11-01T00:00:00Z" },
      { kind: "added", id: "u1", atMs: 100, outcome: "COMPLETED", by: "user", atIso: "2026-11-01T00:00:00Z" },
    ];
    const c = applyCorrections(a.events, corrections);
    expect(c.counts).toEqual({ completed: 2, partial: 0, uncertain: 0 });
    expect(c.items[0]).toMatchObject({ id: "u1", detected: null, correctedByUser: true });
    expect(a.events[0].outcome).toBe("PARTIAL"); // detected result untouched
  });
});

describe("SetVision P0 — media validation and bounded sampling", () => {
  it("validates file type and size before decoding", () => {
    expect(validateVideoFile({ name: "a.mp4", type: "video/mp4", size: 1e6 })).toBeNull();
    expect(validateVideoFile({ name: "clip.MOV", type: "", size: 1e6 })).toBeNull();
    expect(validateVideoFile({ name: "notes.txt", type: "text/plain", size: 10 })?.code).toBe("not_video");
    expect(validateVideoFile({ name: "a.mp4", type: "video/mp4", size: 400 * 1048576 })?.code).toBe("too_large");
  });

  it("validates decoded duration and dimensions", () => {
    expect(validateDecodedMedia({ durationSec: 30.05, width: 640, height: 480 })).toBeNull();
    expect(validateDecodedMedia({ durationSec: 30.5, width: 640, height: 480 })?.code).toBe("too_long");
    expect(validateDecodedMedia({ durationSec: Infinity, width: 640, height: 480 })?.code).toBe("unknown_duration");
    expect(validateDecodedMedia({ durationSec: 10, width: 0, height: 0 })?.code).toBe("undecodable");
  });

  const detect = () => ({ frameWidth: 100, frameHeight: 100, poseCount: 0, landmarks: null });

  it("samples on the media timeline with strictly increasing timestamps", async () => {
    const seen: number[] = [];
    const { observations, stats } = await sampleObservations({
      durationMs: 1000,
      seek: async (ms) => ({ mediaTimeMs: ms, fresh: true }),
      detect: (ts) => {
        seen.push(ts);
        return detect();
      },
    });
    expect(seen).toEqual([0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]);
    expect(observations.every((o) => o.timestampSource === "seek")).toBe(true);
    expect(stats.frames).toBe(11);
  });

  it("skips a frame when the decoder does not advance (no duplicate timestamps)", async () => {
    const { observations } = await sampleObservations({
      durationMs: 400,
      seek: async (ms) => ({ mediaTimeMs: Math.min(ms, 250), fresh: true }), // decoder stuck at 250 ms
      detect,
    });
    expect(observations.map((o) => o.timestampMs)).toEqual([0, 100, 200, 250]);
  });

  it("never runs pose detection on a stale (undecoded) frame and abstains on a truncated video", async () => {
    let detections = 0;
    const { observations } = await sampleObservations({
      durationMs: 3000,
      seek: async (ms) => ({ mediaTimeMs: ms, fresh: ms < 1200 }), // decoding stops after 1.1 s
      detect: () => {
        detections += 1;
        return detect();
      },
    });
    expect(detections).toBe(12);
    expect(observations.filter((o) => o.frameStatus === "stale")).toHaveLength(19);

    const { keys, end } = repKeys(1);
    const obs = observe(keys, end, (t, o) => (t >= 1200 ? { ...o, frameStatus: "stale", poseCount: 0, landmarks: null } : o));
    const a = analyzeSquatObservations(obs, end);
    expect(a.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(a.insufficientReasons.join(" ")).toMatch(/stopped producing new frames from 1\.2 s/);
    expect(a.trackingLoss.at(-1)?.issue).toBe("stale_frame");
  });

  it("stops promptly on cancellation without further detections", async () => {
    const controller = new AbortController();
    let detections = 0;
    const run = sampleObservations({
      durationMs: 30_000,
      seek: async (ms) => {
        if (ms === 500) controller.abort();
        return { mediaTimeMs: ms, fresh: true };
      },
      detect: () => {
        detections += 1;
        return detect();
      },
      signal: controller.signal,
    });
    await expect(run).rejects.toBeInstanceOf(AnalysisCancelledError);
    expect(detections).toBe(5);
  });
});
