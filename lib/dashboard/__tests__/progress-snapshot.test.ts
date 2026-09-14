import { describe, expect, it } from "vitest";

import { buildProgressSnapshot } from "@/lib/dashboard/progress-snapshot";

describe("buildProgressSnapshot", () => {
  it("computes training adherence as sessions completed vs the profile's training-day target", () => {
    const snapshot = buildProgressSnapshot({
      sessionsCompletedLast7Days: 3,
      trainingDaysTarget: 4,
      recoveryTrend30Days: [],
      recoveryScoreToday: null,
      recoverySevenDayAverage: null,
      weeklyNutritionTotals: [],
      proteinTargetG: null,
      currentWeightKg: null,
    });

    expect(snapshot.trainingAdherence).toEqual({ percent: 75, sessionsCompleted: 3, sessionsTarget: 4 });
  });

  it("leaves training adherence percent null when no target is set — never fabricates a denominator", () => {
    const snapshot = buildProgressSnapshot({
      sessionsCompletedLast7Days: 3,
      trainingDaysTarget: null,
      recoveryTrend30Days: [],
      recoveryScoreToday: null,
      recoverySevenDayAverage: null,
      weeklyNutritionTotals: [],
      proteinTargetG: null,
      currentWeightKg: null,
    });

    expect(snapshot.trainingAdherence.percent).toBeNull();
  });

  it("takes only the trailing 7 days of the recovery trend for the sparkline", () => {
    const trend = Array.from({ length: 10 }, (_, i) => ({
      date: `2026-09-0${i + 1}`.slice(-10),
      score: i + 1,
      sleepHours: null,
      stress: null,
      fatigue: null,
      soreness: null,
      readiness: null,
    }));

    const snapshot = buildProgressSnapshot({
      sessionsCompletedLast7Days: 0,
      trainingDaysTarget: null,
      recoveryTrend30Days: trend,
      recoveryScoreToday: 10,
      recoverySevenDayAverage: 7,
      weeklyNutritionTotals: [],
      proteinTargetG: null,
      currentWeightKg: null,
    });

    expect(snapshot.recoveryTrend.points).toHaveLength(7);
    expect(snapshot.recoveryTrend.points[0].score).toBe(4);
  });

  it("averages protein adherence only across days that actually have a logged entry", () => {
    const snapshot = buildProgressSnapshot({
      sessionsCompletedLast7Days: 0,
      trainingDaysTarget: null,
      recoveryTrend30Days: [],
      recoveryScoreToday: null,
      recoverySevenDayAverage: null,
      weeklyNutritionTotals: [
        { date: "2026-09-08", calories: 0, proteinG: 0, entryCount: 0 },
        { date: "2026-09-09", calories: 2000, proteinG: 140, entryCount: 3 },
        { date: "2026-09-10", calories: 1800, proteinG: 70, entryCount: 2 },
      ],
      proteinTargetG: 140,
      currentWeightKg: null,
    });

    expect(snapshot.proteinAdherence).toEqual({ averagePercent: 75, daysLogged: 2, daysInWindow: 3 });
  });

  it("returns null protein adherence, not zero, when nothing was logged all week", () => {
    const snapshot = buildProgressSnapshot({
      sessionsCompletedLast7Days: 0,
      trainingDaysTarget: null,
      recoveryTrend30Days: [],
      recoveryScoreToday: null,
      recoverySevenDayAverage: null,
      weeklyNutritionTotals: [{ date: "2026-09-08", calories: 0, proteinG: 0, entryCount: 0 }],
      proteinTargetG: 140,
      currentWeightKg: null,
    });

    expect(snapshot.proteinAdherence.averagePercent).toBeNull();
  });

  it("never fabricates a weight trend — only the current logged bodyweight passes through", () => {
    const snapshot = buildProgressSnapshot({
      sessionsCompletedLast7Days: 0,
      trainingDaysTarget: null,
      recoveryTrend30Days: [],
      recoveryScoreToday: null,
      recoverySevenDayAverage: null,
      weeklyNutritionTotals: [],
      proteinTargetG: null,
      currentWeightKg: 72.4,
    });

    expect(snapshot.weight).toEqual({ currentKg: 72.4, trendAvailable: false });
  });
});
