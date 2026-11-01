import { z } from "zod";

import { findExerciseOption, type SavedExerciseIdentity } from "@/lib/setvision/exercise-selection";
import { SETVISION_EXERCISES } from "@/lib/setvision/types";
import { MIN_VELOCITY_LOSS } from "@/lib/setvision/velocity";
import type { RepRom, RepTempo, SetVisionAnalysis, SetVisionExerciseId } from "@/lib/setvision/types";

/**
 * Save / restore contract for setvision_analyses.
 *
 * per_rep (jsonb) carries the per-rep detail AND the evidence needed to
 * trust it on read-back: the rep timeline boundaries, the video duration
 * they were checked against, and the exercise identity the server
 * resolved. A save that would drop any of that is rejected, never
 * silently stripped.
 */
// ponytail: identity + duration ride in per_rep jsonb to avoid a migration; promote to columns once queried across rows.

/** Longest clip a save accepts (the storage bucket caps files at 500 MB anyway). */
export const MAX_VIDEO_DURATION_MS = 2 * 60 * 60 * 1000;
/** Sampling-grid slack between the decoded duration and the last sampled timestamp. */
const DURATION_TOLERANCE_MS = 100;
/** Phase durations are rounded to 0.01 s; anything further from its own boundaries is inconsistent. */
const DURATION_ROUNDING_SEC = 0.011;
const MAX_REPS = 200;

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
  concentricSec: nonNegative,
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

export const analysisSchema = z.object({
  exercise: engineEnum,
  exerciseClassification: z.object({
    exercise: engineEnum.nullable(),
    confidence: unit.nullable(),
    signals: z.array(text).max(20),
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
});

const near = (a: number, b: number) => Math.abs(a - b) <= DURATION_ROUNDING_SEC;

/** Every issue that makes the saved timeline untrustworthy; empty when it is consistent. */
export function timelineIssues(analysis: z.infer<typeof analysisSchema>, videoDurationMs: number): string[] {
  const issues: string[] = [];
  const tempo = analysis.perRep.tempo;
  const limit = videoDurationMs + DURATION_TOLERANCE_MS;

  if (analysis.reps !== tempo.length) issues.push(`reps (${analysis.reps}) does not match the ${tempo.length} timeline entries`);

  tempo.forEach((rep, i) => {
    const at = `rep ${rep.repNumber}`;
    if (rep.repNumber !== i + 1) issues.push(`${at}: reps must be numbered 1..n in order`);

    const descentKnown = [rep.descentStartMs, rep.bottomReachedMs, rep.eccentricSec, rep.pauseSec].map((v) => v !== null);
    if (new Set(descentKnown).size !== 1) issues.push(`${at}: descent/bottom times and eccentric/hold durations must be all present or all null`);

    const points = [rep.descentStartMs, rep.bottomReachedMs, rep.ascentStartMs, rep.repEndMs].filter((v): v is number => v !== null);
    if (points.some((v, k) => k > 0 && v < points[k - 1])) issues.push(`${at}: phase times are out of order`);
    if (points.some((v) => v > limit)) issues.push(`${at}: a phase time is past the end of the ${videoDurationMs} ms video`);

    if (!near(rep.concentricSec, (rep.repEndMs - rep.ascentStartMs) / 1000)) issues.push(`${at}: concentric duration disagrees with its timestamps`);
    if (rep.descentStartMs !== null && rep.bottomReachedMs !== null && rep.eccentricSec !== null && rep.pauseSec !== null) {
      if (!near(rep.eccentricSec, (rep.bottomReachedMs - rep.descentStartMs) / 1000)) issues.push(`${at}: eccentric duration disagrees with its timestamps`);
      if (!near(rep.pauseSec, (rep.ascentStartMs - rep.bottomReachedMs) / 1000)) issues.push(`${at}: bottom-hold duration disagrees with its timestamps`);
    }

    const next = tempo[i + 1];
    if (next && rep.repEndMs > (next.descentStartMs ?? next.ascentStartMs)) issues.push(`${at}: overlaps the next rep`);
  });

  const repNumbers = new Set(tempo.map((t) => t.repNumber));
  const romNumbers = analysis.perRep.rom.map((r) => r.repNumber);
  if (new Set(romNumbers).size !== romNumbers.length || romNumbers.some((n) => !repNumbers.has(n))) {
    issues.push("joint-range entries must each belong to one timeline rep");
  }

  return issues;
}

export const saveRequestSchema = z
  .object({
    analysis: analysisSchema,
    /** Duration of the decoded video the analysis was computed from. */
    videoDurationMs: finite.gt(0).max(MAX_VIDEO_DURATION_MS),
    /** Selector option the analysis was run for; the server re-resolves it (label/catalogue id are never taken from the client). */
    exerciseKey: z.string().max(120),
    exerciseSource: z.enum(["catalogue", "setvision", "auto_suggestion"]),
    workoutSessionId: z.string().uuid().nullable().optional(),
    sessionExerciseId: z.string().uuid().nullable().optional(),
    videoStoragePath: z.string().max(500).nullable().optional(),
  })
  .superRefine((body, ctx) => {
    for (const issue of timelineIssues(body.analysis, body.videoDurationMs)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["analysis", "perRep", "tempo"], message: issue });
    }

    const option = findExerciseOption(body.exerciseKey);
    if (!option || option.engine === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["exerciseKey"], message: "Not an exercise SetVision analyses." });
    } else if (option.engine !== body.analysis.exercise) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["exerciseKey"], message: "The exercise does not match the analysis." });
    } else if (body.exerciseSource !== "auto_suggestion" && body.exerciseSource !== option.source) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["exerciseSource"], message: "The exercise source does not match the option." });
    }
  });

export type SaveRequest = z.infer<typeof saveRequestSchema>;

/** Server-resolved identity for a validated request (the option is known to exist). */
export function resolveIdentity(body: SaveRequest): SavedExerciseIdentity {
  const option = findExerciseOption(body.exerciseKey)!;
  return { key: option.key, label: option.label, source: body.exerciseSource, catalogueId: option.catalogueId };
}

export const SAVED_ANALYSIS_COLUMNS =
  "id, exercise, reps, rom_consistency, tempo_consistency, bar_path_consistency, asymmetry_deg, average_eccentric_time_sec, average_concentric_time_sec, velocity_calibrated, velocity_unit, velocity_mean, velocity_peak, velocity_final, velocity_loss, exercise_classification_confidence, confidence, limitations, per_rep, video_storage_path, analyzed_at, workout_session_id, session_exercise_id";

export type SavedAnalysisRow = {
  id: string;
  exercise: string;
  reps: number;
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
  confidence: number;
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
  analysis: SetVisionAnalysis;
  identity: SavedExerciseIdentity | null;
  /** False for rows saved before phase timestamps were persisted (the timeline has no times). */
  timelineRecorded: boolean;
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/**
 * Row → analysis, tolerant of every shape ever saved: per_rep may be null,
 * tempo entries may lack boundary times (pre-2026-11 saves stripped them),
 * ROM entries may lack rangeDeg (those are dropped — a bare % of an
 * uncalibrated reference is not shown). Never invents a value.
 */
export function restoreSavedAnalysis(row: SavedAnalysisRow): RestoredAnalysis | null {
  const exercise = (SETVISION_EXERCISES as string[]).includes(row.exercise) ? (row.exercise as SetVisionExerciseId) : null;
  if (!exercise) return null;

  const perRep = asRecord(row.per_rep);
  let timelineRecorded = true;

  const tempo: RepTempo[] = asArray(perRep.tempo).flatMap((raw) => {
    const t = asRecord(raw);
    const repNumber = num(t.repNumber);
    const concentricSec = num(t.concentricSec);
    if (repNumber === null || concentricSec === null) return [];
    const ascentStartMs = num(t.ascentStartMs);
    const repEndMs = num(t.repEndMs);
    if (ascentStartMs === null || repEndMs === null) timelineRecorded = false;
    return [{
      repNumber,
      eccentricSec: num(t.eccentricSec),
      pauseSec: num(t.pauseSec),
      concentricSec,
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

  const id = asRecord(perRep.identity);
  const option = typeof id.key === "string" ? findExerciseOption(id.key) : null;
  const source = id.source === "catalogue" || id.source === "setvision" || id.source === "auto_suggestion" ? id.source : null;
  // Re-resolved against today's option list; a stale or tampered key shows as unlabeled rather than trusted.
  const identity: SavedExerciseIdentity | null =
    option && source && option.engine === exercise ? { key: option.key, label: option.label, source, catalogueId: option.catalogueId } : null;

  const unitValue = row.velocity_unit === "m/s" ? "m/s" : "torso-lengths/s";

  return {
    id: row.id,
    analyzedAt: row.analyzed_at,
    videoStoragePath: row.video_storage_path,
    identity,
    timelineRecorded: tempo.length === 0 ? true : timelineRecorded,
    analysis: {
      exercise,
      exerciseClassification: { exercise, confidence: num(row.exercise_classification_confidence), signals: [] },
      reps: row.reps,
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
    },
  };
}
