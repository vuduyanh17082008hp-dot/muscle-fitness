import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ProgramAdaptation } from "@/lib/dante-core/adaptive-program-engine";
import type { TraceableDecision } from "@/lib/dante-core/types";

/**
 * Persists WHY each Adaptive Program Engine decision happened (spec
 * Part "4. ADAPTIVE PROGRAM ENGINE": "Store why the adaptation
 * happened"). Append-only audit trail — never read back to influence
 * a future decision, so a partial failure here never affects the
 * (already-computed, deterministic) adaptation itself.
 */
export async function logProgramAdaptations(
  supabase: SupabaseClient,
  userId: string,
  adaptations: TraceableDecision<ProgramAdaptation>[],
): Promise<void> {
  if (adaptations.length === 0) return;

  const rows = adaptations.map(({ decision, why, confidence }) => ({
    user_id: userId,
    exercise_id: decision.exerciseId,
    exercise_name: decision.exerciseName,
    action: decision.action,
    suggested_weight_kg: decision.suggestedWeightKg,
    reason: why.join(" "),
    gated: decision.gated,
    confidence,
    evidence_sample_size: decision.evidenceSampleSize,
  }));

  const { error } = await supabase.from("dante_program_adaptations").insert(rows);

  if (error) {
    console.warn("[ADAPTIVE PROGRAM] Unable to log adaptations:", error.message);
  }
}
