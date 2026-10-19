import { getUtcOffsetMinutes } from "@/lib/training/load-today-session";

/**
 * Shared week-bucketing helpers for Training Intelligence analytics.
 * Monday–Sunday, user-local weeks (spec §13) via a simple UTC-offset
 * shift — deliberately not a full timezone database dependency.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_MS = 7 * DAY_MS;

export function toLocalDate(
  isoTimestamp: string,
  timeZoneOffsetMinutes: number,
  timeZone?: string,
): Date {
  const utc = new Date(isoTimestamp);
  const offset = timeZone
    ? getUtcOffsetMinutes(utc, timeZone)
    : timeZoneOffsetMinutes;
  return new Date(utc.getTime() + offset * 60_000);
}

/** Monday-start week boundary (UTC-anchored) for a "local wall clock" instant. */
export function startOfWeekMonday(localDate: Date): Date {
  const dayOfWeek = localDate.getUTCDay(); // 0 = Sunday
  const diffFromMonday = (dayOfWeek + 6) % 7;

  const start = new Date(
    Date.UTC(
      localDate.getUTCFullYear(),
      localDate.getUTCMonth(),
      localDate.getUTCDate(),
    ),
  );

  start.setUTCDate(start.getUTCDate() - diffFromMonday);

  return start;
}

export function weekKey(weekStart: Date): string {
  return weekStart.toISOString().slice(0, 10);
}

export function currentWeekStart(
  now: Date,
  timeZoneOffsetMinutes: number,
  timeZone?: string,
): Date {
  return startOfWeekMonday(toLocalDate(now.toISOString(), timeZoneOffsetMinutes, timeZone));
}
