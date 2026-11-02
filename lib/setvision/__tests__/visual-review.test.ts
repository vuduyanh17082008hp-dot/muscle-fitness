import { describe, expect, it } from "vitest";

import { trackedFormObservations } from "@/lib/setvision/form-observations";
import { computeVelocity } from "@/lib/setvision/velocity";
import {
  athleteLensText,
  exerciseReference,
  gradeExerciseMatch,
  namesReferenceCheck,
  sanitizeVisualReview,
  visualReviewUserText,
} from "@/lib/setvision/visual-review";
import { subjectGate } from "@/lib/setvision/analyze";
import { findSceneCuts } from "@/lib/setvision/person-check";
import type { TimedPoseFrame } from "@/lib/setvision/types";
import type { CompletedRep, SetVisionAnalysis } from "@/lib/setvision/types";

const T = [500, 1500, 2500, 3500, 4500, 5500];
const reply = (over: Record<string, unknown> = {}) => ({
  people_in_view: "one",
  multi_person_frames: [],
  edited_or_composite: false,
  seen_movement: "a seated leg press",
  exercise_match: "matches",
  exercise_match_confidence: "high",
  match_frames: [1, 3],
  match_evidence: "Feet on a sled platform, back on the pad.",
  view: "side",
  assessable: "yes",
  missing: "",
  filming_tip: "",
  observations: [],
  ...over,
});
// The app's own catalogue entry (server-side lookup by key) — its checks are what a confirmed issue must name.
const LEG_PRESS = exerciseReference("catalogue:leg-press")!;
const ctx = { reference: LEG_PRESS };
const kneesIn = { kind: "issue", check: "Letting the knees cave inward.", frames: [2, 3], confidence: "high", what: "The knees move inward as the sled comes down.", cue: "Push the knees out in line with the toes." };

describe("sanitizeVisualReview — rules applied to the model's untrusted answer", () => {
  it("even a high-confidence, multi-frame issue on one of THIS exercise's checks is only 'possibly' (no validated AI precision), with OUR timestamps", () => {
    const r = sanitizeVisualReview([reply({ observations: [kneesIn] }), reply({ observations: [kneesIn] })], T, "Leg Press", ctx)!;
    expect(r.status).toBe("UNCERTAIN");
    expect(r.exerciseCheck).toBe("CONFIRMED_MATCH");
    expect(r.observations[0]).toMatchObject({ kind: "uncertain", atMs: [1500, 2500] });
  });

  it("never returns the model's camera-view claim (S3: a rear view was reported as 'side')", () => {
    const r = sanitizeVisualReview([reply({ view: "side" }), reply({ view: "side" })], T, "Leg Press", ctx)!;
    expect("view" in r).toBe(false);
  });

  it("an issue that names no reference check — or any issue when the app has no reference — is only 'possibly'", () => {
    const offList = sanitizeVisualReview(reply({ observations: [{ ...kneesIn, check: "Breathing rhythm" }] }), T, "Leg Press", ctx)!;
    expect(offList.observations[0].kind).toBe("uncertain");
    const noRef = sanitizeVisualReview(reply({ observations: [kneesIn] }), T, "Machine Triceps Extension", { reference: null })!;
    expect(noRef.observations[0].kind).toBe("uncertain");
    expect(noRef.limitation).toMatch(/no exercise reference for Machine Triceps Extension/);
  });

  it("a hedged (medium/low confidence) or single-frame issue is only UNCERTAIN", () => {
    expect(sanitizeVisualReview(reply({ observations: [{ ...kneesIn, confidence: "medium" }] }), T, "Leg Press", ctx)!.observations[0].kind).toBe("uncertain");
    const one = sanitizeVisualReview(reply({ observations: [{ ...kneesIn, frames: [4] }] }), T, "Leg Press", ctx)!;
    expect(one.status).toBe("UNCERTAIN");
    expect(one.observations[0].kind).toBe("uncertain");
  });

  it("AI praise is never shown, even when confident and multi-frame (it was confidently wrong on a labelled clip)", () => {
    const r = sanitizeVisualReview(
      reply({ observations: [{ kind: "positive", check: "", frames: [1, 2, 3, 4], confidence: "high", what: "Maintains a neutral spine.", cue: "" }, { ...kneesIn, confidence: "medium" }] }),
      T, "Leg Press", ctx,
    )!;
    expect(r.observations.map((o) => o.kind)).toEqual(["uncertain"]);
  });

  it("drops praise smuggled in as an observation (real S3 final phrasing), keeps real leads", () => {
    for (const what of ["The bar is pulled down in front of the upper chest, not behind the neck, which is correct.", "Good form throughout the set.", "The back position looks correct."]) {
      expect(sanitizeVisualReview(reply({ observations: [{ ...kneesIn, what }] }), T, "Leg Press", ctx)!.observations).toEqual([]);
    }
    expect(sanitizeVisualReview(reply({ observations: [kneesIn] }), T, "Leg Press", ctx)!.observations).toHaveLength(1);
  });

  it("drops injury-risk wording the stills can't support (real model phrasings, S3 eval)", () => {
    for (const what of ["The knees cave in, which can stress the joints.", "Deep knees increase joint stress.", "This is unsafe for the lower back.", "Puts stress on your knees."]) {
      expect(sanitizeVisualReview(reply({ observations: [{ ...kneesIn, what }] }), T, "Leg Press", ctx)!.observations).toEqual([]);
    }
  });

  it("drops numbers, medical claims and findings with invalid/no frames; nothing left + full scope = NO_SUPPORTED_ISSUE_OBSERVED", () => {
    const r = sanitizeVisualReview(
      reply({ observations: [
        { ...kneesIn, what: "Knee angle only reaches 70 degrees." },
        { ...kneesIn, what: "This puts you at risk of injury." },
        { ...kneesIn, frames: [9, 0] },
        { ...kneesIn, frames: [] },
        { ...kneesIn, what: "You did 8 reps." },
      ] }),
      T, "Leg Press", ctx,
    )!;
    expect(r.observations).toEqual([]);
    expect(r.status).toBe("NO_SUPPORTED_ISSUE_OBSERVED");
  });

  it("a split-screen / edited video, or more than one person (frame-cited) -> NOT_ASSESSABLE", () => {
    const composite = sanitizeVisualReview(reply({ edited_or_composite: true, observations: [kneesIn] }), T, "Leg Press", ctx)!;
    expect(composite).toMatchObject({ status: "NOT_ASSESSABLE", observations: [] });
    expect(sanitizeVisualReview(reply({ people_in_view: "more_than_one", multi_person_frames: [] }), T, "Leg Press", ctx)!.status).toBe("UNCERTAIN"); // claim without a frame
    const two = sanitizeVisualReview(reply({ people_in_view: "more_than_one", multi_person_frames: [3], observations: [kneesIn] }), T, "Leg Press", ctx)!;
    expect(two).toMatchObject({ status: "NOT_ASSESSABLE", observations: [] });
    expect(two.limitation).toMatch(/More than one person is visible \(2\.5 s\)/);
  });

  it("poor visibility -> NOT_ASSESSABLE with what is missing; unusable reply -> null", () => {
    const r = sanitizeVisualReview(reply({ assessable: "no", missing: "feet and knees are out of frame", filming_tip: "Step back." }), T, "Leg Press", ctx)!;
    expect(r).toMatchObject({ status: "NOT_ASSESSABLE", limitation: "feet and knees are out of frame", filmingTip: "Step back." });
    expect(sanitizeVisualReview("nope", T, "Leg Press")).toBeNull();
  });

  it("personalization uses only the athlete's own fields", () => {
    expect(athleteLensText({ experience: "beginner", goal: "build muscle", limitations: null })).toMatch(/plain words[\s\S]*build muscle/);
    expect(athleteLensText(null)).toMatch(/No athlete profile/);
  });
});

describe("exercise identity is graded, and a weak 'different' never rejects the user's exercise", () => {
  // Real case (CDC seated leg curl, front view, 3/3 runs): the model answered "a seated leg extension".
  const legCurl = { reference: exerciseReference("catalogue:seated-leg-curl") };
  const lookAlike = reply({ seen_movement: "a seated leg extension", exercise_match: "ambiguous", exercise_match_confidence: "medium", match_frames: [2], match_evidence: "", observations: [{ ...kneesIn, check: "Avoid using momentum." }] });

  it("grades: matches/high -> CONFIRMED_MATCH; likely or not-high -> POSSIBLE; ambiguous or uncited 'different' -> AMBIGUOUS; cited high 'different' -> CONFIRMED_MISMATCH", () => {
    expect(gradeExerciseMatch(reply(), 6)).toBe("CONFIRMED_MATCH");
    expect(gradeExerciseMatch(reply({ exercise_match_confidence: "medium" }), 6)).toBe("POSSIBLE_MATCH");
    expect(gradeExerciseMatch(reply({ exercise_match: "likely" }), 6)).toBe("POSSIBLE_MATCH");
    expect(gradeExerciseMatch(reply({ exercise_match: "ambiguous" }), 6)).toBe("AMBIGUOUS");
    expect(gradeExerciseMatch(reply({ exercise_match: "different", exercise_match_confidence: "medium" }), 6)).toBe("AMBIGUOUS");
    expect(gradeExerciseMatch(reply({ exercise_match: "different", match_frames: [2] }), 6)).toBe("AMBIGUOUS"); // one frame
    expect(gradeExerciseMatch(reply({ exercise_match: "different", match_evidence: "" }), 6)).toBe("AMBIGUOUS"); // no evidence
    expect(gradeExerciseMatch(reply({ exercise_match: "different", match_frames: [2, 9] }), 6)).toBe("AMBIGUOUS"); // a frame we never sent
    expect(gradeExerciseMatch(reply({ exercise_match: "different" }), 6)).toBe("CONFIRMED_MISMATCH");
  });

  it("ambiguous look-alike -> asks the user (findings withheld), not 'wrong exercise'", () => {
    const r = sanitizeVisualReview(lookAlike, T, "Seated Leg Curl", legCurl)!;
    expect(r).toMatchObject({ status: "UNCERTAIN", exerciseCheck: "AMBIGUOUS", needsConfirmation: true, observations: [] });
    expect(r.limitation).toMatch(/^You selected Seated Leg Curl. Similar exercises can look alike from this camera angle, and the video could also be a leg extension.*confirm/);
  });

  it("after the user confirms, an ambiguous identity becomes a possible match and the review proceeds", () => {
    const r = sanitizeVisualReview(lookAlike, T, "Seated Leg Curl", { ...legCurl, userConfirmed: true })!;
    expect(r).toMatchObject({ exerciseCheck: "POSSIBLE_MATCH", needsConfirmation: false });
    expect(r.limitation).toMatch(/You confirmed this is Seated Leg Curl/);
    expect(r.observations).toHaveLength(1);
  });

  it("a cited, high-confidence different exercise stays refused — the user's confirmation can't override it", () => {
    const wrong = reply({ seen_movement: "a machine chest press", exercise_match: "different", match_evidence: "Hands push handles forward at chest height.", observations: [kneesIn] });
    for (const userConfirmed of [false, true]) {
      const r = sanitizeVisualReview(wrong, T, "Seated Leg Curl", { ...legCurl, userConfirmed })!;
      expect(r).toMatchObject({ status: "NOT_ASSESSABLE", exerciseCheck: "CONFIRMED_MISMATCH", observations: [] });
      expect(r.limitation).toMatch(/looks like a machine chest press, not Seated Leg Curl \(Hands push handles/);
    }
  });

  it("confirmation never bypasses the person/composite checks", () => {
    const r = sanitizeVisualReview({ ...lookAlike, people_in_view: "more_than_one", multi_person_frames: [1] }, T, "Seated Leg Curl", { ...legCurl, userConfirmed: true })!;
    expect(r.status).toBe("NOT_ASSESSABLE");
  });

  it("look-alike pairs from the catalogue (same equipment): leg curl/extension, pulldown/row, chest/shoulder press, squat/hinge", () => {
    const names = (key: string) => exerciseReference(key)!.lookAlikes.map((l) => l.name);
    expect(names("catalogue:leg-extension")).toContain("Seated Leg Curl");
    expect(names("catalogue:seated-leg-curl")).toContain("Leg Extension");
    expect(names("catalogue:lat-pulldown")).toContain("Seated Cable Row");
    expect(names("catalogue:machine-chest-press")).toContain("Machine Shoulder Press");
    expect(names("catalogue:barbell-back-squat")).toContain("Romanian Deadlift");
    expect(names("catalogue:leg-press")).toEqual([]); // no machine hinge to confuse it with
    expect(exerciseReference("catalogue:leg-extension")!.lookAlikes[0].key).toBe("catalogue:seated-leg-curl");
  });
});

describe("contrast passes settle look-alikes (real S3 false acceptance: leg curl accepted as Leg Extension 3/3)", () => {
  const EXT = { reference: exerciseReference("catalogue:leg-extension") };
  const CURL = { reference: exerciseReference("catalogue:seated-leg-curl") };
  const legCurl = CURL;
  // Real replay (same 10 stills, 3/3 each): told "Leg Extension" the model said matches/high ("a seated knee
  // extension"); told "Seated Leg Curl" it ALSO said matches/high ("a seated leg curl").
  const saysExtension = reply({ seen_movement: "a seated knee extension on a machine", observations: [kneesIn] });
  const saysCurl = reply({ seen_movement: "a seated leg curl on a machine", match_evidence: "Pad behind the calves; knees bend." });
  const rejects = reply({ seen_movement: "a seated leg curl", exercise_match: "different", match_frames: [1, 3], match_evidence: "The pad presses behind the calves and the knees bend from straight." });

  it("the model accepts BOTH labels -> AMBIGUOUS either way (no confirmed identity, no findings, a filming tip)", () => {
    const ext = sanitizeVisualReview([saysExtension, saysExtension], T, "Leg Extension", { ...EXT, contrasts: [saysCurl] })!;
    expect(ext).toMatchObject({ status: "UNCERTAIN", exerciseCheck: "AMBIGUOUS", needsConfirmation: true, observations: [] });
    expect(ext.limitation).toMatch(/You selected Leg Extension..*could also be a seated leg curl — this recording doesn't show what tells them apart/);
    expect(ext.filmingTip).toMatch(/where it touches your body/);
    const curl = sanitizeVisualReview([saysCurl, saysCurl], T, "Seated Leg Curl", { ...CURL, contrasts: [saysExtension] })!;
    expect(curl).toMatchObject({ exerciseCheck: "AMBIGUOUS", needsConfirmation: true, observations: [] });
  });

  it("a missing, weak or uncited contrast rejects nothing -> AMBIGUOUS", () => {
    for (const contrasts of [undefined, [], [null], [reply({ exercise_match: "different", exercise_match_confidence: "medium" })], [reply({ exercise_match: "different", match_frames: [2] })], [reply({ exercise_match: "ambiguous" })]]) {
      expect(sanitizeVisualReview([saysExtension, saysExtension], T, "Leg Extension", { ...EXT, contrasts })!.exerciseCheck).toBe("AMBIGUOUS");
    }
  });

  it("the look-alike firmly rejected when named -> the selection's own grade stands (genuine footage is not refused)", () => {
    const r = sanitizeVisualReview([saysExtension, saysExtension], T, "Leg Extension", { ...EXT, contrasts: [reply({ exercise_match: "different", match_evidence: "Pad on the front of the shins; knees straighten." })] })!;
    expect(r.exerciseCheck).toBe("CONFIRMED_MATCH");
    expect(r.observations[0].kind).toBe("uncertain"); // its check ("knees cave inward") is not a Leg Extension check
  });

  it("selection firmly rejected -> refused with the LABELLED description; a contrast 'match' never names the exercise (it is anchored too)", () => {
    // Real S3 final: a chest press, with "Leg Extension" named in the contrast pass, came back "matches".
    for (const userConfirmed of [false, true]) {
      const r = sanitizeVisualReview([rejects, rejects], T, "Leg Extension", { ...EXT, userConfirmed, contrasts: [saysCurl] })!;
      expect(r).toMatchObject({ status: "NOT_ASSESSABLE", exerciseCheck: "CONFIRMED_MISMATCH", observations: [] });
      expect(r.limitation).toMatch(/looks like a seated leg curl, not Leg Extension \(The pad presses behind the calves/);
      expect(r.limitation).not.toMatch(/Pad behind the calves; knees bend/); // the contrast's own evidence is not used
    }
  });

  it("real false confirmations (both passes agreed) are shown only as 'possibly' (rear-view 'bar behind the neck', frames show it in front)", () => {
    const PULL = { reference: exerciseReference("catalogue:lat-pulldown") };
    const behind = { kind: "issue", check: "Avoid: Pulling the bar behind the neck.", frames: [4, 5], confidence: "high", what: "The bar is pulled behind the neck instead of in front of the chest.", cue: "Pull to the chest." };
    expect(namesReferenceCheck(behind.check, PULL.reference!)).toBe(true);
    const rejectRow = reply({ exercise_match: "different", match_evidence: "Vertical pull from overhead." });
    const r = sanitizeVisualReview([reply({ view: "side", observations: [behind] }), reply({ view: "side", observations: [behind] })], T, "Lat Pulldown", { ...PULL, contrasts: [rejectRow] })!;
    expect(r).toMatchObject({ status: "UNCERTAIN", exerciseCheck: "CONFIRMED_MATCH" });
    expect(r.observations.map((o) => o.kind)).toEqual(["uncertain"]);
  });

  it("a 'different' that names the selected exercise is a variation question -> AMBIGUOUS (confirmable), not refused", () => {
    const CALF = { reference: exerciseReference("catalogue:standing-calf-raise") };
    // Real S3 final reply on feet-only bodyweight toe lifts.
    const variation = reply({ seen_movement: "standing calf raise", exercise_match: "different", match_evidence: "Rising onto toes on a flat floor, not on a machine platform." });
    const r = sanitizeVisualReview([variation, variation], T, "Standing Calf Raise", { ...CALF, scope: "partial_body" })!;
    expect(r).toMatchObject({ exerciseCheck: "AMBIGUOUS", needsConfirmation: true, observations: [] });
    // A different movement is still refused.
    const other = reply({ seen_movement: "a seated leg press", exercise_match: "different", match_evidence: "Feet on a sled." });
    expect(sanitizeVisualReview([other, other], T, "Standing Calf Raise", CALF)!.exerciseCheck).toBe("CONFIRMED_MISMATCH");
  });

  it("a genuine ambiguity can be confirmed by the user; people/composite checks still win", () => {
    expect(sanitizeVisualReview([saysExtension, saysExtension], T, "Leg Extension", { ...EXT, userConfirmed: true })!.exerciseCheck).toBe("POSSIBLE_MATCH");
    const two = { ...saysExtension, people_in_view: "more_than_one", multi_person_frames: [2] };
    expect(sanitizeVisualReview([two, two], T, "Leg Extension", { ...EXT, userConfirmed: true })!.status).toBe("NOT_ASSESSABLE");
  });

  it("two passes agreeing on one of the exercise's checks only RANKS that lead first — at most two leads, never confirmed", () => {
    const weak = { ...kneesIn, check: "Breathing rhythm", what: "Breath held through the rep.", frames: [1, 2] };
    const agree = sanitizeVisualReview([reply({ observations: [weak, kneesIn] }), reply({ observations: [{ ...kneesIn, what: "Knees drift in at the bottom.", frames: [3, 4] }] })], T, "Leg Press", ctx)!;
    expect(agree.observations.map((o) => o.what)).toEqual([kneesIn.what, weak.what]);
    expect(agree.observations.every((o) => o.kind === "uncertain")).toBe(true);
    const oneOff = sanitizeVisualReview([reply({ observations: [kneesIn] }), reply()], T, "Leg Press", ctx)!;
    expect(oneOff.observations[0].kind).toBe("uncertain");
    expect(oneOff.status).toBe("UNCERTAIN");
    const otherCheck = sanitizeVisualReview([reply({ observations: [kneesIn] }), reply({ observations: [{ ...kneesIn, check: "Locking the knees out aggressively at the top." }] })], T, "Leg Press", ctx)!;
    expect(otherCheck.observations[0].kind).toBe("uncertain");
  });

  it("the more cautious pass wins on people and identity; a lone mismatch only makes it ambiguous", () => {
    expect(sanitizeVisualReview([reply(), reply({ people_in_view: "more_than_one", multi_person_frames: [2] })], T, "Leg Press", ctx)!.status).toBe("NOT_ASSESSABLE");
    expect(sanitizeVisualReview([reply(), reply({ edited_or_composite: true })], T, "Leg Press", ctx)!.status).toBe("NOT_ASSESSABLE");
    const split = sanitizeVisualReview([reply(), reply({ exercise_match: "different" })], T, "Leg Press", ctx)!;
    expect(split).toMatchObject({ exerciseCheck: "AMBIGUOUS", needsConfirmation: true });
    expect(sanitizeVisualReview([reply({ exercise_match: "different", seen_movement: "a hack squat" }), reply({ exercise_match: "different", seen_movement: "a hack squat" })], T, "Leg Press", ctx)!.exerciseCheck).toBe("CONFIRMED_MISMATCH");
  });

  it("hedged wording ('possibly', 'may', 'might') is never a confirmed issue — real S3 phrasing", () => {
    const hedged = { ...kneesIn, what: "The knees appear fully extended and possibly locked at the top." };
    const r = sanitizeVisualReview([reply({ observations: [hedged] }), reply({ observations: [hedged] })], T, "Leg Press", ctx)!;
    expect(r.observations[0].kind).toBe("uncertain");
  });

  it("limited scopes say so and never report 'no clear issue'", () => {
    for (const scope of ["camera_moved", "partial_body"] as const) {
      const r = sanitizeVisualReview(reply(), T, "Leg Press", { ...ctx, scope })!;
      expect(r.status).toBe("UNCERTAIN");
      expect(r.limitation).toMatch(/^Limited review/);
    }
  });

  it("the reference text sent to the model comes from the catalogue, with the user's confirmation and scope", () => {
    const text = visualReviewUserText("Seated Leg Curl", T, null, { ...legCurl, userConfirmed: true, scope: "camera_moved" });
    expect(text).toMatch(/CONFIRMED this is the exercise/);
    expect(text).toMatch(/Secure the thigh pad\./);
    expect(text).toMatch(/camera moves/);
    expect(namesReferenceCheck("knees caving inward", LEG_PRESS)).toBe(true);
    expect(namesReferenceCheck("grip width", LEG_PRESS)).toBe(false);
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
    expect(gate.verdict === "refuse" && gate.reason).toMatch(/cuts or fades to a different shot around 2\.0 s/);
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
