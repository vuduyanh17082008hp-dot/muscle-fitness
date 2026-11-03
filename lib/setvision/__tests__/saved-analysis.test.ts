import { describe, expect, it } from "vitest";

import { analyzeFrameSequence } from "@/lib/setvision/analyze";
import { resolveIdentity, restoreSavedAnalysis, saveRequestSchema, type SavedAnalysisRow } from "@/lib/setvision/saved-analysis";
import { buildRepSequence, squatFrame } from "@/lib/setvision/__tests__/fixtures";
import type { SetVisionAnalysis } from "@/lib/setvision/types";

const frames = buildRepSequence(squatFrame, 3, { frameIntervalMs: 100 });
const durationMs = frames.at(-1)!.timestampMs + 100;
const analysis = analyzeFrameSequence(frames, { exercise: "squat" });

const body = (a: SetVisionAnalysis = analysis, extra: Record<string, unknown> = {}) => ({
  analysis: a,
  videoDurationMs: durationMs,
  exerciseKey: "setvision:squat",
  exerciseSource: "setvision",
  ...extra,
});

/** Mutates a deep copy of the analysis' first tempo entry. */
function withTempo(patch: Record<string, unknown>): SetVisionAnalysis {
  const copy = structuredClone(analysis);
  Object.assign(copy.perRep.tempo[0], patch);
  return copy;
}

const issues = (input: unknown) => {
  const r = saveRequestSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe("SetVision save validation", () => {
  it("accepts a real analysis and keeps every timeline boundary (nothing stripped)", () => {
    expect(analysis.reps).toBe(3);
    const parsed = saveRequestSchema.parse(JSON.parse(JSON.stringify(body())));
    expect(parsed.analysis!.perRep).toEqual(analysis.perRep);
    for (const t of parsed.analysis!.perRep.tempo) {
      expect(t.descentStartMs).not.toBeNull();
      expect(t.bottomReachedMs).not.toBeNull();
      expect(typeof t.ascentStartMs).toBe("number");
      expect(typeof t.repEndMs).toBe("number");
    }
  });

  it("rejects a client that omits the timeline instead of saving it without one", () => {
    const stripped = structuredClone(analysis);
    stripped.perRep.tempo = stripped.perRep.tempo.map(({ repNumber, eccentricSec, pauseSec, concentricSec }) => ({ repNumber, eccentricSec, pauseSec, concentricSec })) as never;
    expect(saveRequestSchema.safeParse(body(stripped)).success).toBe(false);
    expect(saveRequestSchema.safeParse({ ...body(), videoDurationMs: undefined }).success).toBe(false);
  });

  it("accepts a negative velocity loss (final rep faster — seen on a real side-view squat) within the column's range", () => {
    const faster = (velocityLoss: number) => body({ ...analysis, velocity: { ...analysis.velocity, velocityLoss } });
    expect(issues(faster(-0.25))).toEqual([]);
    expect(issues(faster(-20))).not.toEqual([]);
    expect(issues(faster(1.2))).not.toEqual([]);
  });

  it("rejects non-finite, negative and out-of-range values", () => {
    expect(issues(body(withTempo({ ascentStartMs: Number.POSITIVE_INFINITY })))).not.toEqual([]);
    expect(issues(body(withTempo({ concentricSec: Number.NaN })))).not.toEqual([]);
    expect(issues(body(withTempo({ descentStartMs: -100 })))).not.toEqual([]);
    expect(issues(body({ ...analysis, confidence: 1.5 }))).not.toEqual([]);
    expect(issues(body({ ...analysis, perRep: { ...analysis.perRep, rom: [{ repNumber: 1, rangeDeg: 400, romPercent: 10 }] } }))).not.toEqual([]);
  });

  it("rejects timelines that are out of order, inconsistent, overlapping or past the video's end", () => {
    const [r1, r2] = analysis.perRep.tempo;
    expect(issues(body(withTempo({ bottomReachedMs: r1.repEndMs! + 50 })))).toEqual(expect.arrayContaining([expect.stringMatching(/out of order/)]));
    expect(issues(body(withTempo({ concentricSec: r1.concentricSec! + 1 })))).toEqual(expect.arrayContaining([expect.stringMatching(/concentric duration/)]));
    expect(issues(body(withTempo({ eccentricSec: null })))).toEqual(expect.arrayContaining([expect.stringMatching(/all present or all null/)]));
    expect(issues(body(withTempo({ repEndMs: r2.descentStartMs! + 10, concentricSec: (r2.descentStartMs! + 10 - r1.ascentStartMs!) / 1000 })))).toEqual(
      expect.arrayContaining([expect.stringMatching(/overlaps the next rep/)]),
    );
    expect(issues({ ...body(), videoDurationMs: 1000 })).toEqual(expect.arrayContaining([expect.stringMatching(/past the end/)]));
    expect(issues(body({ ...analysis, reps: 4 }))).toEqual(expect.arrayContaining([expect.stringMatching(/does not match/)]));
  });

  it("only accepts an analysis for the exercise whose engine produced it", () => {
    expect(issues(body(analysis, { exerciseKey: "catalogue:barbell-bench-press", exerciseSource: "catalogue" }))).toEqual(["The exercise does not match the analysis."]);
    expect(issues(body(analysis, { exerciseKey: "catalogue:leg-press", exerciseSource: "catalogue" }))).toEqual(["The exercise does not match the analysis."]);
    expect(issues(body(analysis, { exerciseKey: "custom:my press" }))).toEqual(["Unknown exercise."]);
    expect(issues(body(analysis, { exerciseKey: "setvision:deadlift" }))).toEqual(["The exercise does not match the analysis."]);
    expect(issues(body(analysis, { exerciseKey: "catalogue:barbell-back-squat", exerciseSource: "setvision" }))).toEqual([
      "The exercise source does not match the option.",
    ]);
    expect(issues(body(analysis, { exerciseKey: "catalogue:barbell-back-squat", exerciseSource: "catalogue" }))).toEqual([]);
    expect(issues(body(analysis, { exerciseSource: "custom" }))).not.toEqual([]);
  });
});

const row = (perRep: unknown, extra: Partial<SavedAnalysisRow> = {}): SavedAnalysisRow => ({
  id: "00000000-0000-4000-8000-000000000001",
  exercise: "squat",
  reps: 3,
  rom_consistency: 0.9,
  tempo_consistency: 0.8,
  bar_path_consistency: null,
  asymmetry_deg: null,
  average_eccentric_time_sec: 1,
  average_concentric_time_sec: 1,
  velocity_calibrated: false,
  velocity_unit: "torso-lengths/s",
  velocity_mean: 0.5,
  velocity_peak: 0.6,
  velocity_final: 0.4,
  velocity_loss: 0.3,
  exercise_classification_confidence: null,
  confidence: 0.8,
  limitations: ["a note"],
  per_rep: perRep,
  video_storage_path: null,
  analyzed_at: "2026-11-01T00:00:00Z",
  workout_session_id: null,
  session_exercise_id: null,
  ...extra,
});

describe("SetVision restore (read-back)", () => {
  it("restores a new save with its full timeline and server-resolved identity", () => {
    const stored = JSON.parse(JSON.stringify({ ...analysis.perRep, videoDurationMs: durationMs, identity: { key: "setvision:squat", label: "Squat", source: "setvision", catalogueId: null } }));
    const restored = restoreSavedAnalysis(row(stored))!;
    expect(restored.timelineRecorded).toBe(true);
    expect(restored.analysis!.perRep.tempo).toEqual(analysis.perRep.tempo);
    expect(restored.analysis!.perRep.rom).toEqual(analysis.perRep.rom);
    expect(restored.identity).toEqual({ key: "setvision:squat", label: "Squat", source: "setvision", catalogueId: null });
  });

  it("restores historical rows (stripped timeline, % only ROM, null per_rep) without inventing values", () => {
    const legacy = restoreSavedAnalysis(
      row({ rom: [{ repNumber: 1, romPercent: 182 }], tempo: [{ repNumber: 1, eccentricSec: 1.2, pauseSec: 0.3, concentricSec: 1.1 }] }, { reps: 1, confidence: "0.770" as never }),
    )!;
    expect(legacy.timelineRecorded).toBe(false);
    expect(legacy.analysis!.perRep.tempo[0]).toEqual({
      repNumber: 1, eccentricSec: 1.2, pauseSec: 0.3, concentricSec: 1.1,
      descentStartMs: null, bottomReachedMs: null, ascentStartMs: null, repEndMs: null,
    });
    expect(legacy.analysis!.perRep.rom).toEqual([]); // a bare % of an uncalibrated reference is not shown
    expect(legacy.analysis!.confidence).toBe(0.77); // numeric strings from Postgres are read as numbers
    expect(legacy.identity).toBeNull();

    const empty = restoreSavedAnalysis(row(null, { reps: 0 }))!;
    expect(empty.analysis!.perRep).toEqual({ rom: [], tempo: [] });
    expect(empty.timelineRecorded).toBe(true);
  });

  it("does not trust a stored identity that no longer resolves to this engine", () => {
    expect(restoreSavedAnalysis(row({ identity: { key: "setvision:deadlift", label: "Deadlift", source: "setvision" } }))!.identity).toBeNull();
    expect(restoreSavedAnalysis(row({ identity: { key: "catalogue:gone", label: "Fake", source: "catalogue" } }))!.identity).toBeNull();
    expect(restoreSavedAnalysis(row({}, { exercise: "kettlebell_swing" }))).toBeNull();
  });
});

describe("manual reviews, custom exercises and the user's corrections", () => {
  const manual = (extra: Record<string, unknown>) => ({ analysis: null, videoDurationMs: 30_000, review: { rejectedReps: [], manualReps: [{ startMs: 1000, endMs: 3000 }], notes: "", unsure: false }, ...extra });

  it("saves a custom exercise as a manual review, with the server-validated name and no catalogue entry", () => {
    const parsed = saveRequestSchema.parse(manual({ exerciseKey: null, exerciseSource: "custom", customLabel: "  Đẩy   ngực máy " }));
    expect(resolveIdentity(parsed)).toEqual({ key: null, label: "Đẩy ngực máy", source: "custom", catalogueId: null });
  });

  it("rejects a custom exercise with a bad name, an option key, or an engine analysis", () => {
    expect(issues(manual({ exerciseKey: null, exerciseSource: "custom", customLabel: "  " }))).toEqual(["Enter an exercise name."]);
    expect(issues(manual({ exerciseKey: null, exerciseSource: "custom", customLabel: "Press‮evil" }))).not.toEqual([]);
    expect(issues(manual({ exerciseKey: "setvision:squat", exerciseSource: "custom", customLabel: "My squat" }))).toEqual(["A custom exercise has no option key."]);
    expect(issues({ ...body(), exerciseKey: null, exerciseSource: "custom", customLabel: "My squat" })).toEqual(["SetVision has no engine for a custom exercise."]);
    expect(issues(manual({ exerciseKey: "catalogue:leg-press", exerciseSource: "catalogue", customLabel: "x" }))).toEqual(["Only a custom exercise has a typed name."]);
  });

  it("saves a manual review of a catalogue exercise without an engine, but never a confirmed suggestion without its analysis", () => {
    expect(issues(manual({ exerciseKey: "catalogue:leg-press", exerciseSource: "catalogue" }))).toEqual([]);
    expect(issues(manual({ exerciseKey: "catalogue:leg-press", exerciseSource: "auto_suggestion" }))).toEqual(["A confirmed suggestion is saved with its analysis."]);
    expect(issues(manual({ exerciseKey: "catalogue:not-real", exerciseSource: "catalogue" }))).toEqual(["Unknown exercise."]);
  });

  it("validates the review against the automated reps and the video", () => {
    const review = (r: Record<string, unknown>) => body(analysis, { review: { rejectedReps: [], manualReps: [], notes: "", unsure: false, ...r } });
    expect(issues(review({ rejectedReps: [2], manualReps: [{ startMs: 100, endMs: 900 }], notes: "felt slow", unsure: true }))).toEqual([]);
    expect(issues(review({ rejectedReps: [4] }))).toEqual(["rejected reps must be distinct automated rep numbers"]);
    expect(issues(review({ rejectedReps: [1, 1] }))).toEqual(["rejected reps must be distinct automated rep numbers"]);
    expect(issues(review({ manualReps: [{ startMs: 900, endMs: 100 }] }))).toEqual(["a marked rep must end after it starts, within the video"]);
    expect(issues(review({ manualReps: [{ startMs: 100, endMs: durationMs + 5000 }] }))).not.toEqual([]);
    expect(issues(review({ notes: "x".repeat(1001) }))).not.toEqual([]);
    expect(issues(manual({ exerciseKey: "catalogue:leg-press", exerciseSource: "catalogue", review: { rejectedReps: [1], manualReps: [], notes: "", unsure: false } }))).toEqual([
      "rejected reps must be distinct automated rep numbers",
    ]);
  });

  it("restores a manual review with its custom name and the user's marked reps — no metrics invented", () => {
    const restored = restoreSavedAnalysis(
      row(
        { videoDurationMs: 30_000, identity: { key: null, label: "Đẩy ngực máy", source: "custom", catalogueId: null }, review: { rejectedReps: [], manualReps: [{ startMs: 1000, endMs: 3000 }], notes: "8 kg", unsure: true } },
        { exercise: "manual_review", reps: null, confidence: null },
      ),
    )!;
    expect(restored.analysis).toBeNull();
    expect(restored.identity).toEqual({ key: null, label: "Đẩy ngực máy", source: "custom", catalogueId: null });
    expect(restored.review).toEqual({ rejectedReps: [], manualReps: [{ startMs: 1000, endMs: 3000 }], notes: "8 kg", unsure: true });
  });

  it("does not trust a tampered custom name, and keeps automated and user reps apart on read-back", () => {
    expect(restoreSavedAnalysis(row({ identity: { key: null, label: "Bad\u0000", source: "custom" } }, { exercise: "manual_review", reps: null }))!.identity).toBeNull();
    // A custom identity on an engine row is not a valid combination.
    expect(restoreSavedAnalysis(row({ identity: { key: null, label: "Squat-ish", source: "custom" } }))!.identity).toBeNull();
    const withReview = restoreSavedAnalysis(row({ ...analysis.perRep, review: { rejectedReps: [2, 9], manualReps: [], notes: "", unsure: false } }))!;
    expect(withReview.review.rejectedReps).toEqual([2]); // 9 is not an automated rep of this row
    expect(withReview.analysis!.reps).toBe(3);
  });

  it("validates a pull engine's timeline with its own phase direction (pulling = concentric)", () => {
    const pull = structuredClone(analysis);
    pull.exercise = "vertical_pull";
    // Re-label the squat timeline as a pull: outbound (descent) becomes concentric.
    pull.perRep.tempo = pull.perRep.tempo.map((t) => ({ ...t, eccentricSec: t.concentricSec, concentricSec: t.eccentricSec }));
    expect(issues(body(pull, { exerciseKey: "catalogue:lat-pulldown", exerciseSource: "catalogue" }))).toEqual([]);
    const swapped = structuredClone(pull);
    swapped.perRep.tempo[0].concentricSec = swapped.perRep.tempo[0].concentricSec! + 1;
    expect(issues(body(swapped, { exerciseKey: "catalogue:lat-pulldown", exerciseSource: "catalogue" }))).toEqual(
      expect.arrayContaining([expect.stringMatching(/concentric duration disagrees/)]),
    );
  });
});
