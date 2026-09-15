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

/**
 * The UTC offset (in minutes) a given instant falls at in `timeZone` —
 * e.g. +480 for Asia/Singapore. Used to convert the user's LOCAL
 * calendar day into the UTC range `scheduled_for` is stored in,
 * instead of assuming the server's UTC day is the user's day.
 */
function getUtcOffsetMinutes(date: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset",
    }).formatToParts(date);

    const offsetPart = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT+0";
    const match = offsetPart.match(/GMT([+-])(\d+)(?::(\d+))?/);

    if (!match) {
      return 0;
    }

    const sign = match[1] === "-" ? -1 : 1;
    const hours = Number(match[2]);
    const minutes = Number(match[3] ?? 0);

    return sign * (hours * 60 + minutes);
  } catch {
    return 0;
  }
}

/**
 * The user's LOCAL calendar day ("today" as they'd read it on a
 * clock in their own time zone), expressed as a UTC range — so a
 * session scheduled just after local midnight, while the server's
 * UTC date has not rolled over yet, is still read as "today" instead
 * of silently falling into "yesterday". Reuses the same
 * `profiles.timezone` convention already used by `get_client_dashboard()`.
 */
export function localDayRangeUtc(now: Date, timeZone: string): { startIso: string; endIso: string } {
  const localDate = localDateTimeParts(now, timeZone).localDate;
  // Locate each boundary independently: a daylight-saving day can be 23 or 25
  // hours, so applying the current UTC offset to both midnights is incorrect.
  function boundary(afterToday: boolean): number {
    let low = now.getTime() - 48 * 60 * 60 * 1000;
    let high = now.getTime() + 48 * 60 * 60 * 1000;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const date = localDateTimeParts(new Date(middle), timeZone).localDate;
      if (afterToday ? date <= localDate : date < localDate) low = middle + 1;
      else high = middle;
    }
    return low;
  }
  return {
    startIso: new Date(boundary(false)).toISOString(),
    endIso: new Date(boundary(true) - 1).toISOString(),
  };
}

/**
 * The user's LOCAL calendar date ("2026-09-14") and wall-clock time
 * ("00:37") — the same offset math as `localDayRangeUtc` above, so a
 * caller reading "today" as a range and a caller reading "today" as a
 * display string can never disagree with each other. This is the
 * single source Dante's deterministic temporal context (see
 * lib/dante-core/temporal-context.ts) and any tool needing "today" as
 * a plain date string (e.g. today's food log) should use — never a
 * second, independently-derived `new Date().toISOString().slice(0, 10)`.
 */
export function localDateTimeParts(now: Date, timeZone: string): { localDate: string; localTime: string } {
  const offsetMinutes = getUtcOffsetMinutes(now, timeZone);
  const shifted = new Date(now.getTime() + offsetMinutes * 60_000);

  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  const hours = String(shifted.getUTCHours()).padStart(2, "0");
  const minutes = String(shifted.getUTCMinutes()).padStart(2, "0");

  return {
    localDate: `${year}-${month}-${day}`,
    localTime: `${hours}:${minutes}`,
  };
}

/**
 * Resolves the user's IANA timezone from their persisted profile row
 * — the canonical source of truth for "what day is it for this user"
 * (spec: "persisted authenticated profile timezone if available").
 * Skips the query entirely when the caller already knows the
 * timezone (e.g. a page that already loaded the profile row for
 * other reasons) — never a redundant second fetch.
 */
export async function resolveUserTimeZone(
  supabase: SupabaseClient,
  userId: string,
  timeZoneOverride?: string | null,
): Promise<string> {
  if (timeZoneOverride) {
    return timeZoneOverride;
  }

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();

  return (profileRow as { timezone: string | null } | null)?.timezone || "UTC";
}

export async function loadTodaySession(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
  timeZoneOverride?: string | null,
): Promise<TodaySession | null> {
  const timeZone = await resolveUserTimeZone(supabase, userId, timeZoneOverride);

  const { startIso, endIso } = localDayRangeUtc(now, timeZone);

  const { data: sessionRows, error: sessionError } = await supabase
    .from("workout_sessions")
    .select("id, name, scheduled_for, duration_minutes, session_state")
    .eq("user_id", userId)
    .gte("scheduled_for", startIso)
    .lte("scheduled_for", endIso)
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
