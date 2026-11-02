import { describe, expect, it } from "vitest";

import { aiReviewScope, subjectGate } from "@/lib/setvision/analyze";
import { blendResidual, classifySceneChanges } from "@/lib/setvision/person-check";
import { evenTimes, phaseTimes } from "@/lib/setvision/phase-frames";
import type { PoseFrame, TimedPoseFrame } from "@/lib/setvision/types";

const one = [{ id: 1, score: 0.6, visible: 17, cx: 100, cy: 150 }];
const athlete: PoseFrame = { left_shoulder: { x: 100, y: 100, score: 0.9 }, left_hip: { x: 100, y: 200, score: 0.9 } };
// 5 Hz scan frames; `span`/`blend` per sample as the browser scene meter reports them.
const scan = (n: number, scene: (i: number) => { span?: number | null; blend?: number | null } = () => ({}), people: (i: number) => typeof one | [] = () => one): TimedPoseFrame[] =>
  Array.from({ length: n }, (_, i) => ({
    timestampMs: i * 200,
    frame: people(i).length === 1 ? athlete : {},
    people: people(i),
    scene: { diff: i === 0 ? null : 1, luma: 90, span: 0.1, blend: 0.4, ...scene(i) },
  }));

describe("blend residual: a dissolve is a mix of two shots, motion is not", () => {
  const A = [0, 0, 100, 100, 50, 50];
  const B = [100, 100, 0, 0, 50, 200];
  it("an exact 40/60 cross-fade has ~0 residual", () => {
    const M = A.map((a, i) => 0.4 * a + 0.6 * B[i]);
    expect(blendResidual(A, M, B)).toBeLessThan(0.01);
  });
  it("a shifted picture (camera pan) is not a mix", () => {
    const M = [100, 0, 0, 100, 200, 50];
    expect(blendResidual(A, M, B)).toBeGreaterThan(0.2);
  });
});

describe("scene changes are classified, and only camera motion is spared for the AI review", () => {
  const spanRun = (blend: number) => scan(30, (i) => (i >= 10 && i <= 12 ? { span: 0.7, blend } : {}));

  it("a big 1 s change that is a mix of two shots is a dissolve (edit) → refused everywhere", () => {
    const frames = spanRun(0.05);
    expect(classifySceneChanges(frames)).toMatchObject({ dissolves: [1000], cameraMoves: [] });
    expect(subjectGate(frames).verdict).toBe("refuse");
    expect(aiReviewScope(frames)).toHaveProperty("refuse");
  });

  it("a big 1 s change that isn't a mix is camera motion → tracking refused, limited AI review allowed for one consistent person", () => {
    const frames = spanRun(0.4);
    expect(classifySceneChanges(frames)).toMatchObject({ dissolves: [], cameraMoves: [1000] });
    const gate = subjectGate(frames);
    expect(gate.verdict).toBe("camera_moved");
    expect(gate.verdict !== "ok" && gate.reason).toMatch(/camera moved or zoomed around 1\.0 s.*can't be tracked/);
    expect(aiReviewScope(frames)).toMatchObject({ scope: "camera_moved" });
  });

  it("old data without a blend measurement is treated as a dissolve (conservative)", () => {
    expect(classifySceneChanges(spanRun(null as unknown as number)).dissolves).toEqual([1000]);
  });

  it("camera motion with no person followed through the clip is refused, not reviewed", () => {
    const frames = scan(30, (i) => (i >= 10 && i <= 12 ? { span: 0.7, blend: 0.4 } : {}), () => []);
    expect(aiReviewScope(frames)).toHaveProperty("refuse");
  });

  it("no whole person found (e.g. feet-only calf raise) and no sign of anyone else → limited partial-body review", () => {
    expect(aiReviewScope(scan(30, () => ({}), () => []))).toMatchObject({ scope: "partial_body" });
  });

  it("two people anywhere still refuses, whatever the camera did", () => {
    const two = [...one, { id: 2, score: 0.5, visible: 15, cx: 600, cy: 150 }];
    const frames = scan(30, (i) => (i >= 10 && i <= 12 ? { span: 0.7, blend: 0.4 } : {}), () => two as unknown as typeof one);
    expect(aiReviewScope(frames)).toHaveProperty("refuse");
  });

  it("a steady clip with one person → full review", () => {
    expect(aiReviewScope(scan(30))).toMatchObject({ scope: "full" });
  });
});

describe("phase-aware stills: the review sees the ends of each rep", () => {
  // A knee that bends and straightens 3 times (period 3 s) while the rest of the body stays put.
  const reps = (n: number): TimedPoseFrame[] =>
    Array.from({ length: n }, (_, i) => {
      const t = i * 200;
      const bend = Math.sin((2 * Math.PI * t) / 3000);
      const p = (x: number, y: number) => ({ x, y, score: 0.9 });
      return {
        timestampMs: t,
        frame: {
          left_shoulder: p(100, 100), right_shoulder: p(140, 100), left_hip: p(100, 200), right_hip: p(140, 200),
          left_knee: p(100 + 60 * bend, 260), right_knee: p(140 + 60 * bend, 260), left_ankle: p(100, 320), right_ankle: p(140, 320),
        },
      };
    });

  it("picks the turning points (rep ends) and tops up evenly, within the 6–12 budget", () => {
    const frames = reps(46); // 9 s
    const { times, turningPoints } = phaseTimes(frames, 9000);
    expect(turningPoints).toBeGreaterThanOrEqual(5); // 3 periods → ~6 extremes
    expect(times.length).toBe(9);
    // every true extreme of sin (0.75 s + k·1.5 s) has a still within 0.2 s
    for (const ext of [750, 2250, 3750, 5250, 6750, 8250]) expect(times.some((t) => Math.abs(t - ext) <= 200)).toBe(true);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it("falls back to even spacing when too few frames carry a body", () => {
    const frames = reps(46).map((f, i) => (i % 3 === 0 ? f : { ...f, frame: {} }));
    expect(phaseTimes(frames, 9000)).toEqual({ times: evenTimes(9000), turningPoints: 0 });
  });
});
