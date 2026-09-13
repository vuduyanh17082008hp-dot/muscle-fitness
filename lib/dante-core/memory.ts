import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Dante Memory (spec Part "5. DANTE MEMORY") — a structured,
 * user-controlled preference layer, distinct from `user_preferences`
 * (onboarding-collected lifestyle fields) and from `fitness_profiles`
 * (goals/equipment/experience). This table holds only the fields
 * NOT already captured elsewhere, so there is one place per fact,
 * never two overlapping preference stores.
 *
 * Every field is visible, user-editable and user-deletable via
 * app/api/dante/memory/route.ts — Dante reads this, it never writes
 * to it unsupervised, and there is no free-form "notes Dante keeps
 * about you" field.
 */

export type CoachingPreference = "direct" | "encouraging" | "detailed" | "concise";

export type DanteMemory = {
  preferredExercises: string[];
  dislikedExercises: string[];
  weakPointPriorities: string[];
  coachingPreference: CoachingPreference | null;
  updatedAt: string | null;
};

export const EMPTY_DANTE_MEMORY: DanteMemory = {
  preferredExercises: [],
  dislikedExercises: [],
  weakPointPriorities: [],
  coachingPreference: null,
  updatedAt: null,
};

type DanteMemoryRow = {
  preferred_exercises: string[] | null;
  disliked_exercises: string[] | null;
  weak_point_priorities: string[] | null;
  coaching_preference: string | null;
  updated_at: string | null;
};

function fromRow(row: DanteMemoryRow | null): DanteMemory {
  if (!row) return EMPTY_DANTE_MEMORY;

  return {
    preferredExercises: row.preferred_exercises ?? [],
    dislikedExercises: row.disliked_exercises ?? [],
    weakPointPriorities: row.weak_point_priorities ?? [],
    coachingPreference: (row.coaching_preference as CoachingPreference | null) ?? null,
    updatedAt: row.updated_at,
  };
}

export async function loadDanteMemory(
  supabase: SupabaseClient,
  userId: string,
): Promise<DanteMemory> {
  const { data, error } = await supabase
    .from("dante_memory")
    .select("preferred_exercises, disliked_exercises, weak_point_priorities, coaching_preference, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn("[DANTE MEMORY] load failed:", error.message);
    return EMPTY_DANTE_MEMORY;
  }

  return fromRow(data as DanteMemoryRow | null);
}

export type DanteMemoryPatch = Partial<{
  preferredExercises: string[];
  dislikedExercises: string[];
  weakPointPriorities: string[];
  coachingPreference: CoachingPreference | null;
}>;

/**
 * Upserts only the fields supplied — a caller updating just
 * `coachingPreference` never has to re-send the exercise lists. To
 * clear a list field entirely, pass an empty array explicitly (not
 * `undefined`, which leaves it untouched).
 */
export async function saveDanteMemory(
  supabase: SupabaseClient,
  userId: string,
  patch: DanteMemoryPatch,
): Promise<{ ok: true; memory: DanteMemory } | { ok: false; error: string }> {
  const updates: Record<string, unknown> = { user_id: userId };

  if (patch.preferredExercises !== undefined) updates.preferred_exercises = patch.preferredExercises;
  if (patch.dislikedExercises !== undefined) updates.disliked_exercises = patch.dislikedExercises;
  if (patch.weakPointPriorities !== undefined) updates.weak_point_priorities = patch.weakPointPriorities;
  if (patch.coachingPreference !== undefined) updates.coaching_preference = patch.coachingPreference;

  const { data, error } = await supabase
    .from("dante_memory")
    .upsert(updates, { onConflict: "user_id" })
    .select("preferred_exercises, disliked_exercises, weak_point_priorities, coaching_preference, updated_at")
    .single();

  if (error) {
    console.error("[DANTE MEMORY] save failed:", error.message);
    return { ok: false, error: "Unable to save your preferences. Please try again." };
  }

  return { ok: true, memory: fromRow(data as DanteMemoryRow) };
}

export async function deleteDanteMemory(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from("dante_memory").delete().eq("user_id", userId);

  if (error) {
    console.error("[DANTE MEMORY] delete failed:", error.message);
    return { ok: false, error: "Unable to clear your preferences. Please try again." };
  }

  return { ok: true };
}
