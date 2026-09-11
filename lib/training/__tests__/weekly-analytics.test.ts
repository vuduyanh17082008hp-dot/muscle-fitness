import { describe, expect, it } from "vitest";
import { computeWeeklyMuscleAnalytics } from "@/lib/training/weekly-analytics";
import type { ExerciseMuscleContribution } from "@/lib/training/exercise-muscle-map";

const BENCH = "bench";

const CONTRIBUTIONS = new Map<string, ExerciseMuscleContribution[]>([
  [
    BENCH,
    [
      { muscle: "chest", role: "primary", contribution: 1.0, mappingVersion: 1, source: "system" },
      { muscle: "triceps", role: "secondary", contribution: 0.5, mappingVersion: 1, source: "system" },
    ],
  ],
]);

// Wednesday of week 1
const NOW = new Date("2026-01-14T12:00:00.000Z");

describe("computeWeeklyMuscleAnalytics", () => {
  it("computes week-over-week change and frequency from dated sets", () => {
    const sets = [
      // previous week (Jan 5-11): 2 sets on one day
      { exerciseId: BENCH, setType: "working" as const, completed: true, sessionId: "s1", completedAt: "2026-01-06T10:00:00.000Z" },
      { exerciseId: BENCH, setType: "working" as const, completed: true, sessionId: "s1", completedAt: "2026-01-06T10:00:00.000Z" },
      // current week (Jan 12-18): 4 sets across two sessions
      { exerciseId: BENCH, setType: "working" as const, completed: true, sessionId: "s2", completedAt: "2026-01-13T10:00:00.000Z" },
      { exerciseId: BENCH, setType: "working" as const, completed: true, sessionId: "s2", completedAt: "2026-01-13T10:00:00.000Z" },
      { exerciseId: BENCH, setType: "working" as const, completed: true, sessionId: "s3", completedAt: "2026-01-15T10:00:00.000Z" },
      { exerciseId: BENCH, setType: "working" as const, completed: true, sessionId: "s3", completedAt: "2026-01-15T10:00:00.000Z" },
    ];

    const result = computeWeeklyMuscleAnalytics(sets, CONTRIBUTIONS, { now: NOW });

    const chest = result.get("chest")!;

    expect(chest.currentWeek.totalEffectiveSets).toBe(4);
    expect(chest.previousWeek?.totalEffectiveSets).toBe(2);
    expect(chest.changeAbsolute).toBe(2);
    expect(chest.changePercent).toBe(100);
    expect(chest.frequency).toBe(2);
  });

  it("returns no previous-week comparison when there is no prior data", () => {
    const sets = [
      { exerciseId: BENCH, setType: "working" as const, completed: true, sessionId: "s1", completedAt: "2026-01-13T10:00:00.000Z" },
    ];

    const result = computeWeeklyMuscleAnalytics(sets, CONTRIBUTIONS, { now: NOW });
    const chest = result.get("chest")!;

    expect(chest.previousWeek).toBeNull();
    expect(chest.changeAbsolute).toBeNull();
    expect(chest.changePercent).toBeNull();
  });

  it("returns an empty result for no logged sets, never a fabricated zero-volume muscle map", () => {
    const result = computeWeeklyMuscleAnalytics([], CONTRIBUTIONS, { now: NOW });

    expect(result.size).toBe(0);
  });
});
