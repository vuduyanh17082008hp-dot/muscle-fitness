import { describe, expect, it } from "vitest";

import { analyzeFrameSequence, MANUAL_SELECTION_SIGNAL } from "@/lib/setvision/analyze";
import { classifyExercise, estimateCameraView } from "@/lib/setvision/exercise-classifier";
import { getExerciseConfig } from "@/lib/setvision/exercise-config";
import { validateDecodedMedia } from "@/lib/setvision/squat-p0/extract";
import type { Landmark, PoseFrame, TimedPoseFrame } from "@/lib/setvision/types";

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
    expect(rep.bottomReachedMs!).toBeLessThan(rep.ascentStartMs);
    expect(rep.ascentStartMs).toBeGreaterThanOrEqual(11500);
    expect(rep.repEndMs).toBeLessThanOrEqual(12700);
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
