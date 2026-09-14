import type { RecentWorkoutSession } from "@/lib/dashboard/load-recent-workout-sessions";
import type { RecoveryTrendPoint } from "@/lib/recovery/load-recovery-context";
import type { DailyNutritionTotal } from "@/lib/dashboard/load-weekly-nutrition-totals";

export type RecentActivityCategory = "workout" | "checkin" | "nutrition";

export type RecentActivityEntry = {
  id: string;
  category: RecentActivityCategory;
  title: string;
  subtitle: string;
  /** ISO date or date-time — display-formatted by the caller, sortable as-is. */
  sortKey: string;
};

export type BuildRecentActivityInput = {
  recentWorkoutSessions: RecentWorkoutSession[];
  /** Excludes today — Today's Plan already surfaces today's check-in/nutrition state. */
  recoveryTrend: RecoveryTrendPoint[];
  weeklyNutritionTotals: DailyNutritionTotal[];
  todayLocalDate: string;
  limit?: number;
};

function formatDuration(minutes: number | null, exerciseCount: number | null): string {
  const parts: string[] = [];

  if (minutes) {
    parts.push(`${minutes} min`);
  }

  if (exerciseCount) {
    parts.push(`${exerciseCount} exercise${exerciseCount === 1 ? "" : "s"}`);
  }

  return parts.length > 0 ? parts.join(" · ") : "Completed";
}

/**
 * Pure derivation of the Dashboard's Recent Activity strip — no
 * dedicated activity table (spec: "derive, don't store"), just the
 * same completed workout_sessions / recovery_checkins / food_logs
 * every other surface reads, merged and sorted by recency.
 */
export function buildRecentActivity(input: BuildRecentActivityInput): RecentActivityEntry[] {
  const limit = input.limit ?? 5;
  const entries: RecentActivityEntry[] = [];

  for (const session of input.recentWorkoutSessions) {
    entries.push({
      id: `workout-${session.id}`,
      category: "workout",
      title: session.name ?? "Workout",
      subtitle: formatDuration(session.durationMinutes, session.exerciseCount),
      sortKey: session.completedAt,
    });
  }

  for (const point of input.recoveryTrend) {
    if (point.date === input.todayLocalDate || point.score === null) {
      continue;
    }

    entries.push({
      id: `checkin-${point.date}`,
      category: "checkin",
      title: "Daily Check-in",
      subtitle: `Recovery score ${point.score}`,
      sortKey: point.date,
    });
  }

  for (const day of input.weeklyNutritionTotals) {
    if (day.date === input.todayLocalDate || day.entryCount === 0) {
      continue;
    }

    entries.push({
      id: `nutrition-${day.date}`,
      category: "nutrition",
      title: "Logged Nutrition",
      subtitle: `${Math.round(day.calories)} kcal · ${Math.round(day.proteinG)}g protein`,
      sortKey: day.date,
    });
  }

  return entries.sort((a, b) => (a.sortKey < b.sortKey ? 1 : -1)).slice(0, limit);
}
