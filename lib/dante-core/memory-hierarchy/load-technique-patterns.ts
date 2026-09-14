import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { applyTechniquePatternDecay } from "@/lib/dante-core/memory-hierarchy/record-technique-evidence";
import {
  isSurfaceableTechniquePattern,
  type DanteTechniquePattern,
  type TechniqueDeviationDirection,
  type TechniqueSignalType,
} from "@/lib/dante-core/memory-hierarchy/technique-pattern-types";
import type { SetVisionExerciseId } from "@/lib/setvision/types";

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

/** Bounds how many patterns ever reach Dante's context — "bounded, relevant" per the mission's memory-retrieval requirement, never an unbounded dump. */
const MAX_PATTERNS_FOR_CONTEXT = 3;

/**
 * The ONLY read path meant to feed Dante's context
 * (lib/athlete-state/build-athlete-state.ts). Applies the same
 * time-based decay as dante_learned_patterns (for display/decision
 * purposes — the stored counters aren't mutated by reading), then
 * returns only the top few patterns that clear
 * `isSurfaceableTechniquePattern` — never every row, never a
 * low-confidence guess presented as fact.
 */
export async function loadSurfaceableTechniquePatterns(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<DanteTechniquePattern[]> {
  const { data, error } = await supabase
    .from("dante_technique_patterns")
    .select(
      "id, user_id, exercise, signal_type, direction, status, sample_count, notable_count, confidence, summary, first_observed_at, last_reinforced_at",
    )
    .eq("user_id", userId)
    .eq("status", "active")
    .order("confidence", { ascending: false })
    .limit(20);

  if (error) {
    console.warn("[DANTE TECHNIQUE MEMORY] Unable to load technique patterns:", error.message);
    return [];
  }

  const decayed = ((data as TechniquePatternRow[] | null) ?? [])
    .map((row) => applyTechniquePatternDecay(fromRow(row), now))
    .filter(isSurfaceableTechniquePattern)
    .sort((a, b) => b.confidence - a.confidence);

  return decayed.slice(0, MAX_PATTERNS_FOR_CONTEXT);
}

/** User-initiated deletion, mirroring load-patterns.ts's forgetLearnedPattern — no UI wires this yet in this pass (see the session's cross-agent notes), but the backend capability exists so "forget this" can't be a dead end once a UI calls it. */
export async function forgetTechniquePattern(
  supabase: SupabaseClient,
  userId: string,
  patternId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from("dante_technique_patterns")
    .delete()
    .eq("id", patternId)
    .eq("user_id", userId);

  if (error) {
    console.error("[DANTE TECHNIQUE MEMORY] Unable to delete pattern:", error.message);
    return { ok: false, error: "Unable to forget this pattern. Please try again." };
  }

  return { ok: true };
}
