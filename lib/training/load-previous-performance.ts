import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { PreviousPerformance } from "@/features/workouts/types";

/**
 * The athlete's most recent completed sets per exercise, from their last completed sessions — the Active Workout's
 * "last time" line and carry-forward hint. Read-only and best-effort: any failed read returns an empty map, so it can
 * never block logging. Only completed sessions count, so the in-progress one is never its own history.
 * ponytail: looks back over the last 20 completed sessions only; widen if long gaps between exercises matter.
 */
export async function loadPreviousPerformance(
  supabase: SupabaseClient,
  userId: string,
  exerciseIds: string[],
): Promise<Map<string, PreviousPerformance>> {
  try {
    return await readPreviousPerformance(supabase, userId, exerciseIds);
  } catch {
    return new Map();
  }
}

async function readPreviousPerformance(
  supabase: SupabaseClient,
  userId: string,
  exerciseIds: string[],
): Promise<Map<string, PreviousPerformance>> {
  const byExercise = new Map<string, PreviousPerformance>();
  if (exerciseIds.length === 0) return byExercise;

  const { data: sessions, error: sessionsError } = await supabase
    .from("workout_sessions")
    .select("id, completed_at")
    .eq("user_id", userId)
    .eq("session_state", "completed")
    .order("completed_at", { ascending: false, nullsFirst: false })
    .limit(20);
  if (sessionsError || !sessions?.length) return byExercise;

  const { data: sessionExercises, error: exercisesError } = await supabase
    .from("workout_session_exercises")
    .select("id, exercise_id, workout_session_id")
    .in("workout_session_id", sessions.map((row) => row.id))
    .in("exercise_id", exerciseIds)
    .eq("is_skipped", false);
  if (exercisesError || !sessionExercises?.length) return byExercise;

  const { data: sets, error: setsError } = await supabase
    .from("exercise_sets")
    .select("session_exercise_id, set_number, weight_kg, reps, rir, rpe")
    .in("session_exercise_id", sessionExercises.map((row) => row.id))
    .eq("completed", true)
    .order("set_number", { ascending: true });
  if (setsError || !sets?.length) return byExercise;

  // Newest session first; the first one with completed sets for an exercise wins.
  for (const past of sessions) {
    for (const sessionExercise of sessionExercises) {
      if (sessionExercise.workout_session_id !== past.id || byExercise.has(sessionExercise.exercise_id)) continue;
      const exerciseSets = sets.filter((set) => set.session_exercise_id === sessionExercise.id);
      if (exerciseSets.length === 0) continue;
      byExercise.set(sessionExercise.exercise_id, {
        exercise_id: sessionExercise.exercise_id,
        performed_at: past.completed_at ?? "",
        sets: exerciseSets.map((set) => ({
          setNumber: set.set_number,
          weightKg: set.weight_kg === null ? null : Number(set.weight_kg),
          reps: set.reps,
          rir: set.rir === null ? null : Number(set.rir),
          rpe: set.rpe === null ? null : Number(set.rpe),
        })),
      });
    }
  }
  return byExercise;
}
