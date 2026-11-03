import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Slugs of exercises the athlete has completed at least one working set of in a
 * finished session (last 365 days). Familiarity only — it says nothing about
 * technique quality, and it never upgrades the athlete's experience level.
 * Every query is scoped to the signed-in user (and RLS-enforced).
 */
export async function loadExerciseFamiliarity(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<string[]> {
  const since = new Date(now.getTime() - 365 * 86_400_000).toISOString();

  const { data: sessions, error: sessionsError } = await supabase
    .from("workout_sessions")
    .select("id")
    .eq("user_id", userId)
    .not("completed_at", "is", null)
    .gte("completed_at", since)
    .limit(500);

  if (sessionsError || !sessions?.length) return [];

  const { data: rows, error: rowsError } = await supabase
    .from("workout_session_exercises")
    .select("id, exercise_id")
    .in("workout_session_id", sessions.map((s: { id: string }) => s.id));

  if (rowsError || !rows?.length) return [];

  const { data: sets, error: setsError } = await supabase
    .from("exercise_sets")
    .select("session_exercise_id")
    .eq("completed", true)
    .or("set_type.is.null,set_type.neq.warmup")
    .in("session_exercise_id", rows.map((r: { id: string }) => r.id));

  if (setsError || !sets?.length) return [];

  const loggedRowIds = new Set(sets.map((s: { session_exercise_id: string }) => s.session_exercise_id));
  const exerciseIds = [
    ...new Set(rows.filter((r: { id: string }) => loggedRowIds.has(r.id)).map((r: { exercise_id: string }) => r.exercise_id)),
  ];
  if (exerciseIds.length === 0) return [];

  const { data: library } = await supabase.from("exercise_library").select("slug").in("id", exerciseIds);
  return [...new Set((library ?? []).map((row: { slug: string }) => row.slug))];
}
