import { describe, expect, it } from "vitest";

import { analyzeFrameSequence, findTrackJumps } from "@/lib/setvision/analyze";
import type { TimedPoseFrame } from "@/lib/setvision/types";

const body = (t: number, x: number): TimedPoseFrame => ({
  timestampMs: t,
  frame: {
    left_shoulder: { x, y: 100, score: 0.9 },
    left_hip: { x, y: 200, score: 0.9 },
    right_hip: { x: x + 10, y: 200, score: 0.9 },
  },
});

describe("wrong-person guard (track jumps)", () => {
  it("flags a body teleporting > 1.5 torso lengths between close samples", () => {
    const frames = [body(0, 100), body(100, 104), body(200, 400), body(300, 402)];
    expect(findTrackJumps(frames)).toEqual([200]);
  });

  it("does not flag normal motion or a jump across a long tracking gap", () => {
    expect(findTrackJumps([body(0, 100), body(100, 130), body(200, 160)])).toEqual([]);
    expect(findTrackJumps([body(0, 100), body(1000, 400)])).toEqual([]);
  });

  it("abstains with no reps and a re-record instruction when the track jumps", () => {
    const result = analyzeFrameSequence([body(0, 100), body(100, 400)], { exercise: "squat" });
    expect(result.reps).toBe(0);
    expect(result.confidence).toBe(0);
    expect(result.abstainReason).toMatch(/0\.1 s.*Re-record with only you in view/);
    expect(result.limitations).toEqual([result.abstainReason]);
  });
});
