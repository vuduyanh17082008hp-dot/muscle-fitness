import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  sessionStateToActionStatus,
  type DailyAction,
} from "@/lib/daily-plan/types";

export type CalendarDay = {
  /** YYYY-MM-DD, local-agnostic (derived from the same ISO timestamps the rest of the app stores). */
  date: string;
  isToday: boolean;
  actions: DailyAction[];
};

function toDateKey(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Loads a real, bounded window of the SAME workout_sessions and
 * recovery_checkins rows Dashboard/Training already read — this is
 * the Calendar's whole data source. No separate calendar_events table:
 * a scheduled workout still exists as exactly one workout_sessions row.
 */
export async function loadCalendarRange(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
  { daysBefore = 3, daysAfter = 10 }: { daysBefore?: number; daysAfter?: number } = {},
): Promise<CalendarDay[]> {
  const todayKey = now.toISOString().slice(0, 10);

  const rangeStart = new Date(now);
  rangeStart.setDate(rangeStart.getDate() - daysBefore);
  const rangeEnd = new Date(now);
  rangeEnd.setDate(rangeEnd.getDate() + daysAfter);

  const startIso = `${rangeStart.toISOString().slice(0, 10)}T00:00:00.000Z`;
  const endIso = `${rangeEnd.toISOString().slice(0, 10)}T23:59:59.999Z`;

  const [sessionsResponse, checkinsResponse] = await Promise.all([
    supabase
      .from("workout_sessions")
      .select("id, name, scheduled_for, duration_minutes, session_state")
      .eq("user_id", userId)
      .not("scheduled_for", "is", null)
      .gte("scheduled_for", startIso)
      .lte("scheduled_for", endIso)
      .order("scheduled_for", { ascending: true }),
    supabase
      .from("recovery_checkins")
      .select("checkin_date, recovery_score")
      .eq("user_id", userId)
      .gte("checkin_date", startIso.slice(0, 10))
      .lte("checkin_date", endIso.slice(0, 10)),
  ]);

  if (sessionsResponse.error) {
    console.warn(
      "[CALENDAR] Unable to load workout_sessions:",
      sessionsResponse.error.message,
    );
  }

  if (checkinsResponse.error) {
    console.warn(
      "[CALENDAR] Unable to load recovery_checkins:",
      checkinsResponse.error.message,
    );
  }

  const days = new Map<string, DailyAction[]>();

  const ensureDay = (dateKey: string) => {
    if (!days.has(dateKey)) {
      days.set(dateKey, []);
    }
    return days.get(dateKey)!;
  };

  const sessionRows =
    (sessionsResponse.data as Array<{
      id: string;
      name: string | null;
      scheduled_for: string;
      duration_minutes: number | null;
      session_state: string | null;
    }> | null) ?? [];

  for (const row of sessionRows) {
    const dateKey = toDateKey(row.scheduled_for);

    ensureDay(dateKey).push({
      id: `workout-${row.id}`,
      type: "workout",
      title: row.name ?? "Training session",
      subtitle: row.duration_minutes ? `~${row.duration_minutes} min` : null,
      status: sessionStateToActionStatus(row.session_state),
      scheduledAt: row.scheduled_for,
      priority: 2,
      actionUrl: `/dashboard/workouts/session/${row.id}`,
      source: "workout_sessions",
      metadata: {
        durationMinutes: row.duration_minutes,
      },
    });
  }

  const checkinRows =
    (checkinsResponse.data as Array<{
      checkin_date: string;
      recovery_score: number | null;
    }> | null) ?? [];

  for (const row of checkinRows) {
    const dateKey = row.checkin_date;

    ensureDay(dateKey).push({
      id: `checkin-${dateKey}`,
      type: "checkin",
      title: "Daily check-in",
      subtitle:
        row.recovery_score !== null
          ? `Recovery score ${row.recovery_score}`
          : "Completed",
      status: "completed",
      scheduledAt: null,
      priority: 1,
      actionUrl: "/dashboard/recovery",
      source: "recovery_checkins",
      metadata: {
        recoveryScore: row.recovery_score,
      },
    });
  }

  // Always include today even if nothing is scheduled, so the caller
  // can render an honest "nothing planned" row instead of skipping the day.
  ensureDay(todayKey);

  const sortedDateKeys = Array.from(days.keys()).sort();

  return sortedDateKeys.map((dateKey) => ({
    date: dateKey,
    isToday: dateKey === todayKey,
    actions: (days.get(dateKey) ?? []).sort((a, b) => {
      if (a.scheduledAt && b.scheduledAt) {
        return a.scheduledAt.localeCompare(b.scheduledAt);
      }
      if (a.scheduledAt) return -1;
      if (b.scheduledAt) return 1;
      return a.priority - b.priority;
    }),
  }));
}
