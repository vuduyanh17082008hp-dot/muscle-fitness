import { describe, expect, it } from "vitest";

import { deriveFallbackContributions } from "@/lib/training/exercise-muscle-map";
import type { LoggedSetRecord } from "@/lib/training/load-training-context";
import { buildMuscleIntelligence, loadLevel, maxDirectSets } from "@/lib/training/muscle-intelligence";

const contributions = new Map([
  ["bench", deriveFallbackContributions("chest", ["front_delts", "triceps"])],
  ["pushdown", deriveFallbackContributions("triceps", [])],
  ["mystery", deriveFallbackContributions("Something Unknown", [])],
]);

const set = (over: Partial<LoggedSetRecord>): LoggedSetRecord => ({
  sessionId: "s1",
  exerciseId: "bench",
  exerciseName: "Barbell Bench Press",
  setType: "working",
  completed: true,
  completedAt: "2026-11-01T10:00:00Z",
  localDate: "2026-11-01",
  ...over,
});

const data = buildMuscleIntelligence({
  today: "2026-11-01",
  contributionsByExercise: contributions,
  completedSessions: [
    { id: "s1", name: "Push A", completedAt: "2026-11-01T11:00:00Z", localDate: "2026-11-01" },
    { id: "s0", name: null, completedAt: "2026-10-10T11:00:00Z", localDate: "2026-10-10" },
  ],
  loggedSets: [
    set({}),
    set({}),
    set({ setType: "warmup" }),
    set({ completed: false }),
    set({ exerciseId: "pushdown", exerciseName: "Cable Triceps Pushdown" }),
    set({ exerciseId: "mystery", exerciseName: "Mystery Move" }),
    set({ sessionId: "s0", localDate: "2026-10-10", completedAt: "2026-10-10T10:00:00Z" }),
  ],
});

describe("buildMuscleIntelligence", () => {
  it("counts only completed working sets, split into direct and indirect", () => {
    const week = data.ranges["7d"];
    expect(week.muscles.chest).toMatchObject({ directSets: 2, indirectSets: 0, sessions: 1, lastTrainedDate: "2026-11-01" });
    expect(week.muscles.triceps).toMatchObject({ directSets: 1, indirectSets: 2 });
    expect(week.muscles.anterior_deltoid).toMatchObject({ directSets: 0, indirectSets: 2 });
    expect(week.muscles.quadriceps).toBeUndefined();
  });

  it("reports unmappable exercises as unknown instead of guessing a muscle", () => {
    expect(data.ranges["7d"].unmappedSets).toBe(1);
    expect(data.ranges["7d"].unmappedExercises).toEqual(["Mystery Move"]);
  });

  it("widens with the time range and keeps the most recent date", () => {
    expect(data.ranges["7d"].muscles.chest?.directSets).toBe(2);
    expect(data.ranges["28d"].muscles.chest).toMatchObject({ directSets: 3, sessions: 2, lastTrainedDate: "2026-11-01" });
    expect(data.ranges["7d"].startDate).toBe("2026-10-26");
  });

  it("lists direct exercises before indirect ones for a muscle", () => {
    expect(data.ranges["7d"].muscles.triceps?.exercises.map((e) => e.role)).toEqual(["direct", "indirect"]);
  });

  it("maps each completed workout to the muscles it trained", () => {
    const [latest, older] = data.recentSessions;
    expect(latest.name).toBe("Push A");
    expect(latest.direct.sort()).toEqual(["chest", "triceps"]);
    expect(latest.indirect).toEqual(["anterior_deltoid"]);
    expect(older.name).toBe("Workout");
  });

  it("bands load relative to the athlete's own most-trained muscle", () => {
    const week = data.ranges["7d"];
    const max = maxDirectSets(week);
    expect(max).toBe(2);
    expect(loadLevel(week.muscles.chest, max)).toBe("high");
    expect(loadLevel(week.muscles.triceps, max)).toBe("moderate");
    expect(loadLevel(week.muscles.anterior_deltoid, max)).toBe("indirect");
    expect(loadLevel(undefined, max)).toBe("none");
  });
});
