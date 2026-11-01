import { z } from "zod";

import { getExerciseConfig } from "@/lib/setvision/exercise-config";
import { findExerciseOption, validateCustomExerciseName, type SavedExerciseIdentity } from "@/lib/setvision/exercise-selection";
import { MANUAL_REVIEW_EXERCISE, SETVISION_EXERCISES } from "@/lib/setvision/types";
import { MIN_VELOCITY_LOSS } from "@/lib/setvision/velocity";
import type { MovementEvent, RepRom, RepTempo, SetVisionAnalysis, SetVisionExerciseId } from "@/lib/setvision/types";

/**
 * Save / restore contract for setvision_analyses.
 *
 * One row is either an ANALYSED set (an engine ran: `analysis` is set) or a
 * MANUAL REVIEW (no engine — custom exercises and exercises SetVision has no
 * model for: exercise = 'manual_review', reps/confidence NULL). Both carry
 * the user's review: automated reps they rejected, reps they marked by hand,
 * notes and an "unsure" flag — always stored apart from what the engine
 * found, so provenance survives the round trip.
 *
 * per_rep (jsonb) carries the per-rep detail AND the evidence needed to
 * trust it on read-back: the rep timeline boundaries, the video duration
 * they were checked against, the exercise identity the server resolved and
 * the review. A save that would drop any of that is rejected, never
 * silently stripped.
 */
// ponytail: identity, review and duration ride in per_rep jsonb; promote to columns once queried across rows.

/** Longest clip a save accepts (the storage bucket caps files at 500 MB anyway). */
export const MAX_VIDEO_DURATION_MS = 2 * 60 * 60 * 1000;
/** Sampling-grid slack between the decoded duration and the last sampled timestamp. */
const DURATION_TOLERANCE_MS = 100;
/** Phase durations are rounded to 0.01 s; anything further from its own boundaries is inconsistent. */
const DURATION_ROUNDING_SEC = 0.011;
const MAX_REPS = 200;
export const REVIEW_NOTES_MAX_LENGTH = 1000;

const finite = z.number().finite();
const nonNegative = finite.min(0);
const unit = finite.min(0).max(1);
const timestamp = finite.min(0).max(MAX_VIDEO_DURATION_MS);
const text = z.string().max(600);
/** numeric(5,2) columns hold < 1000 s. */
const seconds = finite.min(0).max(999.99);
const engineEnum = z.enum(SETVISION_EXERCISES as [SetVisionExerciseId, ...SetVisionExerciseId[]]);

const tempoSchema = z.object({
  repNumber: z.number().int().min(1),
  eccentricSec: nonNegative.nullable(),
  pauseSec: nonNegative.nullable(),
  concentricSec: nonNegative.nullable(),
  descentStartMs: timestamp.nullable(),
  bottomReachedMs: timestamp.nullable(),
  ascentStartMs: timestamp,
  repEndMs: timestamp,
});

const romSchema = z.object({
  repNumber: z.number().int().min(1),
  rangeDeg: finite.gt(0).max(180),
  romPercent: nonNegative,
});

const eventSchema = z.object({ kind: z.enum(["partial", "uncertain", "excluded"]), startMs: timestamp, endMs: timestamp });

export const analysisSchema = z.object({
  exercise: engineEnum,
  exerciseClassification: z.object({
    exercise: engineEnum.nullable(),
    confidence: unit.nullable(),
    signals: z.array(text).max(20),
    candidates: z.array(engineEnum).max(SETVISION_EXERCISES.length).optional(),
  }),
  reps: z.number().int().min(0).max(MAX_REPS),
  romConsistency: unit.nullable(),
  averageEccentricTime: seconds.nullable(),
  averageConcentricTime: seconds.nullable(),
  velocity: z.object({
    calibrated: z.boolean(),
    unit: z.enum(["m/s", "torso-lengths/s"]),
    perRep: z.array(z.object({ repNumber: z.number().int().min(1), meanSpeed: nonNegative })).max(MAX_REPS),
    mean: nonNegative.nullable(),
    peak: nonNegative.nullable(),
    final: nonNegative.nullable(),
    // Negative = the final rep was faster than the first (real clips do this). Bounds = the numeric(4,3) column.
    velocityLoss: finite.min(MIN_VELOCITY_LOSS).max(1).nullable(),
  }),
  technique: z.object({
    romConsistency: unit.nullable(),
    tempoConsistency: unit.nullable(),
    barPathConsistency: unit.nullable(),
    asymmetryDeg: finite.min(0).max(180).nullable(),
  }),
  confidence: unit,
  perRep: z.object({
    rom: z.array(romSchema).max(MAX_REPS),
    tempo: z.array(tempoSchema).max(MAX_REPS),
  }),
  limitations: z.array(text).max(50),
  abstainReason: text.nullable().optional(),
  measuredSide: z.enum(["left", "right"]).nullable().optional(),
  events: z.array(eventSchema).max(MAX_REPS).optional(),
});

/** The user's own review of the set — never mixed into the engine's numbers. */
export const reviewSchema = z.object({
  /** Automated rep numbers the user says are not reps (kept, with provenance, not deleted). */
  rejectedReps: z.array(z.number().int().min(1).max(MAX_REPS)).max(MAX_REPS),
  /** Reps the user marked on the video themselves. */
  manualReps: z.array(z.object({ startMs: timestamp, endMs: timestamp })).max(MAX_REPS),
  notes: z.string().max(REVIEW_NOTES_MAX_LENGTH),
  /** The user is not sure about this count. */
  unsure: z.boolean(),
});

export type SetReview = z.infer<typeof reviewSchema>;
export const EMPTY_REVIEW: SetReview = { rejectedReps: [], manualReps: [], notes: "", unsure: false };

/** Reps the user ends up with: automated reps they kept plus the ones they marked. */
export function reviewedRepCount(automatedReps: number, review: SetReview): number {
  return automatedReps - new Set(review.rejectedReps).size + review.manualReps.length;
}

const near = (a: number, b: number) => Math.abs(a - b) <= DURATION_ROUNDING_SEC;

/** Every issue that makes the saved timeline untrustworthy; empty when it is consistent. */
export function timelineIssues(analysis: z.infer<typeof analysisSchema>, videoDurationMs: number): string[] {
  const issues: string[] = [];
  const tempo = analysis.perRep.tempo;
  const limit = videoDurationMs + DURATION_TOLERANCE_MS;
  // Leaving the rest position is eccentric for a squat and concentric for a pulldown.
  const outboundIsEccentric = getExerciseConfig(analysis.exercise).outbound === "eccentric";
  const [outboundName, returnName] = outboundIsEccentric ? ["eccentric", "concentric"] : ["concentric", "eccentric"];

  if (analysis.reps !== tempo.length) issues.push(`reps (${analysis.reps}) does not match the ${tempo.length} timeline entries`);

  tempo.forEach((rep, i) => {
    const at = `rep ${rep.repNumber}`;
    const outboundSec = outboundIsEccentric ? rep.eccentricSec : rep.concentricSec;
    const returnSec = outboundIsEccentric ? rep.concentricSec : rep.eccentricSec;
    if (rep.repNumber !== i + 1) issues.push(`${at}: reps must be numbered 1..n in order`);

    const outboundKnown = [rep.descentStartMs, rep.bottomReachedMs, outboundSec, rep.pauseSec].map((v) => v !== null);
    if (new Set(outboundKnown).size !== 1) issues.push(`${at}: first-phase/hold times and durations must be all present or all null`);

    const points = [rep.descentStartMs, rep.bottomReachedMs, rep.ascentStartMs, rep.repEndMs].filter((v): v is number => v !== null);
    if (points.some((v, k) => k > 0 && v < points[k - 1])) issues.push(`${at}: phase times are out of order`);
    if (points.some((v) => v > limit)) issues.push(`${at}: a phase time is past the end of the ${videoDurationMs} ms video`);

    if (returnSec === null || !near(returnSec, (rep.repEndMs - rep.ascentStartMs) / 1000)) issues.push(`${at}: ${returnName} duration disagrees with its timestamps`);
    if (rep.descentStartMs !== null && rep.bottomReachedMs !== null && outboundSec !== null && rep.pauseSec !== null) {
      if (!near(outboundSec, (rep.bottomReachedMs - rep.descentStartMs) / 1000)) issues.push(`${at}: ${outboundName} duration disagrees with its timestamps`);
      if (!near(rep.pauseSec, (rep.ascentStartMs - rep.bottomReachedMs) / 1000)) issues.push(`${at}: hold duration disagrees with its timestamps`);
    }

    const next = tempo[i + 1];
    if (next && rep.repEndMs > (next.descentStartMs ?? next.ascentStartMs)) issues.push(`${at}: overlaps the next rep`);
  });

  const repNumbers = new Set(tempo.map((t) => t.repNumber));
  const romNumbers = analysis.perRep.rom.map((r) => r.repNumber);
  if (new Set(romNumbers).size !== romNumbers.length || romNumbers.some((n) => !repNumbers.has(n))) {
    issues.push("joint-range entries must each belong to one timeline rep");
  }

  for (const e of analysis.events ?? []) {
    if (e.startMs > e.endMs || e.endMs > limit) issues.push("a movement event is reversed or past the end of the video");
  }

  return issues;
}

function reviewIssues(review: SetReview, automatedReps: number, videoDurationMs: number): string[] {
  const issues: string[] = [];
  const limit = videoDurationMs + DURATION_TOLERANCE_MS;
  if (new Set(review.rejectedReps).size !== review.rejectedReps.length || review.rejectedReps.some((n) => n > automatedReps)) {
    issues.push("rejected reps must be distinct automated rep numbers");
  }
  for (const m of review.manualReps) {
    if (m.startMs >= m.endMs || m.endMs > limit) issues.push("a marked rep must end after it starts, within the video");
  }
  if (/[\p{Cc}\p{Cf}]/u.test(review.notes.replace(/[\n\t]/g, ""))) issues.push("notes contain characters that can't be shown");
  return issues;
}

export const saveRequestSchema = z
  .object({
    /** Null = a manual review: no engine ran (custom exercise, or no model for it). */
    analysis: analysisSchema.nullable(),
    /** Duration of the decoded video the analysis/review was made from. */
    videoDurationMs: finite.gt(0).max(MAX_VIDEO_DURATION_MS),
    /** Selector option; the server re-resolves it (label/catalogue id are never taken from the client). Null for a custom name. */
    exerciseKey: z.string().max(120).nullable(),
    exerciseSource: z.enum(["catalogue", "setvision", "auto_suggestion", "custom"]),
    /** The user's own exercise name, for exerciseSource "custom" only (re-validated here). */
    customLabel: z.string().max(400).optional(),
    review: reviewSchema.optional(),
    workoutSessionId: z.string().uuid().nullable().optional(),
    sessionExerciseId: z.string().uuid().nullable().optional(),
    videoStoragePath: z.string().max(500).nullable().optional(),
  })
  .superRefine((body, ctx) => {
    const fail = (path: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

    if (body.analysis) {
      for (const issue of timelineIssues(body.analysis, body.videoDurationMs)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["analysis", "perRep", "tempo"], message: issue });
      }
    }
    for (const issue of reviewIssues(body.review ?? EMPTY_REVIEW, body.analysis?.reps ?? 0, body.videoDurationMs)) fail("review", issue);

    if (body.exerciseSource === "custom") {
      if (body.exerciseKey !== null) fail("exerciseKey", "A custom exercise has no option key.");
      const name = validateCustomExerciseName(body.customLabel ?? "");
      if (!name.ok) fail("customLabel", name.error);
      if (body.analysis) fail("analysis", "SetVision has no engine for a custom exercise.");
      return;
    }
    if (body.customLabel !== undefined) fail("customLabel", "Only a custom exercise has a typed name.");

    const option = body.exerciseKey ? findExerciseOption(body.exerciseKey) : null;
    if (!option) {
      fail("exerciseKey", "Unknown exercise.");
    } else if (body.analysis && option.engine !== body.analysis.exercise) {
      fail("exerciseKey", "The exercise does not match the analysis.");
    } else if (body.exerciseSource === "auto_suggestion" && !body.analysis) {
      fail("exerciseSource", "A confirmed suggestion is saved with its analysis.");
    } else if (body.exerciseSource !== "auto_suggestion" && body.exerciseSource !== option.source) {
      fail("exerciseSource", "The exercise source does not match the option.");
    }
  });

export type SaveRequest = z.infer<typeof saveRequestSchema>;

/** Server-resolved identity for a validated request. */
export function resolveIdentity(body: SaveRequest): SavedExerciseIdentity {
  if (body.exerciseSource === "custom") {
    const name = validateCustomExerciseName(body.customLabel ?? "");
    return { key: null, label: name.ok ? name.label : "", source: "custom", catalogueId: null };
  }
  const option = findExerciseOption(body.exerciseKey!)!;
  return { key: option.key, label: option.label, source: body.exerciseSource, catalogueId: option.catalogueId };
}

export const SAVED_ANALYSIS_COLUMNS =
  "id, exercise, reps, rom_consistency, tempo_consistency, bar_path_consistency, asymmetry_deg, average_eccentric_time_sec, average_concentric_time_sec, velocity_calibrated, velocity_unit, velocity_mean, velocity_peak, velocity_final, velocity_loss, exercise_classification_confidence, confidence, limitations, per_rep, video_storage_path, analyzed_at, workout_session_id, session_exercise_id";

export type SavedAnalysisRow = {
  id: string;
  exercise: string;
  reps: number | null;
  rom_consistency: number | null;
  tempo_consistency: number | null;
  bar_path_consistency: number | null;
  asymmetry_deg: number | null;
  average_eccentric_time_sec: number | null;
  average_concentric_time_sec: number | null;
  velocity_calibrated: boolean;
  velocity_unit: string;
  velocity_mean: number | null;
  velocity_peak: number | null;
  velocity_final: number | null;
  velocity_loss: number | null;
  exercise_classification_confidence: number | null;
  confidence: number | null;
  limitations: unknown;
  per_rep: unknown;
  video_storage_path: string | null;
  analyzed_at: string;
  workout_session_id: string | null;
  session_exercise_id: string | null;
};

export type RestoredAnalysis = {
  id: string;
  analyzedAt: string;
  videoStoragePath: string | null;
  /** Null for a saved manual review (no engine ran). */
  analysis: SetVisionAnalysis | null;
  identity: SavedExerciseIdentity | null;
  review: SetReview;
  /** False for rows saved before phase timestamps were persisted (the timeline has no times). */
  timelineRecorded: boolean;
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Stored review, keeping only well-formed parts (rows saved before reviews existed have none). */
function restoreReview(raw: unknown): SetReview {
  const parsed = reviewSchema.safeParse(raw);
  return parsed.success ? parsed.data : EMPTY_REVIEW;
}

/**
 * Re-resolves a stored identity against today's option list; a stale or
 * tampered key shows as unlabeled rather than trusted. A custom name is
 * re-validated and shown as the user's own text, never as a catalogue entry.
 */
function restoreIdentity(raw: unknown, engine: SetVisionExerciseId | null): SavedExerciseIdentity | null {
  const id = asRecord(raw);
  if (id.source === "custom") {
    const name = typeof id.label === "string" ? validateCustomExerciseName(id.label) : null;
    return name?.ok && engine === null ? { key: null, label: name.label, source: "custom", catalogueId: null } : null;
  }
  const option = typeof id.key === "string" ? findExerciseOption(id.key) : null;
  const source = id.source === "catalogue" || id.source === "setvision" || id.source === "auto_suggestion" ? id.source : null;
  if (!option || !source || (engine !== null && option.engine !== engine)) return null;
  return { key: option.key, label: option.label, source, catalogueId: option.catalogueId };
}

/**
 * Row → analysis/review, tolerant of every shape ever saved: per_rep may be
 * null, tempo entries may lack boundary times (pre-2026-11 saves stripped
 * them), ROM entries may lack rangeDeg (those are dropped — a bare % of an
 * uncalibrated reference is not shown). Never invents a value.
 */
export function restoreSavedAnalysis(row: SavedAnalysisRow): RestoredAnalysis | null {
  const perRep = asRecord(row.per_rep);
  const review = restoreReview(perRep.review);

  if (row.exercise === MANUAL_REVIEW_EXERCISE) {
    return {
      id: row.id,
      analyzedAt: row.analyzed_at,
      videoStoragePath: row.video_storage_path,
      analysis: null,
      identity: restoreIdentity(perRep.identity, null),
      review: { ...review, rejectedReps: [] },
      timelineRecorded: true,
    };
  }

  const exercise = (SETVISION_EXERCISES as string[]).includes(row.exercise) ? (row.exercise as SetVisionExerciseId) : null;
  if (!exercise) return null;

  let timelineRecorded = true;

  const tempo: RepTempo[] = asArray(perRep.tempo).flatMap((raw) => {
    const t = asRecord(raw);
    const repNumber = num(t.repNumber);
    if (repNumber === null) return [];
    const ascentStartMs = num(t.ascentStartMs);
    const repEndMs = num(t.repEndMs);
    if (ascentStartMs === null || repEndMs === null) timelineRecorded = false;
    return [{
      repNumber,
      eccentricSec: num(t.eccentricSec),
      pauseSec: num(t.pauseSec),
      concentricSec: num(t.concentricSec),
      descentStartMs: num(t.descentStartMs),
      bottomReachedMs: num(t.bottomReachedMs),
      ascentStartMs,
      repEndMs,
    }];
  });

  const rom: RepRom[] = asArray(perRep.rom).flatMap((raw) => {
    const r = asRecord(raw);
    const repNumber = num(r.repNumber);
    const rangeDeg = num(r.rangeDeg);
    const romPercent = num(r.romPercent);
    return repNumber !== null && rangeDeg !== null && romPercent !== null ? [{ repNumber, rangeDeg, romPercent }] : [];
  });

  const events: MovementEvent[] = asArray(perRep.events).flatMap((raw) => {
    const e = eventSchema.safeParse(raw);
    return e.success ? [e.data] : [];
  });

  const unitValue = row.velocity_unit === "m/s" ? "m/s" : "torso-lengths/s";
  const reps = num(row.reps) ?? 0;

  return {
    id: row.id,
    analyzedAt: row.analyzed_at,
    videoStoragePath: row.video_storage_path,
    identity: restoreIdentity(perRep.identity, exercise),
    review: { ...review, rejectedReps: review.rejectedReps.filter((n) => n <= reps) },
    timelineRecorded: tempo.length === 0 ? true : timelineRecorded,
    analysis: {
      exercise,
      exerciseClassification: { exercise, confidence: num(row.exercise_classification_confidence), signals: [] },
      reps,
      romConsistency: num(row.rom_consistency),
      averageEccentricTime: num(row.average_eccentric_time_sec),
      averageConcentricTime: num(row.average_concentric_time_sec),
      velocity: {
        calibrated: row.velocity_calibrated === true,
        unit: unitValue,
        perRep: [],
        mean: num(row.velocity_mean),
        peak: num(row.velocity_peak),
        final: num(row.velocity_final),
        velocityLoss: num(row.velocity_loss),
      },
      technique: {
        romConsistency: num(row.rom_consistency),
        tempoConsistency: num(row.tempo_consistency),
        barPathConsistency: num(row.bar_path_consistency),
        asymmetryDeg: num(row.asymmetry_deg),
      },
      confidence: num(row.confidence) ?? 0,
      perRep: { rom, tempo },
      limitations: asArray(row.limitations).filter((l): l is string => typeof l === "string"),
      abstainReason: typeof perRep.abstainReason === "string" ? perRep.abstainReason : null,
      measuredSide: perRep.measuredSide === "left" || perRep.measuredSide === "right" ? perRep.measuredSide : null,
      events,
    },
  };
}
