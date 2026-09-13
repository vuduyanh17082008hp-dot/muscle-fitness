import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ExposureTypeId, OutcomeTypeId } from "@/lib/experiments/catalog";
import type { ExperimentDayObservation } from "@/lib/experiments/engine";
import { loadTrainingContext } from "@/lib/training/load-training-context";
import { loadDemoSettings } from "@/lib/demo/settings";
import { resolveWearableProvider } from "@/lib/wearables/registry";

const CAFFEINE_KEYWORDS = ["coffee", "caffeine", "energy drink", "tea", "espresso", "pre-workout", "pre workout"];
const LATE_HOUR_UTC = 18; // 6pm — see catalog.ts's documented limitation (logged-time proxy, UTC-approximate)
const LEG_MUSCLES = new Set(["quadriceps", "hamstrings", "glutes"]);

function dateKeysInRange(startDate: string, endDate: string): string[] {
  const keys: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);

  while (cursor.getTime() <= end.getTime()) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return keys;
}

async function computeExposureByDate(
  supabase: SupabaseClient,
  userId: string,
  exposureType: ExposureTypeId,
  range: { startDate: string; endDate: string },
): Promise<Map<string, boolean>> {
  const exposed = new Map<string, boolean>();

  if (exposureType === "late_caffeine") {
    const { data, error } = await supabase
      .from("food_logs")
      .select("log_date, food_name, created_at")
      .eq("user_id", userId)
      .gte("log_date", range.startDate)
      .lte("log_date", range.endDate);

    if (error) console.warn("[EXPERIMENT LAB] late_caffeine query failed:", error.message);

    for (const row of (data as Array<{ log_date: string; food_name: string; created_at: string }> | null) ?? []) {
      const nameMatches = CAFFEINE_KEYWORDS.some((kw) => row.food_name.toLowerCase().includes(kw));
      const hourUtc = new Date(row.created_at).getUTCHours();

      if (nameMatches && hourUtc >= LATE_HOUR_UTC) {
        exposed.set(row.log_date, true);
      }
    }
  }

  if (exposureType === "high_carb_pre_workout") {
    const { data, error } = await supabase
      .from("food_logs")
      .select("log_date, meal_type, carbs_g")
      .eq("user_id", userId)
      .eq("meal_type", "pre_workout")
      .gte("log_date", range.startDate)
      .lte("log_date", range.endDate);

    if (error) console.warn("[EXPERIMENT LAB] high_carb_pre_workout query failed:", error.message);

    for (const row of (data as Array<{ log_date: string; carbs_g: number }> | null) ?? []) {
      if (Number(row.carbs_g) > 60) exposed.set(row.log_date, true);
    }
  }

  if (exposureType === "high_step_count") {
    const demoSettings = await loadDemoSettings(supabase, userId);
    const provider = resolveWearableProvider(demoSettings);
    const bundle = provider ? await provider.fetchSnapshots(userId, range) : null;

    for (const day of bundle?.days ?? []) {
      if (day.steps !== null && day.steps >= 10000) exposed.set(day.date, true);
    }
  }

  return exposed;
}

async function computeOutcomeByDate(
  supabase: SupabaseClient,
  userId: string,
  outcomeType: OutcomeTypeId,
  range: { startDate: string; endDate: string },
): Promise<Map<string, number>> {
  const values = new Map<string, number>();

  if (outcomeType === "sleep_hours" || outcomeType === "recovery_score") {
    const { data, error } = await supabase
      .from("recovery_checkins")
      .select("checkin_date, sleep_hours, recovery_score")
      .eq("user_id", userId)
      .gte("checkin_date", range.startDate)
      .lte("checkin_date", range.endDate);

    if (error) console.warn(`[EXPERIMENT LAB] ${outcomeType} query failed:`, error.message);

    for (const row of (data as Array<{ checkin_date: string; sleep_hours: number | null; recovery_score: number | null }> | null) ?? []) {
      const value = outcomeType === "sleep_hours" ? row.sleep_hours : row.recovery_score;
      if (value !== null) values.set(row.checkin_date, Number(value));
    }
  }

  if (outcomeType === "leg_day_volume_kg") {
    const [sessionsResponse, trainingContext] = await Promise.all([
      supabase
        .from("workout_sessions")
        .select("id, completed_at")
        .eq("user_id", userId)
        .not("completed_at", "is", null)
        .gte("completed_at", `${range.startDate}T00:00:00.000Z`)
        .lte("completed_at", `${range.endDate}T23:59:59.999Z`),
      // Broad window so exercise->muscle mapping covers whatever the user has ever done, not just this range.
      loadTrainingContext(supabase, userId, { windowDays: 365 }),
    ]);

    const sessions = (sessionsResponse.data as Array<{ id: string; completed_at: string }> | null) ?? [];

    if (sessions.length === 0) return values;

    const sessionDateById = new Map(sessions.map((s) => [s.id, s.completed_at.slice(0, 10)]));

    const { data: sessionExerciseRows, error: sessionExerciseError } = await supabase
      .from("workout_session_exercises")
      .select("id, workout_session_id, exercise_id")
      .in("workout_session_id", sessions.map((s) => s.id));

    if (sessionExerciseError) {
      console.warn("[EXPERIMENT LAB] leg_day_volume_kg session-exercise query failed:", sessionExerciseError.message);
      return values;
    }

    const legSessionExerciseIds = ((sessionExerciseRows as Array<{ id: string; workout_session_id: string; exercise_id: string }> | null) ?? [])
      .filter((row) => {
        const contributions = trainingContext.contributionsByExercise.get(row.exercise_id) ?? [];
        return contributions.some((c) => c.role === "primary" && LEG_MUSCLES.has(c.muscle));
      });

    if (legSessionExerciseIds.length === 0) return values;

    const sessionExerciseIdToSessionId = new Map(legSessionExerciseIds.map((row) => [row.id, row.workout_session_id]));

    const { data: setRows, error: setsError } = await supabase
      .from("exercise_sets")
      .select("session_exercise_id, weight_kg, reps, completed")
      .in("session_exercise_id", legSessionExerciseIds.map((row) => row.id))
      .eq("completed", true);

    if (setsError) {
      console.warn("[EXPERIMENT LAB] leg_day_volume_kg sets query failed:", setsError.message);
      return values;
    }

    for (const row of (setRows as Array<{ session_exercise_id: string; weight_kg: number | null; reps: number | null }> | null) ?? []) {
      const sessionId = sessionExerciseIdToSessionId.get(row.session_exercise_id);
      const date = sessionId ? sessionDateById.get(sessionId) : undefined;
      if (!date || row.weight_kg === null || row.reps === null) continue;

      values.set(date, (values.get(date) ?? 0) + row.weight_kg * row.reps);
    }

    // Days a leg exercise was NOT trained are a real zero for this outcome, not missing data —
    // but only for days something was logged as a session at all (rest days aren't "zero leg volume", they're not observed).
    for (const session of sessions) {
      const date = session.completed_at.slice(0, 10);
      if (!values.has(date)) values.set(date, 0);
    }
  }

  return values;
}

/**
 * Builds one observation per calendar day in [startDate, endDate],
 * deriving exposure/outcome entirely from data the app already has —
 * see catalog.ts for exactly what each type means and its
 * limitations. `outcomeValue` is null (excluded by the engine, not
 * zeroed) for any day with no real signal for that outcome.
 */
export async function loadExperimentObservations(
  supabase: SupabaseClient,
  userId: string,
  input: { exposureType: ExposureTypeId; outcomeType: OutcomeTypeId; startDate: string; endDate: string },
): Promise<ExperimentDayObservation[]> {
  const range = { startDate: input.startDate, endDate: input.endDate };

  const [exposureByDate, outcomeByDate] = await Promise.all([
    computeExposureByDate(supabase, userId, input.exposureType, range),
    computeOutcomeByDate(supabase, userId, input.outcomeType, range),
  ]);

  return dateKeysInRange(range.startDate, range.endDate).map((date) => ({
    date,
    exposurePresent: exposureByDate.get(date) === true,
    outcomeValue: outcomeByDate.get(date) ?? null,
  }));
}
