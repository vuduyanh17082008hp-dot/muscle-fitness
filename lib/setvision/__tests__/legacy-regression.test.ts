import { describe, expect, it } from "vitest";

import { analyzeFrameSequence, MANUAL_SELECTION_SIGNAL } from "@/lib/setvision/analyze";
import { classifyExercise, estimateCameraView } from "@/lib/setvision/exercise-classifier";
import { getExerciseConfig } from "@/lib/setvision/exercise-config";
import { estimateTorsoLength } from "@/lib/setvision/normalization";
import { computeRepRom } from "@/lib/setvision/rom";
import { validateDecodedMedia } from "@/lib/setvision/squat-p0/extract";
import type { CompletedRep, Landmark, PoseFrame, TimedPoseFrame } from "@/lib/setvision/types";

/**
 * Regression suite for the legacy (MoveNet) SetVision misclassification
 * of 2026-11-01: a front-view bodyweight squat with a ~8 s bottom hold was
 * reported as "deadlift — 1 rep" with 6–7 s eccentric/concentric phases.
 *
 * All poses here are synthetic. The real-clip checks live outside the
 * repo (the clip is third-party media); see docs/setvision.md.
 */

const STEP_MS = 100; // matches collect-pose-frames.ts's 10 Hz sampling

const p = (x: number, y: number, score = 0.9): Landmark => ({ x, y, score });

/**
 * Side-view stick figure with EXACT 2D knee (hip-knee-ankle) and hip
 * (shoulder-hip-knee) angles. Directions are measured from straight up,
 * positive = toward the lifter's front. Both sides coincide (profile).
 */
function sideFrame(kneeDeg: number, hipDeg: number, score = 0.9): PoseFrame {
  const dir = (deg: number, len: number) => ({
    dx: Math.sin((deg * Math.PI) / 180) * len,
    dy: -Math.cos((deg * Math.PI) / 180) * len,
  });
  const ankle = p(0.5, 1.0, score);
  const knee = p(0.5, 0.65, score);
  const thighDeg = -(180 - kneeDeg); // hips travel backwards
  const thigh = dir(thighDeg, 0.35);
  const hip = p(knee.x + thigh.dx, knee.y + thigh.dy, score);
  const torso = dir(thighDeg + 180 - hipDeg, 0.4); // torso leans forward
  const shoulder = p(hip.x + torso.dx, hip.y + torso.dy, score);
  const wrist = p(shoulder.x, shoulder.y + 0.3, score);
  const frame: PoseFrame = {};
  for (const side of ["left", "right"]) {
    Object.assign(frame, {
      [`${side}_ankle`]: ankle,
      [`${side}_knee`]: knee,
      [`${side}_hip`]: hip,
      [`${side}_shoulder`]: shoulder,
      [`${side}_wrist`]: wrist,
    });
  }
  return frame;
}

/**
 * Front-view squat: two mirrored legs a hip-width apart, knees tracking
 * outward with depth. Keypoint scores are deliberately split so the
 * per-joint "best side" alternates (hip: left, knee: right, ankle: left)
 * — the exact pattern that used to mix joints from both legs.
 */
function frontFrame(depth: number): PoseFrame {
  const frame: PoseFrame = {};
  for (const [side, s] of [["left", -1], ["right", 1]] as const) {
    const hi = side === "left" ? 0.9 : 0.6;
    const lo = side === "left" ? 0.6 : 0.9;
    frame[`${side}_hip`] = p(0.5 + s * 0.1, 0.3 + depth * 0.2, hi);
    frame[`${side}_knee`] = p(0.5 + s * (0.1 + depth * 0.25), 0.65, lo);
    frame[`${side}_ankle`] = p(0.5 + s * 0.1, 1.0, hi);
    frame[`${side}_shoulder`] = p(0.5 + s * 0.12, 0.0 + depth * 0.2, hi);
    frame[`${side}_wrist`] = p(0.5 + s * 0.05, 0.15 + depth * 0.2, hi);
  }
  return frame;
}

type Segment = { from: number; to: number; ms: number };

/** Samples a 0..1 "depth" trajectory through `frameAt` at 10 Hz. */
function track(frameAt: (depth: number) => PoseFrame, segments: Segment[], startMs = 0): TimedPoseFrame[] {
  const frames: TimedPoseFrame[] = [];
  let t = startMs;
  for (const { from, to, ms } of segments) {
    const n = Math.max(1, Math.round(ms / STEP_MS));
    for (let i = 0; i < n; i += 1) {
      frames.push({ timestampMs: t, frame: frameAt(from + ((to - from) * i) / n) });
      t += STEP_MS;
    }
  }
  return frames;
}

const squatDepth = (d: number) => sideFrame(178 - d * 100, 175 - d * 100); // knee 178→78, hip 175→75
const deadliftDepth = (d: number) => sideFrame(175 - d * 45, 175 - d * 95); // knee-light, hip-dominant
const ambiguousDepth = (d: number) => sideFrame(175 - d * 60, 175 - d * 90); // knee/hip ratio ≈ 0.67
const pickupDepth = (d: number) => sideFrame(178 - d * 30, 175 - d * 100); // hinge to the floor, knees soft

const stand = (ms: number): Segment => ({ from: 0, to: 0, ms });
const down = (ms: number): Segment => ({ from: 0, to: 1, ms });
const hold = (ms: number, at = 1): Segment => ({ from: at, to: at, ms });
const up = (ms: number): Segment => ({ from: 1, to: 0, ms });

describe("legacy SetVision feature extraction", () => {
  it("takes every joint of an angle from one body side (no left/right mixing in a front view)", () => {
    const knee = getExerciseConfig("squat").primaryAngleDeg(frontFrame(0));
    // Mixed sides (left hip/ankle + right knee) read ~126° here; one side reads straight.
    expect(knee).toBeGreaterThan(170);
  });

  it("returns no angle when neither side's joints are clearly tracked", () => {
    expect(getExerciseConfig("squat").primaryAngleDeg(sideFrame(170, 170, 0.2))).toBeNull();
  });
});

describe("legacy SetVision classification", () => {
  const longHoldFront = track(frontFrame, [stand(2000), down(1000), hold(8500), up(800), stand(2000)]);

  it("does not label a front-view squat with a long bottom hold as deadlift — it abstains", () => {
    const result = classifyExercise(longHoldFront.map((f) => f.frame));
    expect(estimateCameraView(longHoldFront.map((f) => f.frame)).view).toBe("frontal");
    expect(result.exercise).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.signals[0]).toMatch(/face the lifter/);
  });

  it("recognises a side-view squat", () => {
    const frames = track(squatDepth, [stand(1000), down(1000), hold(300), up(1000), stand(1000)]);
    expect(classifyExercise(frames.map((f) => f.frame)).exercise).toBe("squat");
  });

  it("recognises a genuine side-view deadlift, from the floor or from the top", () => {
    const fromFloor = track(deadliftDepth, [hold(800), up(1000), stand(500), down(1000), hold(300), up(1000)]);
    const fromTop = track(deadliftDepth, [stand(800), down(1000), hold(300), up(1000), stand(500)]);
    expect(classifyExercise(fromFloor.map((f) => f.frame)).exercise).toBe("deadlift");
    expect(classifyExercise(fromTop.map((f) => f.frame)).exercise).toBe("deadlift");
  });

  it("abstains on a movement between a squat and a hinge", () => {
    const frames = track(ambiguousDepth, [stand(800), down(1000), up(1000), stand(800)]);
    const result = classifyExercise(frames.map((f) => f.frame));
    expect(result.exercise).toBeNull();
    expect(result.signals[0]).toMatch(/uncertain/);
  });

  it("is not flipped to deadlift by a hip-flexed first frame or low-confidence keypoints", () => {
    const frames = track(squatDepth, [stand(1000), down(1000), up(1000), stand(1000)]);
    frames[0] = { timestampMs: 0, frame: sideFrame(60, 40, 0.05) }; // undecoded first frame
    frames[1] = { timestampMs: 100, frame: sideFrame(80, 60, 0.9) }; // starts hip-flexed
    expect(classifyExercise(frames.map((f) => f.frame)).exercise).toBe("squat");
  });

  it("abstains, never guesses, when the body is not clearly tracked or barely moves", () => {
    expect(classifyExercise(track(() => sideFrame(170, 170, 0.1), [stand(3000)]).map((f) => f.frame)).exercise).toBeNull();
    expect(classifyExercise(track(squatDepth, [stand(3000)]).map((f) => f.frame)).exercise).toBeNull();
  });

  it("keeps its score an uncalibrated margin: 0 when abstaining, never above 0.9", () => {
    const scores = [
      classifyExercise(track(squatDepth, [stand(500), down(1000), up(1000)]).map((f) => f.frame)).confidence,
      classifyExercise(track(deadliftDepth, [stand(500), down(1000), up(1000)]).map((f) => f.frame)).confidence,
    ];
    for (const score of scores) expect(score).toBeLessThanOrEqual(0.9);
  });

  it("an unidentified exercise yields no reps and no tempo, and says so", () => {
    const result = analyzeFrameSequence(longHoldFront);
    expect(result.exerciseClassification.exercise).toBeNull();
    expect(result.reps).toBe(0);
    expect(result.averageEccentricTime).toBeNull();
    expect(result.confidence).toBe(0);
  });
});

describe("legacy SetVision rep phases", () => {
  it("separates a long bottom hold from eccentric and concentric (front view, squat selected)", () => {
    const frames = track(frontFrame, [stand(2000), down(1000), hold(8500), up(800), stand(2000)]);
    const result = analyzeFrameSequence(frames, { exercise: "squat" });
    const [rep] = result.perRep.tempo;

    expect(result.exerciseClassification.signals[0]).toBe(MANUAL_SELECTION_SIGNAL);
    expect(result.reps).toBe(1);
    expect(rep.eccentricSec!).toBeLessThan(1.2);
    expect(rep.pauseSec!).toBeGreaterThan(8);
    expect(rep.concentricSec).toBeLessThan(1.2);
    // Boundaries are video-relative and ordered; threshold crossings may trail onset by a few samples.
    expect(rep.descentStartMs!).toBeGreaterThanOrEqual(2000);
    expect(rep.descentStartMs!).toBeLessThanOrEqual(2600);
    expect(rep.bottomReachedMs!).toBeLessThan(rep.ascentStartMs!);
    expect(rep.ascentStartMs!).toBeGreaterThanOrEqual(11500);
    expect(rep.repEndMs!).toBeLessThanOrEqual(12700);
    // Front view: ROM % is a projection artefact, so it is withheld and explained.
    expect(result.perRep.rom).toHaveLength(0);
    expect(result.limitations.join(" ")).toMatch(/faces the lifter/);
  });

  it("does not let a wobble during the hold start the concentric clock or add a rep", () => {
    const frames = track(squatDepth, [
      stand(1000), down(1000), hold(3000), { from: 1, to: 0.8, ms: 300 }, hold(300, 0.8), { from: 0.8, to: 1, ms: 300 },
      hold(3000), up(800), stand(1000),
    ]);
    const result = analyzeFrameSequence(frames, { exercise: "squat" });
    expect(result.reps).toBe(1);
    expect(result.perRep.tempo[0].concentricSec).toBeLessThan(1.2);
  });

  it("counts a very slow rep once", () => {
    const frames = track(squatDepth, [stand(1000), down(5000), hold(500), up(5000), stand(1000)]);
    const result = analyzeFrameSequence(frames, { exercise: "squat" });
    expect(result.reps).toBe(1);
  });

  it("does not count a partial rep", () => {
    const frames = track(squatDepth, [stand(1000), { from: 0, to: 0.55, ms: 1000 }, { from: 0.55, to: 0, ms: 1000 }, stand(1000)]);
    expect(analyzeFrameSequence(frames, { exercise: "squat" }).reps).toBe(0);
  });

  it("does not count an equipment pickup as a squat, and still counts the squats after it", () => {
    const pickup = track(pickupDepth, [stand(1000), down(1200), hold(500), up(1200), stand(1000)]);
    expect(analyzeFrameSequence(pickup, { exercise: "squat" }).reps).toBe(0);

    const squats = track(squatDepth, [down(1000), up(1000), stand(800), down(1000), up(1000), stand(800)], 4900);
    expect(analyzeFrameSequence([...pickup, ...squats], { exercise: "squat" }).reps).toBe(2);
  });

  it("counts a rep the clip starts in the middle of, without inventing its eccentric or hold", () => {
    const frames = track(squatDepth, [hold(1500), up(1000), stand(800), down(1000), up(1000), stand(800)]);
    const result = analyzeFrameSequence(frames, { exercise: "squat" });
    expect(result.reps).toBe(2);
    expect(result.perRep.tempo[0].eccentricSec).toBeNull();
    expect(result.perRep.tempo[0].pauseSec).toBeNull();
    expect(result.perRep.tempo[0].descentStartMs).toBeNull();
    expect(result.perRep.tempo[1].eccentricSec).not.toBeNull();
    expect(result.limitations.join(" ")).toMatch(/began before tracking/);
  });

  it("does not count a movement the clip ends in the middle of", () => {
    const frames = track(squatDepth, [stand(1000), down(1000), up(1000), stand(800), down(1000), hold(500)]);
    const result = analyzeFrameSequence(frames, { exercise: "squat" });
    expect(result.reps).toBe(1);
    expect(result.limitations.join(" ")).toMatch(/ends mid-movement/);
  });

  it("drops a rep interrupted by tracking loss instead of stitching across the gap", () => {
    const before = track(squatDepth, [stand(1000), { from: 0, to: 0.7, ms: 700 }]);
    const lost = track(() => ({}), [stand(2000)], 1700);
    const after = track(squatDepth, [{ from: 0.7, to: 0, ms: 700 }, stand(1000), down(1000), up(1000), stand(800)], 3700);
    const result = analyzeFrameSequence([...before, ...lost, ...after], { exercise: "squat" });
    expect(result.reps).toBe(1);
    expect(result.perRep.tempo[0].descentStartMs!).toBeGreaterThan(5000);
    expect(result.limitations.join(" ")).toMatch(/Tracking was lost/);
  });

  it("reports cross-rep consistency as unavailable for a single rep", () => {
    const frames = track(squatDepth, [stand(1000), down(1000), up(1000), stand(1000)]);
    const result = analyzeFrameSequence(frames, { exercise: "squat" });
    expect(result.reps).toBe(1);
    expect(result.technique.romConsistency).toBeNull();
    expect(result.technique.tempoConsistency).toBeNull();
    expect(result.technique.barPathConsistency).toBeNull();
    expect(result.limitations.join(" ")).toMatch(/Only 1 rep/);
  });

  it("produces nothing from an unusable video (no pose, or only low-confidence keypoints)", () => {
    for (const frames of [
      track(() => ({}), [stand(3000)]),
      track((d) => sideFrame(178 - d * 100, 175 - d * 100, 0.15), [stand(500), down(1000), up(1000), stand(500)]),
    ]) {
      const auto = analyzeFrameSequence(frames);
      const manual = analyzeFrameSequence(frames, { exercise: "squat" });
      expect(auto.exerciseClassification.exercise).toBeNull();
      expect(auto.reps).toBe(0);
      expect(manual.reps).toBe(0);
    }
  });
});

describe("SetVision P0 boundaries are unchanged for the regression clip", () => {
  it("rejects the 35.374 s, 1280×720 clip on duration before any analysis", () => {
    // Front-view abstention is covered in squat-p0.test.ts ("abstains on a frontal camera view").
    expect(validateDecodedMedia({ durationSec: 35.374, width: 1280, height: 720 })?.code).toBe("too_long");
  });
});

/* ---------------------------------------------------------------------------
   Correction round 2 (independent audit, 2026-11-01)
--------------------------------------------------------------------------- */

const frames = (t: TimedPoseFrame[]) => t.map((f) => f.frame);

/** Same pose with both wrists moved to image height `y` (directly over the knee). */
function withWrists(frame: PoseFrame, y: number): PoseFrame {
  const knee = frame.left_knee!;
  return { ...frame, left_wrist: p(knee.x, y), right_wrist: p(knee.x, y) };
}

/** Squat-depth pickup: knees bend exactly like squatDepth while the hands travel from hip height to the floor. */
const squatPickupDepth = (d: number) => withWrists(squatDepth(d), 0.4 + d * 0.55);
/** Dumbbells held at the sides: hands reach knee level and lower at every bottom. */
const sideDumbbellSquatDepth = (d: number) => withWrists(squatDepth(d), 0.55 + d * 0.3);

/** Shifts every right-side keypoint horizontally — an angled camera separates the hips. */
function angled(frame: PoseFrame, dx: number): PoseFrame {
  const out: PoseFrame = {};
  for (const [name, pt] of Object.entries(frame)) {
    out[name] = name.startsWith("right_") && pt ? { ...pt, x: pt.x + dx } : pt;
  }
  return out;
}

const squatSet = (n: number, at: (d: number) => PoseFrame = squatDepth, startMs = 0) =>
  track(at, [stand(1000), ...Array.from({ length: n }, () => [down(1000), hold(300), up(1000), stand(800)]).flat()], startMs);

describe("correction R2 — camera view uncertainty", () => {
  it("abstains on a view that is neither side-on nor frontal (hips partly separated)", () => {
    const clip = squatSet(2, (d) => angled(squatDepth(d), 0.1));
    expect(estimateCameraView(frames(clip)).view).toBe("uncertain");
    const result = classifyExercise(frames(clip));
    expect(result.exercise).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.signals[0]).toMatch(/does not look side-on/);
  });

  it("abstains when the view cannot be verified (far hip and shoulder never clearly tracked)", () => {
    const occluded = (d: number) => {
      const f = squatDepth(d);
      return { ...f, right_hip: { ...f.right_hip!, score: 0.2 }, right_shoulder: { ...f.right_shoulder!, score: 0.2 } };
    };
    const clip = squatSet(2, occluded);
    expect(estimateCameraView(frames(clip)).view).toBe("unknown");
    const result = classifyExercise(frames(clip));
    expect(result.exercise).toBeNull();
    expect(result.signals[0]).toMatch(/could not be verified/);
  });

  it("does not report a joint range when the view is not verified side-on, but still times the reps", () => {
    const result = analyzeFrameSequence(squatSet(2, (d) => angled(squatDepth(d), 0.1)), { exercise: "squat" });
    expect(result.reps).toBe(2);
    expect(result.perRep.rom).toHaveLength(0);
    expect(result.limitations.join(" ")).toMatch(/could not be verified as side-on/);
  });

  it("still suggests squat for a clean side-on squat", () => {
    expect(classifyExercise(frames(squatSet(2))).exercise).toBe("squat");
  });
});

describe("correction R2 — squat-depth equipment pickup", () => {
  const pickup = track(squatPickupDepth, [stand(1000), down(1200), hold(500), up(1200), stand(1000)]);

  it("auto-detect abstains on a squat-depth pickup instead of calling it a squat", () => {
    const result = classifyExercise(frames(pickup));
    expect(result.exercise).toBeNull();
    expect(result.signals[0]).toMatch(/hands are at or below the knees/);
  });

  it("with squat chosen, sets the pickup aside as an outlier and keeps every genuine rep", () => {
    const result = analyzeFrameSequence([...pickup, ...squatSet(2, squatDepth, 4900)], { exercise: "squat" });
    expect(result.reps).toBe(2);
    expect(result.perRep.tempo.map((t) => t.repNumber)).toEqual([1, 2]);
    expect(result.perRep.tempo[0].descentStartMs!).toBeGreaterThan(4900);
    expect(result.limitations.join(" ")).toMatch(/picked up or put down, so it was not counted/);
  });

  it("never suppresses a whole set of genuine hands-low squats — it flags the count instead", () => {
    const result = analyzeFrameSequence(squatSet(3, sideDumbbellSquatDepth), { exercise: "squat" });
    expect(result.reps).toBe(3);
    expect(result.limitations.join(" ")).toMatch(/cannot be told apart/);
  });

  it("keeps an ambiguous lone pickup + one squat as 2 counted, flagged — no majority to call an outlier", () => {
    const result = analyzeFrameSequence([...pickup, ...squatSet(1, squatDepth, 4900)], { exercise: "squat" });
    expect(result.reps).toBe(2);
    expect(result.limitations.join(" ")).toMatch(/cannot be told apart/);
  });

  it("leaves genuine hands-high squats untouched (no pickup note)", () => {
    const result = analyzeFrameSequence(squatSet(3), { exercise: "squat" });
    expect(result.reps).toBe(3);
    expect(result.limitations.join(" ")).not.toMatch(/picked up|told apart/);
  });
});

describe("correction R2 — auxiliary landmark confidence", () => {
  it("bar proxy ignores low-score and non-finite keypoints", () => {
    const deadlift = getExerciseConfig("deadlift");
    const squat = getExerciseConfig("squat");
    const base = squatDepth(0);
    expect(deadlift.barProxy({ ...base, left_wrist: p(0.1, 0.1, 0.2), right_wrist: p(0.9, 0.9, 0.3) })).toBeNull();
    expect(deadlift.barProxy({ ...base, left_wrist: p(0.4, 0.5), right_wrist: p(9, 9, 0.1) })).toEqual(p(0.4, 0.5));
    expect(deadlift.barProxy({ ...base, left_wrist: p(Number.NaN, 0.5), right_wrist: p(0.6, 0.5) })).toEqual(p(0.6, 0.5));
    expect(squat.barProxy({ ...base, left_shoulder: p(0.2, 0.2, 0.1), right_shoulder: p(0.8, 0.2, 0.1) })).toBeNull();
  });

  it("torso length needs one clearly tracked shoulder–hip side", () => {
    const base = squatDepth(0);
    const low = (pt: Landmark | undefined) => ({ ...pt!, score: 0.2 });
    expect(estimateTorsoLength({ ...base, left_shoulder: low(base.left_shoulder), right_hip: low(base.right_hip) })).toBeNull();
    expect(estimateTorsoLength(base)).toBeCloseTo(0.4, 2);
  });

  it("a low-score far-side shoulder flickering to garbage does not change speed or bar path", () => {
    const clean = analyzeFrameSequence(squatSet(3), { exercise: "squat" });
    const noisy = analyzeFrameSequence(
      squatSet(3).map((f, i) => (i % 3 === 0 ? { ...f, frame: { ...f.frame, right_shoulder: p(5, -5, 0.1) } } : f)),
      { exercise: "squat" },
    );
    expect(noisy.velocity.mean).toBe(clean.velocity.mean);
    expect(noisy.technique.barPathConsistency).toBe(clean.technique.barPathConsistency);
  });

  it("never emits NaN/Infinity metrics when aux keypoints are untracked", () => {
    const blind = squatSet(3).map((f) => ({
      ...f,
      frame: { ...f.frame, left_shoulder: p(0.5, 0, 0.1), right_shoulder: p(0.5, 0, 0.1) },
    }));
    const result = analyzeFrameSequence(blind, { exercise: "squat" });
    expect(result.reps).toBe(3);
    expect(result.velocity.mean).toBeNull();
    expect(result.technique.barPathConsistency).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(/NaN|Infinity/);
  });
});

describe("correction R2 — ROM and signal integrity", () => {
  it("reports the observed 2D joint range from standing to the deepest point", () => {
    const result = analyzeFrameSequence(squatSet(2), { exercise: "squat" });
    expect(result.perRep.rom).toHaveLength(2);
    for (const rom of result.perRep.rom) {
      expect(rom.rangeDeg).toBeGreaterThan(95); // knee 178° → 78°
      expect(rom.rangeDeg).toBeLessThanOrEqual(100);
    }
  });

  it("gives no ROM entry for an impossible joint range instead of a fabricated value", () => {
    const config = getExerciseConfig("squat");
    const rep = (minAngleDeg: number, maxAngleDeg: number) => ({ repNumber: 1, minAngleDeg, maxAngleDeg }) as CompletedRep;
    expect(computeRepRom(rep(Number.NaN, 170), config)).toBeNull();
    expect(computeRepRom(rep(90, 90), config)).toBeNull();
    expect(computeRepRom(rep(-30, 170), config)).toBeNull();
    expect(computeRepRom(rep(80, 170), config)?.rangeDeg).toBe(90);
  });

  it("choosing the exercise manually does not raise the analysis-quality score", () => {
    const clip = squatSet(3);
    const auto = analyzeFrameSequence(clip);
    const manual = analyzeFrameSequence(clip, { exercise: "squat" });
    expect(auto.exerciseClassification.exercise).toBe("squat");
    expect(manual.confidence).toBe(auto.confidence);
    expect(manual.exerciseClassification.confidence).toBeNull();
  });
});
