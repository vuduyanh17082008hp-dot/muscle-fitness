import { describe, expect, it } from "vitest";

import { aiReviewScope, analyzeFrameSequence } from "@/lib/setvision/analyze";
import { findBoundaries, partition, sanitizeFrames } from "@/lib/setvision/segments";
import type { DetectedPerson, SetVisionAnalysis, SetVisionExerciseId, TimedPoseFrame } from "@/lib/setvision/types";

import { benchFrame, buildRepSequence, deadliftFrame, squatFrame } from "./fixtures";

/**
 * Segment-aware continuity (shared by every engine): a break never rejects the whole clip and never lets
 * anything — reps, side, tempo, range, identity — leak across it.
 */

const STEP = 50;
const quiet = { diff: 0.5, luma: 90, span: 0.1, blend: 0.4 };
const person = (id: number): DetectedPerson => ({ id, score: 0.6, visible: 17, cx: 100, cy: 150 });

type Part = { reps: number; frameFn?: (d: number) => TimedPoseFrame["frame"]; people?: DetectedPerson[] };

/** Concatenates rep sequences end to end (one sample apart) with a quiet scene meter. */
function clip(parts: Part[]): { frames: TimedPoseFrame[]; starts: number[] } {
  const frames: TimedPoseFrame[] = [];
  const starts: number[] = [];
  for (const part of parts) {
    const offset = frames.length ? frames[frames.length - 1].timestampMs + STEP : 0;
    starts.push(offset);
    for (const f of buildRepSequence(part.frameFn ?? squatFrame, part.reps)) {
      frames.push({ ...f, timestampMs: f.timestampMs + offset, scene: { ...quiet, diff: frames.length ? 0.5 : null }, ...(part.people ? { people: part.people } : {}) });
    }
  }
  return { frames, starts };
}

const at = (frames: TimedPoseFrame[], t: number) => frames.find((f) => f.timestampMs === t)!;
const hardCut = (frames: TimedPoseFrame[], t: number) => (at(frames, t).scene = { ...quiet, diff: 80 });
const withinPrimary = (a: SetVisionAnalysis) => {
  const p = a.segments!.find((s) => s.primary)!;
  expect(a.perRep.tempo.length).toBe(a.reps); // never vacuous
  return a.perRep.tempo.every((r) => {
    const start = r.descentStartMs ?? r.bottomReachedMs ?? r.ascentStartMs;
    return start !== null && r.repEndMs !== null && start >= p.startMs && r.repEndMs <= p.endMs;
  });
};
const analyze = (frames: TimedPoseFrame[], exercise: SetVisionExerciseId = "squat") => analyzeFrameSequence(frames, { exercise });

describe("continuous recording", () => {
  it("one take → one part, no segment report, the whole-clip result unchanged", () => {
    const { frames } = clip([{ reps: 3 }]);
    expect(findBoundaries(frames)).toEqual([]);
    const a = analyze(frames);
    expect(a.reps).toBe(3);
    expect(a.segments).toBeUndefined();
    expect(a.abstainReason).toBeNull();
  });

  it("a brief occlusion (< 2 s) stays inside the part — the rep machine handles it", () => {
    const { frames } = clip([{ reps: 3 }]);
    frames.slice(20, 40).forEach((f) => (f.frame = {})); // 1 s hidden
    expect(findBoundaries(frames).map((b) => b.kind)).toEqual([]);
    expect(analyze(frames).segments).toBeUndefined();
  });
});

describe("cuts and fades split the clip; parts are analysed alone and never added together", () => {
  it("single cut: 3 reps | cut | 2 reps → headline 3 (never 5), both parts listed", () => {
    const { frames, starts } = clip([{ reps: 3 }, { reps: 2 }]);
    hardCut(frames, starts[1]);
    const a = analyze(frames);
    expect(a.reps).toBe(3);
    expect(a.segments?.map((s) => [s.status, s.reps, s.openedBy, s.primary])).toEqual([
      ["analyzed", 3, null, true],
      ["analyzed", 2, "cut", false],
    ]);
    expect(withinPrimary(a)).toBe(true);
    expect(a.limitations[0]).toMatch(/2 parts, separated by a cut to a different shot.*not added in, because SetVision can't confirm they show the same athlete/);
  });

  it("multiple cuts: 2 | 3 | 1 → the middle part is the headline; no rep from another part leaks in", () => {
    const { frames, starts } = clip([{ reps: 2 }, { reps: 3 }, { reps: 1 }]);
    hardCut(frames, starts[1]);
    hardCut(frames, starts[2]);
    const a = analyze(frames);
    expect(a.reps).toBe(3);
    expect(a.segments).toHaveLength(3);
    expect(a.segments!.filter((s) => s.primary)).toHaveLength(1);
    expect(a.segments![1].primary).toBe(true);
    expect(withinPrimary(a)).toBe(true);
    expect(a.segments!.reduce((sum, s) => sum + s.coverage, 0)).toBeLessThanOrEqual(1);
  });

  it("a fade (cross-dissolve) drops the blended frames and splits the clip", () => {
    const { frames, starts } = clip([{ reps: 3 }, { reps: 2 }]);
    for (let t = starts[1]; t < starts[1] + 300; t += STEP) at(frames, t).scene = { ...quiet, span: 0.7, blend: 0.05 };
    const kinds = findBoundaries(frames).map((b) => b.kind);
    expect(kinds).toContain("fade");
    const a = analyze(frames);
    expect(a.segments!.some((s) => s.openedBy === "fade")).toBe(true);
    expect(a.reps).toBeLessThanOrEqual(3);
    expect(withinPrimary(a)).toBe(true);
  });
});

describe("rep state never crosses an untrusted boundary", () => {
  it("a rep that starts before a cut and finishes after it is counted on neither side", () => {
    // Part A: 2 reps, then a descent that is cut off at the bottom. Part B: starts AT the bottom, rises, then 2 reps.
    const a1 = clip([{ reps: 2 }]).frames;
    let t = a1[a1.length - 1].timestampMs;
    for (let i = 1; i <= 10; i += 1) a1.push({ timestampMs: (t += STEP), frame: squatFrame(i / 10), scene: quiet });
    const cutAt = t + STEP;
    const b: TimedPoseFrame[] = [];
    for (let i = 10; i >= 0; i -= 1) b.push({ timestampMs: (t += STEP), frame: squatFrame(i / 10), scene: quiet });
    for (const f of buildRepSequence(squatFrame, 2)) b.push({ ...f, timestampMs: f.timestampMs + t + STEP, scene: quiet });
    const frames = [...a1, ...b];
    hardCut(frames, cutAt);
    const a = analyze(frames);
    expect(a.segments?.map((s) => s.reps)).toEqual([2, 2]);
    expect(a.reps).toBe(2);
    expect(a.segments!.every((s) => s.reps <= 2)).toBe(true);
  });

  it("a long tracking interruption (> 2 s) is a boundary: parts before/after are separate", () => {
    const { frames } = clip([{ reps: 3 }]);
    const last = frames[frames.length - 1].timestampMs;
    for (let i = 1; i <= 50; i += 1) frames.push({ timestampMs: last + i * STEP, frame: {}, scene: quiet }); // 2.5 s hidden
    const after = clip([{ reps: 2 }]).frames.map((f) => ({ ...f, timestampMs: f.timestampMs + last + 51 * STEP, scene: quiet }));
    const a = analyze([...frames, ...after]);
    expect(a.segments?.map((s) => [s.openedBy, s.reps])).toEqual([[null, 3], ["tracking_loss", 2]]);
    expect(a.reps).toBe(3);
  });
});

describe("camera movement", () => {
  it("is a boundary for tracked analysis (scale/angle reset), each steady part analysed alone", () => {
    const { frames, starts } = clip([{ reps: 3 }, { reps: 2 }]);
    for (let t = starts[1]; t < starts[1] + 250; t += STEP) at(frames, t).scene = { ...quiet, span: 0.7, blend: 0.4 };
    expect(findBoundaries(frames).map((b) => b.kind)).toEqual(["camera_move"]);
    const a = analyze(frames);
    expect(a.segments!.map((s) => s.openedBy)).toEqual([null, "camera_move"]);
    expect(a.reps).toBeLessThanOrEqual(3);
    expect(a.reps).toBeGreaterThan(0);
    expect(withinPrimary(a)).toBe(true);
  });
});

describe("people and identity (the wrong-person guards are kept, per part)", () => {
  it("identity change: id 1 → id 2 is a boundary; the parts are never combined", () => {
    const { frames } = clip([{ reps: 3, people: [person(1)] }, { reps: 2, people: [person(2)] }]);
    const kinds = findBoundaries(frames).map((b) => b.kind);
    expect(kinds).toEqual(["identity_change"]);
    const a = analyze(frames);
    expect(a.reps).toBe(3);
    expect(a.segments!.map((s) => s.openedBy)).toEqual([null, "identity_change"]);
  });

  it("two people in one continuous take → still Not assessable (who was measured is unknown)", () => {
    const { frames } = clip([{ reps: 3, people: [person(1), person(2)] }]);
    const a = analyze(frames);
    expect(a.reps).toBe(0);
    expect(a.abstainReason).toMatch(/More than one person/);
  });

  it("two people only after a cut → that part is Not assessable, the single-person part is analysed", () => {
    const { frames, starts } = clip([{ reps: 3, people: [person(1)] }, { reps: 2, people: [person(1), person(2)] }]);
    hardCut(frames, starts[1]);
    const a = analyze(frames);
    expect(a.reps).toBe(3);
    expect(a.segments![1]).toMatchObject({ status: "not_assessable", reps: 0 });
    expect(a.segments![1].reason).toMatch(/More than one person/);
  });
});

describe("corrupt input and Not assessable", () => {
  it("corrupt frames (NaN keypoints, repeated / backwards timestamps) are skipped and said so", () => {
    const { frames } = clip([{ reps: 3 }]);
    frames.splice(30, 0, { ...frames[29] }, { timestampMs: frames[29].timestampMs - 10, frame: squatFrame(0.5) });
    frames.splice(60, 0, { timestampMs: frames[59].timestampMs + 1, frame: { left_hip: { x: Number.NaN, y: 0.3, score: 1 } } });
    expect(sanitizeFrames(frames).dropped).toBe(3);
    const a = analyze(frames);
    expect(a.reps).toBe(3);
    expect(a.limitations.join(" ")).toMatch(/3 unreadable or out-of-order video frame\(s\) were skipped/);
  });

  it("no part meets the evidence bar → Not assessable with each part's reason, no reps", () => {
    const { frames, starts } = clip([{ reps: 0 }, { reps: 0 }, { reps: 0 }]);
    hardCut(frames, starts[1]);
    hardCut(frames, starts[2]);
    const a = analyze(frames);
    expect(a.reps).toBe(0);
    expect(a.abstainReason).toMatch(/^Not assessable: the video breaks at a cut to a different shot/);
    expect(a.segments!.every((s) => s.status === "not_assessable")).toBe(true);
  });

  it("no duplicated explanation: each limitation appears once", () => {
    const { frames, starts } = clip([{ reps: 3 }, { reps: 2 }]);
    hardCut(frames, starts[1]);
    const a = analyze(frames);
    expect(new Set(a.limitations).size).toBe(a.limitations.length);
  });
});

describe("every engine uses the same pipeline (no exercise-specific bypass)", () => {
  it.each([
    ["deadlift", deadliftFrame],
    ["bench_press", benchFrame],
  ] as const)("%s: a cut splits the clip and the headline never sums parts", (exercise, frameFn) => {
    const { frames, starts } = clip([{ reps: 3, frameFn }, { reps: 2, frameFn }]);
    hardCut(frames, starts[1]);
    expect(analyze(clip([{ reps: 3, frameFn }]).frames, exercise).reps).toBe(3); // the engine counts this fixture
    const a = analyze(frames, exercise);
    expect(a.segments?.map((s) => s.reps)).toEqual([3, 2]);
    expect(a.reps).toBe(3); // never 5
  });
});

describe("AI review scope follows the same segments", () => {
  it("a cut → only the longest one-person part is reviewed, inside its own window", () => {
    const { frames, starts } = clip([{ reps: 3, people: [person(1)] }, { reps: 1, people: [person(1)] }]);
    hardCut(frames, starts[1]);
    const d = aiReviewScope(frames);
    expect(d).toMatchObject({ window: { startMs: 0 } });
    expect("window" in d && d.window!.endMs).toBeLessThan(starts[1]);
  });

  it("partition never yields a frame inside a boundary span, and parts never overlap", () => {
    const { frames, starts } = clip([{ reps: 2 }, { reps: 2 }]);
    for (let t = starts[1]; t < starts[1] + 250; t += STEP) at(frames, t).scene = { ...quiet, span: 0.7, blend: 0.05 };
    const b = findBoundaries(frames);
    const parts = partition(frames, b);
    for (const p of parts) for (const f of p.frames) expect(b.some((x) => x.startMs < f.timestampMs && f.timestampMs < x.endMs)).toBe(false);
    for (let i = 1; i < parts.length; i += 1) expect(parts[i].startMs).toBeGreaterThan(parts[i - 1].endMs);
  });
});
