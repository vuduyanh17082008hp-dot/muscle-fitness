import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type RecentWorkoutSession = {
  id: string;
  name: string | null;
  completedAt: string;
  durationMinutes: number | null;
  exerciseCount: number | null;
};

/**
 * The last N COMPLETED workout sessions (never planned/skipped ones —
 * "recent activity" only reports what actually happened). Reads the
 * same `workout_sessions`/`workout_session_exercises` tables every
 * other training surface uses; no new table, no fabricated summary.
 */
export async function loadRecentWorkoutSessions(
  supabase: SupabaseClient,
  userId: string,
  limit = 5,
): Promise<RecentWorkoutSession[]> {
  const { data: sessionRows, error: sessionsError } = await supabase
    .from("workout_sessions")
    .select("id, name, completed_at, duration_minutes")
    .eq("user_id", userId)
    .eq("session_state", "completed")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(limit);

  if (sessionsError) {
    console.warn("[RECENT ACTIVITY] Unable to load workout_sessions:", sessionsError.message);
    return [];
  }

  const sessions =
    (sessionRows as Array<{
      id: string;
      name: string | null;
      completed_at: string | null;
      duration_minutes: number | null;
    }> | null) ?? [];

  if (sessions.length === 0) {
    return [];
  }

  const sessionIds = sessions.map((session) => session.id);

  const { data: exerciseRows, error: exerciseError } = await supabase
    .from("workout_session_exercises")
    .select("workout_session_id")
    .in("workout_session_id", sessionIds);

  if (exerciseError) {
    console.warn("[RECENT ACTIVITY] Unable to load workout_session_exercises:", exerciseError.message);
  }

  const exerciseCountBySession = new Map<string, number>();
  for (const row of (exerciseRows as Array<{ workout_session_id: string }> | null) ?? []) {
    exerciseCountBySession.set(
      row.workout_session_id,
      (exerciseCountBySession.get(row.workout_session_id) ?? 0) + 1,
    );
  }

  return sessions.map((session) => ({
    id: session.id,
    name: session.name,
    completedAt: session.completed_at as string,
    durationMinutes: session.duration_minutes,
    exerciseCount: exerciseCountBySession.get(session.id) ?? null,
  }));
}
