import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}))

vi.mock("@/lib/events/emit", () => ({
  emitEvent: vi.fn(),
}))

import { createClient } from "@/lib/supabase/server"
import {
  mutateAdjustSetsReps,
  mutateReplaceExercise,
} from "@/lib/workouts/session-mutations"

const USER_ID = "user-a"
const SESSION_ID = "11111111-1111-1111-1111-111111111111"
const SESSION_EXERCISE_ID = "22222222-2222-2222-2222-222222222222"
const ORIGINAL_EXERCISE_ID = "33333333-3333-3333-3333-333333333333"
const REPLACEMENT_EXERCISE_ID = "44444444-4444-4444-4444-444444444444"

function fakeClient() {
  const updates: Array<{ table: string; values: Record<string, unknown> }> = []
  const selects: Array<{ table: string; columns: string }> = []

  return {
    updates,
    selects,
    client: {
      auth: {
        getUser: async () => ({
          data: { user: { id: USER_ID } },
          error: null,
        }),
      },
      from(table: string) {
        return {
          select(columns: string) {
            selects.push({ table, columns })
            const query = {
              eq() {
                return query
              },
              async maybeSingle() {
                if (table === "workout_sessions") {
                  return { data: { id: SESSION_ID }, error: null }
                }
                if (table === "exercise_library") {
                  return {
                    data: {
                      id: REPLACEMENT_EXERCISE_ID,
                      name: "Incline Press",
                    },
                    error: null,
                  }
                }
                return {
                  data: { exercise_id: ORIGINAL_EXERCISE_ID },
                  error: null,
                }
              },
            }
            return query
          },
          update(values: Record<string, unknown>) {
            updates.push({ table, values })
            const query = {
              eq() {
                return query
              },
              then<TResult1 = { error: null }>(
                onfulfilled?: ((value: { error: null }) => TResult1 | PromiseLike<TResult1>) | null,
              ) {
                return Promise.resolve({ error: null }).then(onfulfilled)
              },
            }
            return query
          },
        }
      },
    },
  }
}

describe("workout session mutation schema contract", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it("writes canonical target rep columns", async () => {
    const fake = fakeClient()
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    const result = await mutateAdjustSetsReps(SESSION_ID, {
      sessionExerciseId: SESSION_EXERCISE_ID,
      targetSets: 3,
      repMin: 6,
      repMax: 8,
    })

    expect(result.success).toBe(true)
    const update = fake.updates.find(
      (entry) => entry.table === "workout_session_exercises",
    )
    expect(update?.values).toMatchObject({
      target_sets: 3,
      target_rep_min: 6,
      target_rep_max: 8,
    })
    expect(update?.values).not.toHaveProperty("rep_min")
    expect(update?.values).not.toHaveProperty("rep_max")
  })

  it("replaces an exercise with canonical identity and display columns", async () => {
    const fake = fakeClient()
    vi.mocked(createClient).mockResolvedValue(fake.client as never)

    const result = await mutateReplaceExercise(SESSION_ID, {
      sessionExerciseId: SESSION_EXERCISE_ID,
      replacementExerciseId: REPLACEMENT_EXERCISE_ID,
    })

    expect(result.success).toBe(true)
    expect(fake.selects).toContainEqual({
      table: "workout_session_exercises",
      columns: "exercise_id",
    })
    const update = fake.updates.find(
      (entry) => entry.table === "workout_session_exercises",
    )
    expect(update?.values).toMatchObject({
      exercise_id: REPLACEMENT_EXERCISE_ID,
      display_name: "Incline Press",
      replaced_from_exercise_id: ORIGINAL_EXERCISE_ID,
    })
    expect(update?.values).not.toHaveProperty("exercise_name")
    expect(update?.values).not.toHaveProperty("replacement_exercise_id")
  })
})
