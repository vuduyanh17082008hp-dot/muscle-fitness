import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/progress/load-journey", () => ({
  loadProgressRecords: vi.fn(async () => ({
    today: "2026-10-07",
    timezone: "Asia/Singapore",
    sessions: [
      {
        id: "session-1",
        sessionState: "completed",
        restDay: false,
        scheduledFor: "2026-10-07",
        completedAt: "2026-10-07T02:00:00.000Z",
      },
    ],
    journey: {},
  })),
}))

vi.mock("@/lib/nutrition/food-log/load-food-log-context", () => ({
  loadFoodLogForDate: vi.fn(async () => ({
    entries: [],
    totals: { calories: 0, protein: 0, carbs: 0, fat: 0 },
  })),
}))

vi.mock("@/lib/progress/page-model", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/progress/page-model")>()
  return {
    ...actual,
    buildProgressPageModel: vi.fn((input) => input),
  }
})

import { loadProgressPageModel } from "@/lib/progress/load-progress-page"

function fakeSupabase() {
  const selects: Array<{ table: string; columns: string }> = []

  return {
    selects,
    client: {
      from(table: string) {
        return {
          select(columns: string) {
            selects.push({ table, columns })

            if (table === "fitness_profiles") {
              const query = {
                eq() {
                  return query
                },
                async maybeSingle() {
                  return { data: null, error: null }
                },
              }
              return query
            }

            if (table === "exercise_sets") {
              return {
                in() {
                  return {
                    async eq() {
                      return {
                        data: [
                          {
                            session_exercise_id: "session-exercise-1",
                            weight_kg: 100,
                            reps: 5,
                            completed: true,
                            completed_at: "2026-10-07T02:00:00.000Z",
                            estimated_1rm_kg: 112.5,
                          },
                        ],
                        error: null,
                      }
                    },
                  }
                },
              }
            }

            return {
              async in() {
                if (table === "workout_session_exercises") {
                  if (columns === "exercise_id") {
                    return {
                      data: [{ exercise_id: "exercise-1" }],
                      error: null,
                    }
                  }
                  return {
                    data: [
                      {
                        id: "session-exercise-1",
                        exercise_id: "exercise-1",
                        display_name: "Bench Press",
                      },
                    ],
                    error: null,
                  }
                }
                return {
                  data: [{ primary_muscle: "chest" }],
                  error: null,
                }
              },
            }
          },
        }
      },
    },
  }
}

describe("Progress workout session exercise schema contract", () => {
  it("queries display_name and maps it to the application exercise name", async () => {
    const fake = fakeSupabase()

    const model = await loadProgressPageModel(
      fake.client as never,
      "user-a",
      new Date("2026-10-07T02:00:00.000Z"),
    )

    expect(fake.selects).toContainEqual({
      table: "workout_session_exercises",
      columns: "id, exercise_id, display_name",
    })
    expect(fake.selects).not.toContainEqual({
      table: "workout_session_exercises",
      columns: expect.stringContaining("exercise_name"),
    })
    expect(
      (model as unknown as {
        personalRecords: Array<{ exerciseName: string }>
      }).personalRecords[0]?.exerciseName,
    ).toBe("Bench Press")
  })
})
