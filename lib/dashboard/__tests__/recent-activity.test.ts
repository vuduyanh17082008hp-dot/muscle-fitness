import { describe, expect, it } from "vitest";

import { buildRecentActivity } from "@/lib/dashboard/recent-activity";

describe("buildRecentActivity", () => {
  it("merges workouts, check-ins and nutrition logs sorted most-recent-first", () => {
    const entries = buildRecentActivity({
      recentWorkoutSessions: [
        { id: "s1", name: "Push Day", completedAt: "2026-09-12T09:00:00.000Z", durationMinutes: 75, exerciseCount: 4 },
      ],
      recoveryTrend: [{ date: "2026-09-11", score: 78, sleepHours: null, stress: null, fatigue: null, soreness: null, readiness: null }],
      weeklyNutritionTotals: [{ date: "2026-09-10", calories: 2103, proteinG: 128, entryCount: 3 }],
      todayLocalDate: "2026-09-14",
    });

    expect(entries.map((entry) => entry.id)).toEqual(["workout-s1", "checkin-2026-09-11", "nutrition-2026-09-10"]);
  });

  it("excludes today's check-in and nutrition entries — those already surface on Today's Plan", () => {
    const entries = buildRecentActivity({
      recentWorkoutSessions: [],
      recoveryTrend: [{ date: "2026-09-14", score: 80, sleepHours: null, stress: null, fatigue: null, soreness: null, readiness: null }],
      weeklyNutritionTotals: [{ date: "2026-09-14", calories: 1000, proteinG: 50, entryCount: 1 }],
      todayLocalDate: "2026-09-14",
    });

    expect(entries).toEqual([]);
  });

  it("never fabricates an entry for a day with no logged food", () => {
    const entries = buildRecentActivity({
      recentWorkoutSessions: [],
      recoveryTrend: [],
      weeklyNutritionTotals: [{ date: "2026-09-10", calories: 0, proteinG: 0, entryCount: 0 }],
      todayLocalDate: "2026-09-14",
    });

    expect(entries).toEqual([]);
  });

  it("returns an empty list, never sample data, when nothing happened", () => {
    const entries = buildRecentActivity({
      recentWorkoutSessions: [],
      recoveryTrend: [],
      weeklyNutritionTotals: [],
      todayLocalDate: "2026-09-14",
    });

    expect(entries).toEqual([]);
  });

  it("respects the limit", () => {
    const entries = buildRecentActivity({
      recentWorkoutSessions: [
        { id: "s1", name: "A", completedAt: "2026-09-10T09:00:00.000Z", durationMinutes: null, exerciseCount: null },
        { id: "s2", name: "B", completedAt: "2026-09-11T09:00:00.000Z", durationMinutes: null, exerciseCount: null },
        { id: "s3", name: "C", completedAt: "2026-09-12T09:00:00.000Z", durationMinutes: null, exerciseCount: null },
      ],
      recoveryTrend: [],
      weeklyNutritionTotals: [],
      todayLocalDate: "2026-09-14",
      limit: 2,
    });

    expect(entries).toHaveLength(2);
    expect(entries[0].id).toBe("workout-s3");
  });
});
