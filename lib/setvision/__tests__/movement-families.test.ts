import { describe, expect, it } from "vitest";

import { analyzeFrameSequence } from "@/lib/setvision/analyze";
import { getExerciseConfig } from "@/lib/setvision/exercise-config";
import type { Landmark, PoseFrame, SetVisionExerciseId, TimedPoseFrame } from "@/lib/setvision/types";

/**
 * Synthetic checks of every movement-family engine. Geometry: torso
 * vertical (hip below shoulder), legs straight and still. Arm pose =
 * shoulderDeg (hip–shoulder–elbow, 0 = arm down by the side, 90 = forward
 * or out to the side, 180 = overhead) and elbowDeg (shoulder–elbow–wrist).
 * "side" view: both body sides coincide. "frontal" view: the sides are
 * mirrored a hip-width apart and the arms move out to the sides.
 */

type ArmPose = { shoulderDeg: number; elbowDeg: number };
type Options = { view?: "side" | "frontal"; idle?: ArmPose | null; score?: number };

const p = (x: number, y: number, score = 0.9): Landmark => ({ x, y, score });
const rad = (deg: number) => (deg * Math.PI) / 180;

function armFrame(pose: ArmPose, { view = "side", idle = undefined, score = 0.9 }: Options = {}): PoseFrame {
  const frame: PoseFrame = {};
  for (const side of ["left", "right"] as const) {
    const arm = side === "right" && idle ? idle : pose;
    const sx = view === "frontal" ? (side === "left" ? -1 : 1) : 1;
    const cx = view === "frontal" ? (side === "left" ? 0.45 : 0.55) : 0.5;
    const shoulder = p(cx, 0.4, score);
    const elbow = p(cx + sx * Math.sin(rad(arm.shoulderDeg)) * 0.25, 0.4 + Math.cos(rad(arm.shoulderDeg)) * 0.25, score);
    const forearm = arm.shoulderDeg + (180 - arm.elbowDeg);
    Object.assign(frame, {
      [`${side}_shoulder`]: shoulder,
      [`${side}_elbow`]: elbow,
      [`${side}_wrist`]: p(elbow.x + sx * Math.sin(rad(forearm)) * 0.25, elbow.y + Math.cos(rad(forearm)) * 0.25, score),
      [`${side}_hip`]: p(cx, 0.8, score),
      [`${side}_knee`]: p(cx, 1.0, score),
      [`${side}_ankle`]: p(cx, 1.2, score),
    });
  }
  return frame;
}

const STEP = 100;

/** rest → work → rest, `reps` times, with holds; linear interpolation at 10 Hz. */
function cycles(rest: ArmPose, work: ArmPose, reps: number, options: Options = {}, steps = 8): TimedPoseFrame[] {
  const poses: ArmPose[] = [];
  const lerp = (a: ArmPose, b: ArmPose, t: number) => ({ shoulderDeg: a.shoulderDeg + (b.shoulderDeg - a.shoulderDeg) * t, elbowDeg: a.elbowDeg + (b.elbowDeg - a.elbowDeg) * t });
  for (let i = 0; i < 5; i += 1) poses.push(rest);
  for (let r = 0; r < reps; r += 1) {
    for (let i = 1; i <= steps; i += 1) poses.push(lerp(rest, work, i / steps));
    for (let i = 0; i < 3; i += 1) poses.push(work);
    for (let i = 1; i <= steps; i += 1) poses.push(lerp(work, rest, i / steps));
    for (let i = 0; i < 5; i += 1) poses.push(rest);
  }
  return poses.map((pose, i) => ({ timestampMs: i * STEP, frame: armFrame(pose, options) }));
}

const SETS: Record<Exclude<SetVisionExerciseId, "squat" | "deadlift">, { rest: ArmPose; work: ArmPose; view?: "side" | "frontal" }> = {
  bench_press: { rest: { shoulderDeg: 90, elbowDeg: 175 }, work: { shoulderDeg: 90, elbowDeg: 70 } },
  vertical_press: { rest: { shoulderDeg: 60, elbowDeg: 50 }, work: { shoulderDeg: 170, elbowDeg: 175 }, view: "frontal" },
  vertical_pull: { rest: { shoulderDeg: 170, elbowDeg: 175 }, work: { shoulderDeg: 120, elbowDeg: 60 }, view: "frontal" },
  horizontal_pull: { rest: { shoulderDeg: 80, elbowDeg: 170 }, work: { shoulderDeg: 40, elbowDeg: 80 } },
  elbow_flexion: { rest: { shoulderDeg: 10, elbowDeg: 170 }, work: { shoulderDeg: 15, elbowDeg: 40 } },
  triceps_pushdown: { rest: { shoulderDeg: 15, elbowDeg: 80 }, work: { shoulderDeg: 10, elbowDeg: 172 } },
  overhead_triceps_extension: { rest: { shoulderDeg: 165, elbowDeg: 60 }, work: { shoulderDeg: 165, elbowDeg: 172 } },
  lateral_raise: { rest: { shoulderDeg: 15, elbowDeg: 165 }, work: { shoulderDeg: 90, elbowDeg: 165 }, view: "frontal" },
};

const analyze = (frames: TimedPoseFrame[], exercise: SetVisionExerciseId) => analyzeFrameSequence(frames, { exercise });

describe("every movement-family engine on a clean synthetic set", () => {
  for (const [engine, set] of Object.entries(SETS) as Array<[keyof typeof SETS, (typeof SETS)[keyof typeof SETS]]>) {
    it(`${engine}: counts 3 reps and labels its phases by the movement's direction`, () => {
      const a = analyze(cycles(set.rest, set.work, 3, { view: set.view }), engine);
      expect(a.abstainReason).toBeNull();
      expect(a.reps).toBe(3);
      expect(a.events).toEqual([]);
      const t = a.perRep.tempo[0];
      // Leaving the rest position takes 8 frames ≈ 0.7–0.8 s; returning takes as long.
      expect(t.eccentricSec).not.toBeNull();
      expect(t.concentricSec).not.toBeNull();
      const outbound = getExerciseConfig(engine).outbound === "eccentric" ? t.eccentricSec : t.concentricSec;
      expect(outbound).toBeCloseTo((t.bottomReachedMs! - t.descentStartMs!) / 1000, 2);
      // No engine but squat/deadlift tracks a bar: speed is absent, never zero.
      expect(a.velocity.mean).toBeNull();
    });
  }

  it("pull and curl engines time the pull/curl as concentric, presses time the lowering as eccentric", () => {
    expect(getExerciseConfig("vertical_pull").outbound).toBe("concentric");
    expect(getExerciseConfig("elbow_flexion").outbound).toBe("concentric");
    expect(getExerciseConfig("horizontal_pull").outbound).toBe("concentric");
    expect(getExerciseConfig("bench_press").outbound).toBe("eccentric");
    // A vertical press rests in the rack: pressing up (leaving rest) is concentric.
    expect(getExerciseConfig("vertical_press")).toMatchObject({ rest: "low", outbound: "concentric" });
  });
});

describe("partial reps, tracking loss and invalid landmarks", () => {
  const curl = SETS.elbow_flexion;

  it("reports a curl that stops half-way as partial and does not count it", () => {
    const frames = [
      ...cycles(curl.rest, curl.work, 1),
      ...cycles(curl.rest, { shoulderDeg: 12, elbowDeg: 95 }, 1),
      ...cycles(curl.rest, curl.work, 1),
    ].map((f, i) => ({ ...f, timestampMs: i * STEP }));
    const a = analyze(frames, "elbow_flexion");
    expect(a.reps).toBe(2);
    expect(a.events?.map((e) => e.kind)).toEqual(["partial"]);
  });

  it("drops a rep interrupted by tracking loss (reported as uncertain), never stitching across the gap", () => {
    const frames = cycles(curl.rest, curl.work, 3).map((f) =>
      f.timestampMs >= 3300 && f.timestampMs <= 4800 ? { ...f, frame: armFrame(curl.work, { score: 0.1 }) } : f,
    );
    const a = analyze(frames, "elbow_flexion");
    expect(a.reps).toBeLessThan(3);
    expect(a.events?.some((e) => e.kind === "uncertain")).toBe(true);
    expect(a.limitations.join(" ")).toMatch(/Tracking was lost/);
  });

  it("abstains when the arm is never clearly tracked (low scores or non-finite points)", () => {
    expect(analyze(cycles(curl.rest, curl.work, 3, { score: 0.2 }), "elbow_flexion").abstainReason).toMatch(/not clearly visible/);
    const nan = cycles(curl.rest, curl.work, 3).map((f) => ({
      ...f,
      frame: { ...f.frame, left_wrist: p(Number.NaN, 0.5), right_wrist: p(Number.NaN, 0.5) },
    }));
    expect(analyze(nan, "elbow_flexion").abstainReason).toMatch(/not clearly visible/);
  });

  it("abstains with the reason when too little elbow movement is visible (e.g. moving toward the camera)", () => {
    const a = analyze(cycles(curl.rest, { shoulderDeg: 10, elbowDeg: 130 }, 3), "elbow_flexion");
    expect(a.reps).toBe(0);
    expect(a.abstainReason).toMatch(/Only about \d+° of elbow angle movement/);
  });

  it("follows the working arm of a one-arm exercise, not the idle one", () => {
    const a = analyzeFrameSequence(cycles(curl.rest, curl.work, 3, { idle: { shoulderDeg: 10, elbowDeg: 170 } }), { exercise: "elbow_flexion" });
    expect(a.measuredSide).toBe("left");
    expect(a.reps).toBe(3);
  });
});

describe("a chosen exercise is not evidence: body-position and camera checks", () => {
  it("refuses a lateral raise filmed side-on (it can't be told from a front raise)", () => {
    const a = analyze(cycles(SETS.lateral_raise.rest, SETS.lateral_raise.work, 3, { view: "side" }), "lateral_raise");
    expect(a.reps).toBe(0);
    expect(a.abstainReason).toMatch(/side-on/);
  });

  it("refuses a curl as a pulldown, a press or a lateral raise", () => {
    const curl = cycles(SETS.elbow_flexion.rest, SETS.elbow_flexion.work, 3);
    expect(analyze(curl, "vertical_pull").abstainReason).toMatch(/overhead/);
    expect(analyze(curl, "vertical_press").abstainReason).toMatch(/overhead/);
    expect(analyze(curl, "overhead_triceps_extension").abstainReason).toMatch(/overhead/);
  });

  it("does not count an overhead press as a lateral raise or a row", () => {
    const press = cycles(SETS.vertical_press.rest, SETS.vertical_press.work, 3, { view: "frontal" });
    // The arms never drop back to the sides, so a lateral raise never even starts.
    expect(analyze(press, "lateral_raise").reps).toBe(0);
    expect(analyze(press, "horizontal_pull").abstainReason).toMatch(/overhead/);
  });

  it("refuses a pulldown as a pushdown (the arms are not down by the sides)", () => {
    const pull = cycles(SETS.vertical_pull.rest, SETS.vertical_pull.work, 3, { view: "frontal" });
    expect(analyze(pull, "triceps_pushdown").reps).toBe(0);
  });

  it("drops only the cycles in the wrong position: pre-set arm swings by the sides don't count as overhead presses", () => {
    const swing = cycles({ shoulderDeg: 10, elbowDeg: 170 }, { shoulderDeg: 20, elbowDeg: 60 }, 1, { view: "frontal" });
    const press = cycles(SETS.vertical_press.rest, SETS.vertical_press.work, 2, { view: "frontal" });
    const frames = [...swing, ...press].map((f, i) => ({ ...f, timestampMs: i * STEP }));
    const a = analyze(frames, "vertical_press");
    expect(a.reps).toBe(2);
    expect(a.events?.some((e) => e.kind === "excluded")).toBe(true);
  });
});

describe("hip hinge (deadlift engine) — 2026-11 real-footage regression", () => {
  /** Side-view hinge: legs straight, torso folds forward so the hip angle (shoulder–hip–knee) = hipDeg. */
  const hinge = (hipDeg: number): PoseFrame => {
    const lean = 180 - hipDeg;
    const shoulder = p(0.5 + Math.sin(rad(lean)) * 0.4, 0.6 - Math.cos(rad(lean)) * 0.4);
    const frame: PoseFrame = {};
    for (const side of ["left", "right"]) {
      Object.assign(frame, {
        [`${side}_shoulder`]: shoulder,
        [`${side}_hip`]: p(0.5, 0.6),
        [`${side}_knee`]: p(0.5, 0.85),
        [`${side}_ankle`]: p(0.5, 1.1),
        [`${side}_wrist`]: p(shoulder.x, shoulder.y + 0.3),
      });
    }
    return frame;
  };
  const hinges = (bottomDeg: number) => {
    const angles: number[] = [];
    for (let r = 0; r < 2; r += 1) {
      for (let i = 0; i < 5; i += 1) angles.push(175);
      for (let i = 1; i <= 8; i += 1) angles.push(175 - ((175 - bottomDeg) * i) / 8);
      for (let i = 0; i < 3; i += 1) angles.push(bottomDeg);
      for (let i = 1; i <= 8; i += 1) angles.push(bottomDeg + ((175 - bottomDeg) * i) / 8);
    }
    for (let i = 0; i < 5; i += 1) angles.push(175);
    return angles.map((deg, i) => ({ timestampMs: i * STEP, frame: hinge(deg) }));
  };

  it("counts hinges that bottom out at 95–100° (real deadlifts in 2D; the old 70° threshold counted none)", () => {
    expect(analyze(hinges(95), "deadlift").reps).toBe(2);
    expect(analyze(hinges(100), "deadlift").reps).toBe(2);
  });

  it("still does not count a shallow torso lean", () => {
    expect(analyze(hinges(140), "deadlift").reps).toBe(0);
  });
});
