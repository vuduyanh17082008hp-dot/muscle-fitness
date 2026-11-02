import { describe, expect, it } from "vitest";

import { trackedFormObservations } from "@/lib/setvision/form-observations";
import { computeVelocity } from "@/lib/setvision/velocity";
import { athleteLensText, sanitizeVisualReview } from "@/lib/setvision/visual-review";
import { subjectGate } from "@/lib/setvision/analyze";
import { findSceneCuts } from "@/lib/setvision/person-check";
import type { TimedPoseFrame } from "@/lib/setvision/types";
import type { CompletedRep, SetVisionAnalysis } from "@/lib/setvision/types";

const T = [500, 1500, 2500, 3500, 4500, 5500];
const reply = (over: Record<string, unknown> = {}) => ({
  people_in_view: "one",
  exercise_match: "matches",
  seen_movement: "a walking lunge",
  view: "side",
  assessable: "yes",
  missing: "",
  filming_tip: "",
  observations: [],
  ...over,
});

describe("sanitizeVisualReview — rules applied to the model's untrusted answer", () => {
  it("a high-confidence issue seen in ≥ 2 frames is OBSERVED_ISSUE, with OUR timestamps", () => {
    const r = sanitizeVisualReview(
      reply({ observations: [{ kind: "issue", frames: [2, 3], confidence: "high", what: "The front knee drifts inward as you lower.", cue: "Push the knee out over the toes." }] }),
      T,
      "Lunge",
    )!;
    expect(r.status).toBe("OBSERVED_ISSUE");
    expect(r.observations[0].atMs).toEqual([1500, 2500]);
  });

  it("a hedged (medium/low confidence) issue is only UNCERTAIN", () => {
    const r = sanitizeVisualReview(reply({ observations: [{ kind: "issue", frames: [2, 3], confidence: "medium", what: "Knees may cave in.", cue: "Knees out." }] }), T, "Leg Press")!;
    expect(r.status).toBe("UNCERTAIN");
    expect(r.observations[0].kind).toBe("uncertain");
  });

  it("AI praise is never shown, even when confident and multi-frame (it was confidently wrong on a labelled clip)", () => {
    const r = sanitizeVisualReview(
      reply({ observations: [
        { kind: "positive", frames: [1, 2, 3, 4], confidence: "high", what: "Maintains a neutral spine.", cue: "" },
        { kind: "issue", frames: [2, 3], confidence: "medium", what: "Knees may drift inward.", cue: "Push knees out." },
      ] }),
      T,
      "Leg Press",
    )!;
    expect(r.observations.map((o) => o.kind)).toEqual(["uncertain"]);
    expect(r.status).toBe("UNCERTAIN");
  });

  it("drops injury-risk wording the stills can't support (real model phrasings, S3 eval)", () => {
    const phrasings = ["The knees cave in, which can stress the joints.", "Deep knees increase joint stress.", "This is unsafe for the lower back.", "Puts stress on your knees."];
    for (const what of phrasings) {
      const r = sanitizeVisualReview(reply({ observations: [{ kind: "issue", frames: [1, 2], confidence: "high", what, cue: "Push knees out." }] }), T, "Leg Press")!;
      expect(r.observations).toEqual([]);
    }
  });

  it("a split-screen / edited video → NOT_ASSESSABLE, whatever else the model says", () => {
    const r = sanitizeVisualReview(reply({ edited_or_composite: true, observations: [{ kind: "issue", frames: [1, 2], confidence: "high", what: "x", cue: "y" }] }), T, "Squat")!;
    expect(r).toMatchObject({ status: "NOT_ASSESSABLE", observations: [] });
    expect(r.limitation).toMatch(/one continuous recording/);
  });

  it("a single-frame issue is only UNCERTAIN (one still is not a rep)", () => {
    const r = sanitizeVisualReview(reply({ observations: [{ kind: "issue", frames: [4], what: "Torso leans forward.", cue: "Stay tall." }] }), T, "Lunge")!;
    expect(r.status).toBe("UNCERTAIN");
    expect(r.observations[0].kind).toBe("uncertain");
  });

  it("drops numbers, medical claims and findings with invalid/no frames", () => {
    const r = sanitizeVisualReview(
      reply({
        observations: [
          { kind: "issue", frames: [1, 2], what: "Knee angle only reaches 70 degrees.", cue: "Go deeper." },
          { kind: "issue", frames: [1, 2], what: "This puts you at risk of injury.", cue: "Stop." },
          { kind: "issue", frames: [9, 0], what: "Hips rise first.", cue: "Lead with the chest." },
          { kind: "issue", frames: [], what: "Back rounds.", cue: "Brace." },
          { kind: "issue", frames: [1, 2], what: "You did 8 reps.", cue: "" },
        ],
      }),
      T,
      "Leg Press",
    )!;
    expect(r.observations).toEqual([]);
    expect(r.status).toBe("NO_SUPPORTED_ISSUE_OBSERVED");
  });

  it("more than one person → NOT_ASSESSABLE, findings discarded", () => {
    expect(sanitizeVisualReview(reply({ people_in_view: "more_than_one", multi_person_frames: [] }), T, "Lunge")!.status).toBe("UNCERTAIN"); // claim without a frame
    const r = sanitizeVisualReview(reply({ people_in_view: "more_than_one", multi_person_frames: [3], observations: [{ kind: "issue", frames: [1, 2], what: "x", cue: "y" }] }), T, "Lunge")!;
    expect(r.status).toBe("NOT_ASSESSABLE");
    expect(r.observations).toEqual([]);
    expect(r.limitation).toMatch(/More than one person is visible \(2\.5 s\)/);
  });

  it("a different exercise → NOT_ASSESSABLE asking to check the selection", () => {
    const r = sanitizeVisualReview(reply({ exercise_match: "different", seen_movement: "a biceps curl" }), T, "Seated Leg Curl")!;
    expect(r.status).toBe("NOT_ASSESSABLE");
    expect(r.limitation).toMatch(/looks like a biceps curl, not Seated Leg Curl/);
  });

  it("poor visibility → NOT_ASSESSABLE with what is missing", () => {
    const r = sanitizeVisualReview(reply({ assessable: "no", missing: "feet and knees are out of frame", filming_tip: "Step back." }), T, "Bulgarian Split Squat")!;
    expect(r).toMatchObject({ status: "NOT_ASSESSABLE", limitation: "feet and knees are out of frame", filmingTip: "Step back." });
  });

  it("nothing usable → null", () => {
    expect(sanitizeVisualReview("nope", T, "Lunge")).toBeNull();
  });

  it("personalization uses only the athlete's own fields", () => {
    expect(athleteLensText({ experience: "beginner", goal: "build muscle", limitations: null })).toMatch(/plain words[\s\S]*build muscle/);
    expect(athleteLensText(null)).toMatch(/No athlete profile/);
  });
});

describe("velocity loss is (first − final) ÷ first, not peak-based (screenshot 1.607 / 1.382 / 7 %)", () => {
  const rep = (n: number, seconds: number): CompletedRep => ({
    repNumber: n, topAtMs: 0, startObserved: true, bottomAtMs: 0, ascentStartAtMs: 0, ascentEndAtMs: seconds * 1000,
    minAngleDeg: 80, maxAngleDeg: 170, bottomBarProxy: null, bottomFrame: null, deepestFrame: null,
    barProxyTrack: [{ timestampMs: 0, landmark: { x: 0, y: 0, score: 1 } }, { timestampMs: seconds * 1000, landmark: { x: 0, y: 100, score: 1 } }],
  });
  it("peak (1.607) is not the first rep; loss uses the first rep (≈1.486)", () => {
    // torso 100 px, path 100 px → speed = 1 / seconds
    const v = computeVelocity([rep(1, 1 / 1.486), rep(2, 1 / 1.607), rep(3, 1 / 1.382)], 100);
    expect(v.peak).toBeCloseTo(1.607, 2);
    expect(v.perRep[0].meanSpeed).toBeCloseTo(1.486, 2);
    expect(v.velocityLoss).toBeCloseTo(0.07, 2);
    expect(((v.peak! - v.final!) / v.peak!)).toBeCloseTo(0.14, 2); // why "first 1.607" looked like 14 %
  });
});

describe("tracked form observations", () => {
  const base = (over: Partial<SetVisionAnalysis>): SetVisionAnalysis => ({
    exercise: "squat",
    exerciseClassification: { exercise: "squat", confidence: null, signals: [] },
    reps: 4, romConsistency: 0.9, averageEccentricTime: 1, averageConcentricTime: 1,
    velocity: { calibrated: false, unit: "torso-lengths/s", perRep: [], mean: null, peak: null, final: null, velocityLoss: null },
    technique: { romConsistency: 0.9, tempoConsistency: 0.9, barPathConsistency: null, asymmetryDeg: null },
    confidence: 0.8,
    perRep: {
      rom: [1, 2, 3, 4].map((n) => ({ repNumber: n, rangeDeg: 90, romPercent: 100 })),
      tempo: [1, 2, 3, 4].map((n) => ({ repNumber: n, eccentricSec: 1, pauseSec: 0, concentricSec: 1, descentStartMs: n * 2000, bottomReachedMs: n * 2000 + 900, ascentStartMs: n * 2000 + 1000, repEndMs: n * 2000 + 1900 })),
    },
    limitations: [], abstainReason: null, events: [],
    ...over,
  });

  it("a shallow rep is an OBSERVED_ISSUE pointing at that rep's bottom", () => {
    const rom = [90, 92, 60, 91].map((d, i) => ({ repNumber: i + 1, rangeDeg: d, romPercent: 100 }));
    const f = trackedFormObservations(base({ perRep: { ...base({}).perRep, rom } }));
    expect(f.status).toBe("OBSERVED_ISSUE");
    expect(f.observations[0].what).toMatch(/Rep 3 had clearly less knee angle range/);
    expect(f.observations[0].atMs).toEqual([6900]);
  });

  it("partial movements are reported with their times; one before the first rep is setup, not an issue", () => {
    const f = trackedFormObservations(base({ events: [{ kind: "partial", startMs: 9000, endMs: 9800 }] }));
    expect(f.status).toBe("OBSERVED_ISSUE");
    expect(f.observations[0].atMs).toEqual([9000]);
    expect(trackedFormObservations(base({ events: [{ kind: "partial", startMs: 1300, endMs: 1800 }] })).status).toBe("NO_SUPPORTED_ISSUE_OBSERVED");
  });

  it("front view (no measured range): partial movements are only 'possibly', never a confirmed issue", () => {
    // Real kb-goblet clip 2026-11-03: two full-depth goblet squats filmed head-on; projection noise split each
    // descent into a "partial" + a rep. Depth isn't measurable from that view, so no confirmed finding.
    const f = trackedFormObservations(base({ reps: 2, perRep: { rom: [], tempo: base({}).perRep.tempo.slice(0, 2) }, events: [{ kind: "partial", startMs: 8300, endMs: 9100 }, { kind: "partial", startMs: 12300, endMs: 13300 }] }));
    expect(f.status).toBe("UNCERTAIN");
    expect(f.observations.map((o) => o.kind)).toEqual(["uncertain"]);
    expect(f.observations[0].what).toMatch(/depth can't be measured/);
  });

  it("consistent set → NO_SUPPORTED_ISSUE_OBSERVED + one positive, never 'perfect'", () => {
    const f = trackedFormObservations(base({}));
    expect(f.status).toBe("NO_SUPPORTED_ISSUE_OBSERVED");
    expect(f.observations).toHaveLength(1);
    expect(f.note).toMatch(/doesn't check everything/);
  });

  it("no range from this view → UNCERTAIN; abstained → NOT_ASSESSABLE", () => {
    expect(trackedFormObservations(base({ perRep: { rom: [], tempo: base({}).perRep.tempo } })).status).toBe("UNCERTAIN");
    expect(trackedFormObservations(base({ reps: 0, abstainReason: "More than one person" })).status).toBe("NOT_ASSESSABLE");
  });
});

describe("scene cuts + shared subject gate (thresholds calibrated on real clips 2026-11-02)", () => {
  const athlete = { left_shoulder: { x: 100, y: 100, score: 0.9 }, left_hip: { x: 100, y: 200, score: 0.9 } };
  const one = [{ id: 1, score: 0.6, visible: 17, cx: 100, cy: 150 }];
  // diffs: series of per-sample scene changes at 10 Hz
  const clip = (diffs: number[], luma = 90): TimedPoseFrame[] =>
    diffs.map((d, i) => ({ timestampMs: i * 100, frame: athlete, people: one, scene: { diff: i === 0 ? null : d, luma } }));

  it("swap.mp4-like hard cut (84 against ~0.2) is a cut; the gate refuses with its time", () => {
    const diffs = Array.from({ length: 40 }, (_, i) => (i === 20 ? 84.1 : 0.2));
    expect(findSceneCuts(clip(diffs))).toEqual([2000]);
    const gate = subjectGate(clip(diffs));
    expect("reason" in gate && gate.reason).toMatch(/different shot or view around 2\.0 s/);
  });

  it("single takes (≤ 5.4) and a hand-held camera (sustained 20–46) are not cuts", () => {
    expect(findSceneCuts(clip(Array.from({ length: 40 }, (_, i) => (i % 7 === 0 ? 5.4 : 0.3))))).toEqual([]);
    expect(findSceneCuts(clip(Array.from({ length: 40 }, (_, i) => 20 + ((i * 13) % 27))))).toEqual([]);
  });

  it("a cross-dissolve (small per-frame change, most of the picture replaced within 1 s) is a transition", () => {
    const frames = clip(Array(40).fill(15)); // halfsquat-like: 13–22 per frame, never a spike
    frames.forEach((f, i) => (f.scene!.span = i >= 25 && i <= 30 ? 0.61 : 0.1));
    expect(findSceneCuts(frames)).toEqual([1500]);
    const still = clip(Array(40).fill(0.3));
    still.forEach((f) => (f.scene!.span = 0.36)); // split-screen composite / moving body: below the line
    expect(findSceneCuts(still)).toEqual([]);
  });

  it("a cut to or from black is left to the identity check, not called a cut", () => {
    const frames = clip(Array.from({ length: 30 }, (_, i) => (i === 10 ? 54 : 0.2)));
    frames[9].scene!.luma = 3;
    expect(findSceneCuts(frames)).toEqual([]);
  });

  it("two people (split screen detected by MultiPose) → refused; one person throughout → passes with the residual limitation", () => {
    const two = clip(Array(20).fill(0.3)).map((f) => ({ ...f, people: [...one, { id: 2, score: 0.5, visible: 15, cx: 600, cy: 150 }] }));
    const refused = subjectGate(two);
    expect("reason" in refused && refused.reason).toMatch(/More than one person/);
    const ok = subjectGate(clip(Array(20).fill(0.3)));
    expect("limitations" in ok && ok.limitations[0]).toMatch(/can still go undetected/);
  });
});
