import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { analyzeFrameSequence, suggestExercise } from "@/lib/setvision/analyze";
import type { SetVisionExerciseId, TimedPoseFrame } from "@/lib/setvision/types";

/**
 * Movement-family engines on REAL pose noise: MoveNet keypoints from openly
 * licensed clips (see real-pose/README.md — some are rendered animations,
 * labelled as such). Expected counts were checked by eye against frame
 * sheets; they pin behaviour, they are not accuracy claims.
 */

function load(name: string): TimedPoseFrame[] {
  const { keys, frames } = JSON.parse(readFileSync(join(__dirname, "real-pose", `${name}.json`), "utf8")) as { keys: string[]; frames: number[][] };
  return frames.map(([timestampMs, ...values]) => ({
    timestampMs,
    frame: Object.fromEntries(
      keys.flatMap((key, i) => (values[i * 3 + 2] > 0 ? [[key, { x: values[i * 3], y: values[i * 3 + 1], score: values[i * 3 + 2] }]] : [])),
    ),
  }));
}

const run = (name: string, exercise: SetVisionExerciseId) => analyzeFrameSequence(load(name), { exercise });
const repEnds = (name: string, exercise: SetVisionExerciseId) => run(name, exercise).perRep.tempo.map((t) => Math.round((t.repEndMs ?? 0) / 100) / 10);

describe("horizontal press (bench_press engine)", () => {
  it("counts the 2 presses to lockout in a rendered flat bench clip", () => {
    const a = run("bench", "bench_press");
    expect(a.reps).toBe(2);
    expect(a.abstainReason).toBeNull();
    // The first press starts at the chest before tracking: its lowering is not invented.
    expect(a.perRep.tempo[0].eccentricSec).toBeNull();
    expect(a.perRep.tempo[1].eccentricSec).not.toBeNull();
    // No bar is tracked, so no speed is reported — not a zero.
    expect(a.velocity.mean).toBeNull();
  });

  it("counts the 2 presses of a rendered incline press", () => {
    expect(run("incline", "bench_press").reps).toBe(2);
  });

  it("counts nothing on a machine chest press filmed head-on (the press moves toward the camera)", () => {
    expect(run("chestpress", "bench_press").reps).toBe(0);
  });
});

describe("vertical pull (vertical_pull engine)", () => {
  it("counts the full pull at the end of a real lat-pulldown compilation, and a return whose pull was cut off", () => {
    const a = run("pulldown", "vertical_pull");
    expect(a.reps).toBe(2);
    // Pulling down is the concentric phase: unobserved for the first rep, observed for the second.
    expect(a.perRep.tempo[0].concentricSec).toBeNull();
    expect(a.perRep.tempo[1].concentricSec).not.toBeNull();
    expect(a.perRep.tempo[1].eccentricSec).not.toBeNull();
    // The edited, cut-up first half is reported as uncertain, not counted.
    expect(a.events?.some((e) => e.kind === "uncertain" && e.endMs < 6000)).toBe(true);
  });

  it("counts the 2 pull-ups of a rendered clip", () => {
    expect(run("pullup", "vertical_pull").reps).toBe(2);
  });

  it("refuses to call a curl a pulldown: the hands are never overhead", () => {
    const a = run("curl", "vertical_pull");
    expect(a.reps).toBe(0);
    expect(a.abstainReason).toMatch(/not overhead/);
  });
});

describe("vertical press (vertical_press engine)", () => {
  it("counts the real machine overhead press cycles it can follow, and flags the one lost to tracking", () => {
    const a = run("ohp", "vertical_press");
    expect(a.reps).toBe(2);
    // Pressing up is the concentric phase of a rest-at-the-rack engine.
    expect(a.perRep.tempo[1].concentricSec).not.toBeNull();
    expect(a.events?.some((e) => e.kind === "uncertain")).toBe(true);
  });

  it("refuses a lying bench press as an overhead press", () => {
    expect(run("bench", "vertical_press").abstainReason).toMatch(/overhead/);
  });
});

describe("elbow flexion (elbow_flexion engine)", () => {
  it("counts 7 of the 10 curls in a real edited clip and flags the other 3 as uncertain — none invented", () => {
    const a = run("curl", "elbow_flexion");
    expect(a.reps).toBe(7);
    expect(repEnds("curl", "elbow_flexion")).toEqual([3.1, 5.2, 7.5, 9.6, 11.9, 14.4, 23]);
    expect(a.events?.filter((e) => e.kind === "uncertain")).toHaveLength(3);
  });

  it("refuses a bench press as a curl", () => {
    expect(run("bench", "elbow_flexion").abstainReason).toMatch(/curl/);
  });
});

describe("horizontal pull (horizontal_pull engine)", () => {
  it("counts the rendered bent-over row's rows it can follow", () => {
    const a = run("row", "horizontal_pull");
    expect(a.reps).toBe(2);
    expect(a.abstainReason).toBeNull();
  });

  it("refuses an overhead press or a pull-up as a row", () => {
    expect(run("ohp", "horizontal_pull").abstainReason).toMatch(/overhead/);
    expect(run("pullup", "horizontal_pull").abstainReason).toMatch(/overhead/);
  });
});

describe("Auto-detect on real pose", () => {
  it("suggests the lying press, and offers candidate lists (never one wrong guess) for arm movements", () => {
    expect(suggestExercise(load("bench")).exercise).toBe("bench_press");
    for (const [name, mustInclude] of [
      ["pulldown", "vertical_pull"],
      ["pullup", "vertical_pull"],
      ["ohp", "vertical_press"],
      ["curl", "elbow_flexion"],
      ["row", "horizontal_pull"],
    ] as const) {
      const s = suggestExercise(load(name));
      expect(s.exercise).toBeNull();
      expect(s.candidates).toContain(mustInclude);
      expect(s.candidates!.length).toBeGreaterThan(1);
    }
  });

  it("abstains on the head-on machine chest press", () => {
    const s = suggestExercise(load("chestpress"));
    expect(s.exercise).toBeNull();
    expect(s.candidates ?? []).toEqual([]);
  });
});
