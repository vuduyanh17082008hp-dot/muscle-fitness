import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Today's scheduled session, if one exists — the same query shape
 * already used inline by app/dashboard/page.tsx's Today Hero,
 * extracted here so the Daily Decision Engine (and anything else
 * that needs "what's planned today") shares the exact same read
 * rather than each re-deriving it slightly differently.
 */

export type TodaySessionExercise = {
  sessionExerciseId: string;
  exerciseId: string;
  exerciseName: string;
  targetSets: number | null;
  repMin: number | null;
  repMax: number | null;
  restSeconds: number | null;
  primaryMuscle: string | null;
  isSkipped: boolean;
};

export type TodaySession = {
  id: string;
  name: string | null;
  scheduledFor: string | null;
  durationMinutes: number | null;
  sessionState: string | null;
  exercises: TodaySessionExercise[];
};

function todayIso(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export async function loadTodaySession(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<TodaySession | null> {
  const startOfDay = `${todayIso(now)}T00:00:00.000Z`;
  const endOfDay = `${todayIso(now)}T23:59:59.999Z`;

  const { data: sessionRows, error: sessionError } = await supabase
    .from("workout_sessions")
    .select("id, name, scheduled_for, duration_minutes, session_state")
    .eq("user_id", userId)
    .gte("scheduled_for", startOfDay)
    .lte("scheduled_for", endOfDay)
    .order("scheduled_for", { ascending: true })
    .limit(1);

  if (sessionError || !sessionRows || sessionRows.length === 0) {
    return null;
  }

  const session = sessionRows[0] as {
    id: string;
    name: string | null;
    scheduled_for: string | null;
    duration_minutes: number | null;
    session_state: string | null;
  };

  const { data: exerciseRows, error: exerciseError } = await supabase
    .from("workout_session_exercises")
    .select("id, exercise_id, exercise_name, target_sets, rep_min, rep_max, rest_seconds, is_skipped")
    .eq("workout_session_id", session.id)
    .order("exercise_order", { ascending: true });

  if (exerciseError) {
    console.warn("[TODAY SESSION] Unable to load session exercises:", exerciseError.message);
  }

  const rows =
    (exerciseRows as Array<{
      id: string;
      exercise_id: string;
      exercise_name: string | null;
      target_sets: number | null;
      rep_min: number | null;
      rep_max: number | null;
      rest_seconds: number | null;
      is_skipped: boolean | null;
    }> | null) ?? [];

  const exerciseIds = Array.from(new Set(rows.map((row) => row.exercise_id)));
  const primaryMuscleById = new Map<string, string | null>();

  if (exerciseIds.length > 0) {
    const { data: libraryRows, error: libraryError } = await supabase
      .from("exercise_library")
      .select("id, primary_muscle")
      .in("id", exerciseIds);

    if (libraryError) {
      console.warn("[TODAY SESSION] Unable to load exercise_library:", libraryError.message);
    }

    for (const row of (libraryRows as Array<{ id: string; primary_muscle: string | null }> | null) ?? []) {
      primaryMuscleById.set(row.id, row.primary_muscle);
    }
  }

  return {
    id: session.id,
    name: session.name,
    scheduledFor: session.scheduled_for,
    durationMinutes: session.duration_minutes,
    sessionState: session.session_state,
    exercises: rows.map((row) => ({
      sessionExerciseId: row.id,
      exerciseId: row.exercise_id,
      exerciseName: row.exercise_name ?? "Exercise",
      targetSets: row.target_sets,
      repMin: row.rep_min,
      repMax: row.rep_max,
      restSeconds: row.rest_seconds,
      primaryMuscle: primaryMuscleById.get(row.exercise_id) ?? null,
      isSkipped: row.is_skipped === true,
    })),
  };
}
