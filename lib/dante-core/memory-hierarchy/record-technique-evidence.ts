import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DECAY_FULL_DAYS,
  DECAY_START_DAYS,
  computePatternConfidence,
} from "@/lib/dante-core/memory-hierarchy/consolidate";
import {
  MIN_SAMPLES_FOR_TECHNIQUE_PATTERN,
  NOTABLE_CONSISTENCY_DEVIATION,
  TECHNIQUE_PATTERN_FORGET_FLOOR,
  type DanteTechniquePattern,
  type TechniqueDeviationDirection,
  type TechniqueSignalType,
} from "@/lib/dante-core/memory-hierarchy/technique-pattern-types";
import type { BaselineDeviation } from "@/lib/dante-core/personal-baseline";
import type { SetVisionExerciseId } from "@/lib/setvision/types";

/**
 * The write path for SetVision's OWN longitudinal-learning loop —
 * a sibling to (not a caller of) recordObservationAndLearn. See
 * technique-pattern-types.ts for why this is a separate model.
 *
 * IDEMPOTENCY: guarded by an atomic claim on
 * setvision_analyses.technique_pattern_processed_at (`UPDATE ...
 * WHERE technique_pattern_processed_at IS NULL`) — the same
 * compare-and-swap shape `pending-actions.ts` already uses elsewhere
 * in this codebase. A retried call for the same analysisId claims 0
 * rows the second time and returns { recorded: false, reason:
 * "already_processed" } without touching any pattern row, so repeated
 * calls can never inflate sample_count/notable_count.
 */

function round(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function buildTechniqueSummary(
  exercise: SetVisionExerciseId,
  signalType: TechniqueSignalType,
  direction: TechniqueDeviationDirection,
  sampleCount: number,
  notableCount: number,
): string {
  const exerciseLabel = exercise.replaceAll("_", " ");
  const signalLabel = signalType === "rom_consistency" ? "range-of-motion consistency" : "tempo consistency";
  const directionLabel = direction === "below_baseline" ? "below" : "above";

  return `Across ${sampleCount} comparable ${exerciseLabel} sessions, ${signalLabel} has been ${directionLabel} your personal baseline in ${notableCount}.`;
}

function applyTechniquePatternDecay(
  pattern: DanteTechniquePattern,
  now: Date,
): DanteTechniquePattern {
  const daysSinceReinforced =
    (now.getTime() - new Date(pattern.lastReinforcedAt).getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceReinforced <= DECAY_START_DAYS) {
    return pattern;
  }

  const decayProgress = Math.min(1, (daysSinceReinforced - DECAY_START_DAYS) / (DECAY_FULL_DAYS - DECAY_START_DAYS));
  const decayedConfidence = round(pattern.confidence * (1 - decayProgress));

  return {
    ...pattern,
    confidence: decayedConfidence,
    status: decayedConfidence <= TECHNIQUE_PATTERN_FORGET_FLOOR && pattern.sampleCount >= MIN_SAMPLES_FOR_TECHNIQUE_PATTERN
      ? "forgotten"
      : pattern.status,
  };
}

type TechniquePatternRow = {
  id: string;
  user_id: string;
  exercise: string;
  signal_type: string;
  direction: string;
  status: string;
  sample_count: number;
  notable_count: number;
  confidence: number;
  summary: string;
  first_observed_at: string;
  last_reinforced_at: string;
};

function fromRow(row: TechniquePatternRow): DanteTechniquePattern {
  return {
    id: row.id,
    userId: row.user_id,
    exercise: row.exercise as SetVisionExerciseId,
    signalType: row.signal_type as TechniqueSignalType,
    direction: row.direction as TechniqueDeviationDirection,
    status: row.status as DanteTechniquePattern["status"],
    sampleCount: row.sample_count,
    notableCount: row.notable_count,
    confidence: row.confidence,
    summary: row.summary,
    firstObservedAt: row.first_observed_at,
    lastReinforcedAt: row.last_reinforced_at,
  };
}

async function foldOneDirection(
  supabase: SupabaseClient,
  userId: string,
  exercise: SetVisionExerciseId,
  signalType: TechniqueSignalType,
  direction: TechniqueDeviationDirection,
  isNotableInThisDirection: boolean,
  now: Date,
): Promise<void> {
  const { data: existingRow, error: loadError } = await supabase
    .from("dante_technique_patterns")
    .select(
      "id, user_id, exercise, signal_type, direction, status, sample_count, notable_count, confidence, summary, first_observed_at, last_reinforced_at",
    )
    .eq("user_id", userId)
    .eq("exercise", exercise)
    .eq("signal_type", signalType)
    .eq("direction", direction)
    .maybeSingle();

  if (loadError) {
    console.warn("[DANTE TECHNIQUE MEMORY] Unable to load existing pattern:", loadError.message);
    return;
  }

  const existing = existingRow ? fromRow(existingRow as TechniquePatternRow) : null;

  const sampleCount = (existing?.sampleCount ?? 0) + 1;
  const notableCount = (existing?.notableCount ?? 0) + (isNotableInThisDirection ? 1 : 0);
  const confidence = computePatternConfidence(sampleCount, notableCount);
  const nowIso = now.toISOString();

  const status: DanteTechniquePattern["status"] =
    confidence <= TECHNIQUE_PATTERN_FORGET_FLOOR && sampleCount >= MIN_SAMPLES_FOR_TECHNIQUE_PATTERN
      ? "demoted"
      : "active";

  const row = {
    user_id: userId,
    exercise,
    signal_type: signalType,
    direction,
    status,
    sample_count: sampleCount,
    notable_count: notableCount,
    confidence,
    summary: buildTechniqueSummary(exercise, signalType, direction, sampleCount, notableCount),
    first_observed_at: existing?.firstObservedAt ?? nowIso,
    last_reinforced_at: nowIso,
  };

  const query = existing
    ? supabase.from("dante_technique_patterns").update(row).eq("id", existing.id).eq("user_id", userId)
    : supabase.from("dante_technique_patterns").insert(row);

  const { error: writeError } = await query;

  if (writeError) {
    console.error("[DANTE TECHNIQUE MEMORY] Unable to save pattern:", writeError.message);
  }
}

export type TechniqueDeviationInput = Partial<Record<TechniqueSignalType, BaselineDeviation | null>>;

export type RecordTechniqueEvidenceResult =
  | { recorded: true; signalsProcessed: TechniqueSignalType[] }
  | { recorded: false; reason: "already_processed" | "not_found" | "load_error" };

/**
 * Folds one SetVision analysis's baseline deviations into
 * dante_technique_patterns — called once, right after
 * app/api/setvision/results/route.ts persists the analysis. Never
 * throws; a failure here must not take down the SetVision save itself
 * (same "optional context, never a hard dependency" posture as
 * loadSetVisionContext).
 */
export async function recordTechniqueEvidenceFromDeviations(
  supabase: SupabaseClient,
  userId: string,
  analysisId: string,
  exercise: SetVisionExerciseId,
  deviations: TechniqueDeviationInput,
  now: Date = new Date(),
): Promise<RecordTechniqueEvidenceResult> {
  // Atomic claim: only the FIRST call for a given analysisId ever
  // proceeds past this point. A retried request (network retry,
  // duplicate proactive re-processing) claims 0 rows and stops here,
  // so pattern rows can never be double-counted for the same analysis.
  const { data: claimedRows, error: claimError } = await supabase
    .from("setvision_analyses")
    .update({ technique_pattern_processed_at: now.toISOString() })
    .eq("id", analysisId)
    .eq("user_id", userId)
    .is("technique_pattern_processed_at", null)
    .select("id");

  if (claimError) {
    console.warn("[DANTE TECHNIQUE MEMORY] Unable to claim analysis for processing:", claimError.message);
    return { recorded: false, reason: "load_error" };
  }

  if (!claimedRows || claimedRows.length === 0) {
    return { recorded: false, reason: "already_processed" };
  }

  const signalsProcessed: TechniqueSignalType[] = [];

  for (const signalType of Object.keys(deviations) as TechniqueSignalType[]) {
    const deviation = deviations[signalType];

    // Only evidence-worthy when computeBaselineDeviation found a REAL
    // baseline (confidence > 0 there means sampleCount cleared its own
    // MIN_SAMPLES_FOR_BASELINE gate) and produced a finite delta —
    // never treat "not enough history yet" as a zero/negative signal,
    // and never persist a NaN/non-finite value.
    if (
      deviation === null ||
      deviation === undefined ||
      deviation.baseline === null ||
      deviation.delta === null ||
      deviation.confidence <= 0 ||
      !Number.isFinite(deviation.delta)
    ) {
      continue;
    }

    const notableDirection: TechniqueDeviationDirection = deviation.delta < 0 ? "below_baseline" : "above_baseline";
    const isNotable = Math.abs(deviation.delta) >= NOTABLE_CONSISTENCY_DEVIATION;

    // Both direction rows get their denominator incremented (this
    // analysis WAS evaluable for this signal), but only the matching
    // direction's numerator moves — so confidence in the direction
    // that ISN'T happening correctly erodes over time instead of
    // lingering from stale evidence.
    await foldOneDirection(supabase, userId, exercise, signalType, "below_baseline", isNotable && notableDirection === "below_baseline", now);
    await foldOneDirection(supabase, userId, exercise, signalType, "above_baseline", isNotable && notableDirection === "above_baseline", now);

    signalsProcessed.push(signalType);
  }

  return { recorded: true, signalsProcessed };
}

export { applyTechniquePatternDecay };
