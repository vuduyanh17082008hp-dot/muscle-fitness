import { describe, expect, it } from "vitest";

import { loadTrainingContext } from "@/lib/training/load-training-context";

function fakeSupabase(timezone: string | null) {
  return {
    from(table: string) {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: timezone ? { timezone } : null, error: null }),
            }),
          }),
        };
      }

      if (table === "workout_sessions") {
        const query = {
          select: () => query,
          eq: () => query,
          not: () => query,
          gte: () => query,
          order: async () => ({ data: [], error: null }),
        };
        return query;
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

describe("loadTrainingContext local data window", () => {
  const now = new Date("2026-10-06T16:30:00.000Z");

  it("labels the Dante/training window with the profile-local date", async () => {
    const result = await loadTrainingContext(
      fakeSupabase("Asia/Singapore") as never,
      "user-1",
      { now, windowDays: 7 },
    );

    expect(result.dataWindow).toEqual({
      startDate: "2026-09-30",
      endDate: "2026-10-07",
      weeksOfHistory: 0,
    });
  });

  it("falls back to UTC when profile timezone is absent", async () => {
    const result = await loadTrainingContext(
      fakeSupabase(null) as never,
      "user-1",
      { now, windowDays: 7 },
    );

    expect(result.dataWindow).toEqual({
      startDate: "2026-09-29",
      endDate: "2026-10-06",
      weeksOfHistory: 0,
    });
  });
});

describe("loadTrainingContext session-exercise schema contract", () => {
  it("selects canonical columns and maps them into the application model", async () => {
    let selectedColumns = "";
    const completedAt = "2026-10-06T10:00:00.000Z";

    const supabase = {
      from(table: string) {
        if (table === "workout_sessions") {
          const query = {
            select: () => query,
            eq: () => query,
            not: () => query,
            gte: () => query,
            order: async () => ({
              data: [{ id: "session-1", completed_at: completedAt, session_state: "completed" }],
              error: null,
            }),
          };
          return query;
        }

        if (table === "workout_session_exercises") {
          return {
            select(columns: string) {
              selectedColumns = columns;
              return {
                in: async () => ({
                  data: [{
                    id: "session-exercise-1",
                    workout_session_id: "session-1",
                    exercise_id: "exercise-1",
                    display_name: "Bench Press",
                    target_sets: 4,
                    target_rep_min: 5,
                    target_rep_max: 7,
                    target_rir: 2,
                    target_rpe: 8,
                  }],
                  error: null,
                }),
              };
            },
          };
        }

        if (table === "exercise_sets") {
          return {
            select: () => ({
              in: async () => ({
                data: [{
                  id: "set-1",
                  session_exercise_id: "session-exercise-1",
                  set_type: "working",
                  weight_kg: 80,
                  reps: 6,
                  rir: 2,
                  completed: true,
                  completed_at: completedAt,
                  estimated_1rm_kg: 96,
                }],
                error: null,
              }),
            }),
          };
        }

        if (table === "exercise_library") {
          return {
            select: () => ({
              in: async () => ({
                data: [{
                  id: "exercise-1",
                  slug: "bench-press",
                  name: "Bench Press",
                  primary_muscle: "chest",
                  secondary_muscles: ["triceps"],
                  owner_id: null,
                }],
                error: null,
              }),
            }),
          };
        }

        if (table === "exercise_muscle_contributions") {
          return {
            select: () => ({
              in: () => ({
                eq: async () => ({
                  data: [{
                    exercise_id: "exercise-1",
                    muscle: "chest",
                    role: "primary",
                    contribution: 1,
                    mapping_version: 1,
                    source: "system",
                  }],
                  error: null,
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
    };

    const result = await loadTrainingContext(
      supabase as never,
      "user-1",
      { now: new Date("2026-10-06T12:00:00.000Z"), timeZone: "UTC" },
    );

    expect(selectedColumns).toContain("display_name");
    expect(selectedColumns).toContain("target_sets");
    expect(selectedColumns).toContain("target_rep_min");
    expect(selectedColumns).toContain("target_rep_max");
    expect(selectedColumns).toContain("target_rir");
    expect(selectedColumns).toContain("target_rpe");
    expect(selectedColumns).not.toMatch(/(?:^|,\s*)rep_(?:min|max)(?:,|$)/);
    expect(result.exercisesById.get("exercise-1")?.name).toBe("Bench Press");
    expect(result.lastSessionByExercise.get("exercise-1")).toMatchObject({
      sessionExerciseId: "session-exercise-1",
      displayName: "Bench Press",
      targetSets: 4,
      targetRepMin: 5,
      targetRepMax: 7,
      targetRir: 2,
      targetRpe: 8,
      completedAt,
      sets: [{ weightKg: 80, reps: 6, rir: 2, completed: true }],
    });
  });
});
