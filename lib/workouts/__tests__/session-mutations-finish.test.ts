import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}))

vi.mock("@/lib/events/emit", () => ({
  emitEvent: vi.fn(),
}))

import { createClient } from "@/lib/supabase/server"
import { emitEvent } from "@/lib/events/emit"
import { mutateFinishWorkout, mutateSaveSet, mutateSkipExercise } from "@/lib/workouts/session-mutations"

const SESSION_ID = "11111111-1111-1111-1111-111111111111"
const USER_ID = "user-a"

function fakeClient(options: {
  sessionState: "in_progress" | "completed"
  rpc?: { data: unknown; error: { message: string } | null }
}) {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }),
    },
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({
                      data: { id: SESSION_ID, session_state: options.sessionState },
                      error: null,
                    }),
                  }
                },
                maybeSingle: async () => ({
                  data: { id: SESSION_ID, session_state: options.sessionState },
                  error: null,
                }),
              }
            },
          }
        },
      }
    },
    rpc: async () => options.rpc ?? { data: { sessionId: SESSION_ID }, error: null },
  }
}

describe("mutateFinishWorkout event semantics", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
    vi.mocked(emitEvent).mockReset()
    vi.mocked(emitEvent).mockResolvedValue(undefined)
  })

  it("returns failure when finish_workout fails and the session is still in progress", async () => {
    vi.mocked(createClient).mockResolvedValue(
      fakeClient({
        sessionState: "in_progress",
        rpc: { data: null, error: { message: "Complete at least one set before finishing" } },
      }) as never,
    )
    const result = await mutateFinishWorkout(SESSION_ID, {})
    expect(result.success).toBe(false)
    expect(result.message).toContain("Complete at least one set")
    expect(emitEvent).not.toHaveBeenCalled()
  })

  it("returns success when finish_workout and emitEvent both succeed", async () => {
    vi.mocked(createClient).mockResolvedValue(
      fakeClient({ sessionState: "in_progress" }) as never,
    )
    const result = await mutateFinishWorkout(SESSION_ID, { sessionRpe: 7 })
    expect(result.success).toBe(true)
    expect(result.message).toBe("Workout completed.")
    expect(emitEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "WORKOUT_COMPLETED", userId: USER_ID }),
    )
  })

  it("still reports completion when emitEvent throws after a successful RPC", async () => {
    vi.mocked(createClient).mockResolvedValue(
      fakeClient({ sessionState: "in_progress" }) as never,
    )
    vi.mocked(emitEvent).mockRejectedValue(new Error("event bus down"))
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const result = await mutateFinishWorkout(SESSION_ID, {})
    error.mockRestore()
    expect(result.success).toBe(true)
    expect(result.message).toBe("Workout completed.")
  })

  it("treats a retry after completion as success without calling finish again as a failure", async () => {
    vi.mocked(createClient).mockResolvedValue(
      fakeClient({
        sessionState: "completed",
        rpc: { data: null, error: { message: "Active workout session not found" } },
      }) as never,
    )
    const result = await mutateFinishWorkout(SESSION_ID, {})
    expect(result.success).toBe(true)
    expect(result.message).toBe("Workout completed.")
    // the first finish already emitted; a retry must not double-count the workout
    expect(emitEvent).not.toHaveBeenCalled()
  })

  it("PF-01: a completed session rejects further set logging and skips", async () => {
    vi.mocked(createClient).mockResolvedValue(
      fakeClient({ sessionState: "completed" }) as never,
    )
    const saved = await mutateSaveSet(SESSION_ID, { setId: "set-1", reps: 5, completed: true })
    expect(saved.success).toBe(false)
    expect(saved.message).toContain("already finished")
    const skipped = await mutateSkipExercise(SESSION_ID, { sessionExerciseId: "ex-1" })
    expect(skipped.success).toBe(false)
  })
})
