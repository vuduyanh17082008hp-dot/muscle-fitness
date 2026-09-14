import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { localDateTimeParts } from "@/lib/training/load-today-session";

export type DailyNutritionTotal = {
  /** YYYY-MM-DD, in the user's local calendar. */
  date: string;
  calories: number;
  proteinG: number;
  entryCount: number;
};

/** The last N user-local calendar dates, oldest first, ending at (and including) `now`. */
function lastLocalDates(now: Date, timeZone: string, days: number): string[] {
  const dates: string[] = [];

  for (let i = days - 1; i >= 0; i -= 1) {
    const shifted = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    dates.push(localDateTimeParts(shifted, timeZone).localDate);
  }

  return dates;
}

/**
 * Per-day calorie/protein totals for the trailing `days`-day window
 * (default 7, matching the rest of Progress/Training Intelligence's
 * "current week" convention) — used by the Progress Snapshot's protein
 * adherence tile and by Recent Activity's nutrition entries. One read
 * of `food_logs`, aggregated here rather than duplicating
 * `computeDailyTotals` per day server-side.
 */
export async function loadWeeklyNutritionTotals(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
  timeZone: string = "UTC",
  days = 7,
): Promise<DailyNutritionTotal[]> {
  const dates = lastLocalDates(now, timeZone, days);
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];

  const { data, error } = await supabase
    .from("food_logs")
    .select("log_date, calories, protein_g")
    .eq("user_id", userId)
    .gte("log_date", startDate)
    .lte("log_date", endDate);

  if (error) {
    console.warn("[WEEKLY NUTRITION] Unable to load food_logs:", error.message);
    return dates.map((date) => ({ date, calories: 0, proteinG: 0, entryCount: 0 }));
  }

  const rows = (data as Array<{ log_date: string; calories: number; protein_g: number }> | null) ?? [];

  const totalsByDate = new Map<string, DailyNutritionTotal>(
    dates.map((date) => [date, { date, calories: 0, proteinG: 0, entryCount: 0 }]),
  );

  for (const row of rows) {
    const bucket = totalsByDate.get(row.log_date);

    if (!bucket) {
      continue;
    }

    bucket.calories += Number(row.calories) || 0;
    bucket.proteinG += Number(row.protein_g) || 0;
    bucket.entryCount += 1;
  }

  return dates.map((date) => totalsByDate.get(date) as DailyNutritionTotal);
}
