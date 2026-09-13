import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ProgressionAction } from "@/lib/training/progression-engine";

export type AdaptationHistoryEntry = {
  id: string;
  action: ProgressionAction | "INCREASE_LOAD" | "HOLD" | "DECREASE_LOAD";
  suggestedWeightKg: number | null;
  createdAt: string;
};

/**
 * Real adaptation history for one exercise, from the existing
 * dante_program_adaptations audit trail (mission Part 11: "if
 * recommendation history was not persisted... do not invent fake
 * history"). Returns an empty array — never a fabricated entry — for
 * an exercise with no logged adaptations yet, which is the common
 * case until enough real cycles accumulate.
 */
export async function loadAdaptationHistory(
  supabase: SupabaseClient,
  userId: string,
  exerciseId: string,
  limit = 3,
): Promise<AdaptationHistoryEntry[]> {
  const { data, error } = await supabase
    .from("dante_program_adaptations")
    .select("id, action, suggested_weight_kg, created_at")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[ADAPTIVE HISTORY] Unable to load history:", error.message);
    return [];
  }

  return ((data as Array<{ id: string; action: string; suggested_weight_kg: number | null; created_at: string }> | null) ?? []).map(
    (row) => ({
      id: row.id,
      action: row.action as ProgressionAction,
      suggestedWeightKg: row.suggested_weight_kg,
      createdAt: row.created_at,
    }),
  );
}
