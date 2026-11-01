import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  CAMERA_FAILURE_TEXT,
  cameraConstraints,
  checkCameraSupport,
  classifyCameraError,
  stopStream,
} from "@/lib/form-coach/live-camera";
import {
  LIVE_P1A,
  analyzeSquatObservations,
  applyCorrections,
  assessReadiness,
  createFrameScheduler,
  createLiveSquatSession,
  type LiveSnapshot,
  type PoseObservation,
} from "@/lib/setvision/squat-p0";
import { STAND, angleAtTime, observe, poseFor, repKeys } from "@/lib/setvision/__tests__/squat-p0-fixtures";

/*
 * Form Coach P1A live adapter — SYNTHETIC observation streams. They prove the
 * adapter's logic (scheduling, interruption, equivalence with the clip path);
 * they say nothing about camera compatibility or real-world counting accuracy.
 */

const live = (obs: PoseObservation[]) => obs.map((o) => ({ ...o, timestampSource: "clock" as const }));

function runLive(obs: PoseObservation[], end: number, side: "left" | "right" = "left") {
  const s = createLiveSquatSession(side);
  const snaps: LiveSnapshot[] = obs.map((o) => s.push(o));
  return { result: s.finish(end), snaps, session: s };
}

describe("Form Coach P1A — frame scheduler", () => {
  it("analyses ~10 of 30 camera frames per second and never queues", () => {
    const sch = createFrameScheduler();
    let analysed = 0;
    for (let i = 0; i < 30; i += 1) {
      if (sch.tryBegin(i * (1000 / 30))) {
        analysed += 1;
        sch.done();
      }
    }
    expect(analysed).toBe(10);
    expect(sch.stats().skippedInterval).toBe(20);
  });

  it("drops frames while an inference is still running and rejects non-increasing timestamps", () => {
    const sch = createFrameScheduler(100);
    expect(sch.tryBegin(0)).toBe(true);
    expect(sch.tryBegin(150)).toBe(false); // busy: dropped, not queued
    sch.done();
    expect(sch.tryBegin(150)).toBe(true);
    sch.done();
    expect(sch.tryBegin(150)).toBe(false);
    expect(sch.tryBegin(Number.NaN)).toBe(false);
    expect(sch.stats()).toMatchObject({ analysed: 2, skippedBusy: 1, skippedNonMonotonic: 2 });
  });
});

describe("Form Coach P1A — live session uses the clip engine", () => {
  it("produces exactly the clip path's events on an uninterrupted stream", () => {
    const { keys, end } = repKeys(3);
    const obs = live(observe(keys, end));
    const batch = analyzeSquatObservations(obs, end);
    const { result } = runLive(obs, end, batch.quality.lockedSide!);
    expect(result.analysis.status).toBe("ANALYZED");
    expect(result.liveEvents).toEqual(batch.events);
    expect(result.analysis.counts).toEqual({ completed: 3, partial: 0, uncertain: 0 });
    expect(result.analysis.series).toEqual(batch.series);
  });

  it("matches the clip path across a short gap and a tracking loss that recovers", () => {
    const { keys, end } = repKeys(4);
    const obs = live(
      observe(keys, end, (t, o) => {
        if (t > 900 && t < 1500) return { ...o, poseCount: 0, landmarks: null };
        if (t >= 4400 && t <= 6000) return { ...o, landmarks: poseFor(angleAtTime(keys, t), { shiftX: 0.6 }) };
        return o;
      }),
    );
    const batch = analyzeSquatObservations(obs, end);
    const { result } = runLive(obs, end);
    expect(result.liveEvents).toEqual(batch.events);
    expect(result.analysis.trackingLoss).toEqual(batch.trackingLoss);
  });

  it("emits each event once: ids are unique and confirmedAtMs fires once per new event", () => {
    const { keys, end } = repKeys(3);
    const { snaps, result } = runLive(live(observe(keys, end)), end);
    const ids = result.liveEvents.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(snaps.filter((s) => s.confirmedAtMs !== null)).toHaveLength(3);
    // Counts never go down while the set runs.
    for (let i = 1; i < snaps.length; i += 1) expect(snaps[i].events.length).toBeGreaterThanOrEqual(snaps[i - 1].events.length);
  });

  it("reports the phase while moving", () => {
    const { keys, end } = repKeys(1);
    const { snaps } = runLive(live(observe(keys, end)), end);
    const phases = new Set(snaps.map((s) => s.phase));
    expect(phases).toEqual(new Set(["unknown", "standing", "descending", "ascending"]));
  });
});

describe("Form Coach P1A — interruptions and uncertainty", () => {
  it("pauses counting on missing evidence and closes the open cycle UNCERTAIN as soon as tracking is lost", () => {
    const { keys, end } = repKeys(2);
    // Person leaves the frame mid-descent of rep 1 (t 1100) for 1.5 s.
    const obs = live(observe(keys, end, (t, o) => (t >= 1100 && t <= 2600 ? { ...o, poseCount: 0, landmarks: null } : o)));
    const s = createLiveSquatSession("left");
    const at = (t: number) => obs.findIndex((o) => o.timestampMs === t);
    let snap: LiveSnapshot | null = null;
    for (let i = 0; i <= at(1200); i += 1) snap = s.push(obs[i]);
    expect(snap!.tracking).toBe("tracking"); // ≤ 250 ms since the last valid frame (1000): bridged
    for (let i = at(1300); i <= at(1500); i += 1) snap = s.push(obs[i]);
    expect(snap!.tracking).toBe("paused");
    expect(snap!.issue).toBe("no_pose");
    expect(snap!.events).toHaveLength(0);
    for (let i = at(1600); i <= at(2200); i += 1) snap = s.push(obs[i]);
    expect(snap!.tracking).toBe("lost");
    // Closed during the loss, not carried until tracking returns.
    expect(snap!.events).toHaveLength(1);
    expect(snap!.events[0]).toMatchObject({ outcome: "UNCERTAIN" });
    expect(snap!.events[0].reasons).toContain("tracking_lost");
    for (let i = at(2300); i < obs.length; i += 1) snap = s.push(obs[i]);
    const r = s.finish(end);
    // Rep 2 is fully observed after recovery; nothing straddles the loss.
    expect(r.liveEvents.map((e) => e.outcome)).toEqual(["UNCERTAIN", "COMPLETED"]);
    for (const e of r.liveEvents) expect(e.endMs <= 1100 || e.startMs >= 2600).toBe(true);
  });

  it("closes the open cycle when the camera stops delivering frames (timer tick, no frames)", () => {
    const { keys, end } = repKeys(1);
    const obs = live(observe(keys, end)).filter((o) => o.timestampMs <= 1200); // mid-descent, then nothing
    const s = createLiveSquatSession("left");
    obs.forEach((o) => s.push(o));
    expect(s.tick(1400).tracking).toBe("tracking");
    expect(s.tick(1500).tracking).toBe("paused");
    expect(s.tick(1500).events).toHaveLength(0);
    const lost = s.tick(2300);
    expect(lost.tracking).toBe("lost");
    expect(lost.events).toHaveLength(1);
    expect(lost.events[0].reasons).toContain("tracking_lost");
  });

  it("marks a set that starts mid-repetition UNCERTAIN (onset not observed)", () => {
    const { keys, end } = repKeys(2);
    const obs = live(observe(keys, end)).filter((o) => o.timestampMs >= 1300);
    const { result } = runLive(obs, end);
    expect(result.liveEvents[0].outcome).toBe("UNCERTAIN");
    expect(result.liveEvents[0].reasons).toContain("onset_not_observed");
    expect(result.liveEvents[1].outcome).toBe("COMPLETED");
  });

  it("never joins phases across a user pause", () => {
    const { keys, end } = repKeys(3);
    const obs = live(observe(keys, end));
    const s = createLiveSquatSession("left");
    // Pause mid-descent of rep 2 (3000–5000 ms), resume 600 ms later during its ascent — the same physical rep.
    for (const o of obs) {
      if (o.timestampMs === 3600) s.pause(3600);
      if (o.timestampMs === 4200) s.resume(4200);
      s.push(o);
    }
    const r = s.finish(end);
    expect(r.interruptions).toEqual([{ startMs: 3600, endMs: 4200, reason: "paused" }]);
    const rep2 = r.liveEvents[1];
    expect(rep2.outcome).toBe("UNCERTAIN");
    expect(rep2.reasons).toContain("session_interrupted");
    expect(rep2.endMs).toBeLessThanOrEqual(3600);
    // The ascent seen after resuming is its own UNCERTAIN fragment, never joined to the descent before the pause.
    const fragment = r.liveEvents[2];
    expect(fragment.startMs).toBeGreaterThanOrEqual(4200);
    expect(fragment.reasons).toContain("onset_not_observed");
    expect(r.liveEvents.map((e) => e.outcome)).toEqual(["COMPLETED", "UNCERTAIN", "UNCERTAIN", "COMPLETED"]);
  });

  it("discards frames with two people (no identity guessed) and resumes on one person", () => {
    const { keys, end } = repKeys(3);
    const obs = live(observe(keys, end, (t, o) => (t >= 2900 && t <= 4300 ? { ...o, poseCount: 2, landmarks: null } : o)));
    const s = createLiveSquatSession("left");
    let worst: LiveSnapshot | null = null;
    for (const o of obs) {
      const snap = s.push(o);
      if (o.timestampMs === 4300) worst = snap;
    }
    expect(worst!.tracking).toBe("lost");
    expect(worst!.issue).toBe("multiple_people");
    const r = s.finish(end);
    expect(r.liveEvents.map((e) => e.outcome)).toEqual(["COMPLETED", "UNCERTAIN", "COMPLETED"]);
  });

  it("interrupts when the frame size changes (rotation / resolution)", () => {
    const { keys, end } = repKeys(1);
    const obs = live(observe(keys, end)).map((o) => (o.timestampMs >= 1200 ? { ...o, frameWidth: 720, frameHeight: 1280 } : o));
    const { result } = runLive(obs, end);
    expect(result.interruptions[0].reason).toBe("frame_size");
    expect(result.liveEvents[0].reasons).toContain("session_interrupted");
  });

  it("abstains at End Set like the clip path, but keeps the live events for review", () => {
    const { keys, end } = repKeys(3);
    const obs = live(observe(keys, end, (t, o) => (t >= 1000 && t < 3000 ? { ...o, poseCount: 2, landmarks: null } : o)));
    const { result } = runLive(obs, end);
    expect(result.analysis.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.analysis.counts).toBeNull();
    expect(result.analysis.events).toEqual([]);
    expect(result.liveEvents.length).toBeGreaterThan(0);
  });

  it("keeps detected events and user corrections apart", () => {
    const { keys, end } = repKeys(2);
    const { result } = runLive(live(observe(keys, end)), end);
    const ev = result.liveEvents;
    const c = applyCorrections(ev, [
      { kind: "relabel", eventId: ev[0].id, outcome: "NOT_A_REP", by: "user", atIso: "2026-11-02T00:00:00Z" },
      { kind: "added", id: "user-1", atMs: end, outcome: "COMPLETED", by: "user", atIso: "2026-11-02T00:00:01Z" },
    ]);
    expect(c.items.find((i) => i.id === ev[0].id)).toMatchObject({ detected: "COMPLETED", outcome: "NOT_A_REP", correctedByUser: true });
    expect(c.items.find((i) => i.id === "user-1")).toMatchObject({ detected: null, correctedByUser: true });
    expect(result.liveEvents[0].outcome).toBe("COMPLETED"); // detected result never mutated
  });

  it("ignores frames after finish", () => {
    const { keys, end } = repKeys(1);
    const obs = live(observe(keys, end));
    const s = createLiveSquatSession("left");
    obs.forEach((o) => s.push(o));
    s.finish(end);
    const after = s.push({ ...obs[0], timestampMs: end + 100 });
    expect(after.events).toHaveLength(1);
    expect(s.observationCount()).toBe(obs.length);
  });
});

describe("Form Coach P1A — setup readiness", () => {
  const still = (deg: number, opts: Parameters<typeof poseFor>[1] = {}, edit?: (o: PoseObservation) => PoseObservation) =>
    live(observe([[0, deg]], 1000, (_t, o) => (edit ? edit(o) : o), opts));

  it("is Ready for one person standing side-on and fully visible", () => {
    expect(assessReadiness(still(STAND), 1000)).toMatchObject({ state: "ready", side: "left" });
  });

  it("asks to adjust with a specific reason", () => {
    expect(assessReadiness(still(STAND, { hipSeparation: 0.2 }), 1000)).toMatchObject({ state: "adjust", issue: "not_side_on" });
    expect(assessReadiness(still(120), 1000)).toMatchObject({ state: "adjust", issue: "not_standing" });
    expect(assessReadiness(still(STAND, { shiftX: 0.6 }), 1000)).toMatchObject({ state: "adjust", issue: "out_of_frame" });
    expect(assessReadiness(still(STAND, { visibility: 0.3 }), 1000)).toMatchObject({ state: "adjust" });
    expect(assessReadiness(still(STAND, {}, (o) => ({ ...o, poseCount: 2, landmarks: null })), 1000)).toMatchObject({
      state: "adjust",
      issue: "multiple_people",
    });
    const walking = live(observe([[0, 175], [500, 140], [1000, 175]], 1000));
    expect(assessReadiness(walking, 1000).state).toBe("adjust");
  });

  it("cannot verify without enough recent frames or without a person", () => {
    expect(assessReadiness(still(STAND).slice(0, 3), 1000)).toMatchObject({ state: "cannot_verify", issue: "waiting_for_frames" });
    expect(assessReadiness(still(STAND), 5000)).toMatchObject({ state: "cannot_verify", issue: "waiting_for_frames" });
    expect(assessReadiness(still(STAND, {}, (o) => ({ ...o, poseCount: 0, landmarks: null })), 1000)).toMatchObject({
      state: "cannot_verify",
      issue: "no_person",
    });
  });
});

describe("Form Coach P1A — camera helpers", () => {
  it("refuses before prompting on an insecure page or without getUserMedia", () => {
    expect(checkCameraSupport({ isSecureContext: false, mediaDevices: { getUserMedia: () => null } })).toBe("insecure_context");
    expect(checkCameraSupport({ isSecureContext: true, mediaDevices: undefined })).toBe("unsupported");
    expect(checkCameraSupport({ isSecureContext: true, mediaDevices: { getUserMedia: () => null } })).toBeNull();
  });

  it("maps getUserMedia errors to user-facing categories", () => {
    const err = (name: string) => Object.assign(new Error(name), { name });
    expect(classifyCameraError(err("NotAllowedError"))).toBe("denied");
    expect(classifyCameraError(err("SecurityError"))).toBe("denied");
    expect(classifyCameraError(err("NotFoundError"))).toBe("not_found");
    expect(classifyCameraError(err("NotReadableError"))).toBe("in_use");
    expect(classifyCameraError(err("OverconstrainedError"))).toBe("overconstrained");
    expect(classifyCameraError(new TypeError("x"))).toBe("unsupported");
    expect(classifyCameraError("weird")).toBe("unknown");
    for (const k of Object.keys(CAMERA_FAILURE_TEXT)) expect(CAMERA_FAILURE_TEXT[k as keyof typeof CAMERA_FAILURE_TEXT].detail).toBeTruthy();
  });

  it("never requests audio and stops every owned track", () => {
    expect(cameraConstraints({ facingMode: "environment" })).toMatchObject({ audio: false, video: { facingMode: { ideal: "environment" } } });
    expect(cameraConstraints({ deviceId: "abc" })).toMatchObject({ audio: false, video: { deviceId: { exact: "abc" } } });
    const stopped: string[] = [];
    stopStream({ getTracks: () => [{ stop: () => stopped.push("v1") }, { stop: () => stopped.push("v2") }] });
    expect(stopped).toEqual(["v1", "v2"]);
    expect(() => stopStream(null)).not.toThrow();
  });
});

describe("Form Coach P1A — no data leaves the page", () => {
  it("the live engine and UI make no network or database calls (no automatic workout mutation)", () => {
    const files = [
      "lib/setvision/squat-p0/live.ts",
      "lib/form-coach/live-camera.ts",
      "components/form-coach/live/live-squat-coach.tsx",
    ];
    for (const f of files) {
      const src = readFileSync(path.resolve(__dirname, "../../..", f), "utf8");
      expect(src, f).not.toMatch(/supabase|fetch\(|\/api\/|server action|"use server"|sessionStorage|localStorage/);
    }
  });

  it("bounds a set's length", () => {
    expect(LIVE_P1A.maxSetMs).toBeLessThanOrEqual(300_000);
    expect(LIVE_P1A.analysisIntervalMs).toBe(100);
  });
});
