import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SetVisionExerciseId } from "@/lib/setvision/types";
import { computeBaselineDeviation, type BaselineDeviation } from "@/lib/dante-core/personal-baseline";

/**
 * Read-only history loader for setvision_analyses (persisted by
 * app/api/setvision/results/route.ts — this module never re-runs or
 * duplicates the analysis itself, only aggregates what was already
 * computed and saved). Used to feed the Athlete Digital Twin's
 * SetVision section and its ROM/tempo personal-baseline deviations.
 */

export type SetVisionAnalysisRow = {
  id: string;
  exercise: SetVisionExerciseId;
  reps: number;
  rom_consistency: number | null;
  tempo_consistency: number | null;
  velocity_loss: number | null;
  confidence: number;
  analyzed_at: string;
};

export type SetVisionContext = {
  available: boolean;
  /** Most recent analysis across any exercise, or null if none exist. */
  latest: SetVisionAnalysisRow | null;
  analysesLast30Days: number;
  /** ROM-consistency baseline deviation vs. the user's own history for the same exercise as `latest`. */
  romConsistencyDeviation: BaselineDeviation | null;
  /** Tempo-consistency baseline deviation, same scoping as above. */
  tempoConsistencyDeviation: BaselineDeviation | null;
};

const EMPTY_CONTEXT: SetVisionContext = {
  available: false,
  latest: null,
  analysesLast30Days: 0,
  romConsistencyDeviation: null,
  tempoConsistencyDeviation: null,
};

export async function loadSetVisionContext(
  supabase: SupabaseClient,
  userId: string,
  options: { now?: Date } = {},
): Promise<SetVisionContext> {
  const now = options.now ?? new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("setvision_analyses")
    .select("id, exercise, reps, rom_consistency, tempo_consistency, velocity_loss, confidence, analyzed_at")
    .eq("user_id", userId)
    .gte("analyzed_at", thirtyDaysAgo)
    .order("analyzed_at", { ascending: false })
    .limit(60);

  if (error) {
    // Missing table / transient failure both degrade to "unavailable"
    // rather than throwing — SetVision is optional context, never a
    // hard dependency for the rest of the Digital Twin.
    console.warn("[SETVISION CONTEXT] load failed:", error.message);
    return EMPTY_CONTEXT;
  }

  const rows = (data ?? []) as SetVisionAnalysisRow[];

  if (rows.length === 0) {
    return EMPTY_CONTEXT;
  }

  const latest = rows[0];
  const sameExerciseHistory = rows.filter((row) => row.exercise === latest.exercise).slice(1);

  return {
    available: true,
    latest,
    analysesLast30Days: rows.length,
    romConsistencyDeviation: computeBaselineDeviation(
      sameExerciseHistory.map((row) => row.rom_consistency),
      latest.rom_consistency,
    ),
    tempoConsistencyDeviation: computeBaselineDeviation(
      sameExerciseHistory.map((row) => row.tempo_consistency),
      latest.tempo_consistency,
    ),
  };
}
