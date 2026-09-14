import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the write-verification behavior in session-mutations.ts
 * (mission "verify writes" requirement): a Postgres/RLS update that
 * matches zero rows returns `{ error: null }`, identical to a
 * successful update — the only way to tell the difference is a
 * read-back. These tests assert that difference is actually caught,
 * not just that the happy path returns success.
 */

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/events/emit", () => ({
  emitEvent: vi.fn(async () => ({})),
}));

import { createClient } from "@/lib/supabase/server";
import { mutateSaveSet, mutateSkipExercise, mutateAdjustSetsReps } from "@/lib/workouts/session-mutations";

const USER_ID = "user-1";
const SESSION_ID = "session-1";
const SET_ID = "set-1";
const SESSION_EXERCISE_ID = "session-exercise-1";

type FakeOptions = {
  /** When true, update() succeeds (no error) but the row is never actually visible on read-back — simulates RLS silently filtering a mismatched/foreign row, or a stale id. */
  silentNoOp?: boolean;
};

function createFakeSupabase({ silentNoOp = false }: FakeOptions = {}) {
  const state: Record<string, Record<string, unknown>> = {
    exercise_sets: { id: SET_ID, weight_kg: 100, reps: 5, completed: false },
    workout_session_exercises: { id: SESSION_EXERCISE_ID, is_skipped: false, target_sets: 4, rep_min: 6, rep_max: 8 },
  };

  const supabase = {
    auth: {
      getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }),
    },
    from(table: string) {
      if (table === "workout_sessions") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { id: SESSION_ID }, error: null }),
              }),
            }),
          }),
        };
      }

      // exercise_sets: single-.eq("id", ...) update/select chain.
      if (table === "exercise_sets") {
        return {
          update: (values: Record<string, unknown>) => ({
            eq: async () => {
              if (!silentNoOp) Object.assign(state[table], values);
              return { error: null };
            },
          }),
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: silentNoOp ? null : { ...state[table] }, error: null }),
            }),
          }),
        };
      }

      // workout_session_exercises: double-.eq(...) update/select chain
      // (id + workout_session_id).
      if (table === "workout_session_exercises") {
        return {
          update: (values: Record<string, unknown>) => ({
            eq: () => ({
              eq: async () => {
                if (!silentNoOp) Object.assign(state[table], values);
                return { error: null };
              },
            }),
          }),
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: silentNoOp ? null : { ...state[table] }, error: null }),
              }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table in fake supabase: ${table}`);
    },
  };

  return supabase;
}

beforeEach(() => {
  vi.mocked(createClient).mockReset();
});

describe("session mutation write verification", () => {
  it("mutateSaveSet succeeds when the update actually lands", async () => {
    const supabase = createFakeSupabase();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await mutateSaveSet(SESSION_ID, { setId: SET_ID, reps: 8, completed: true });

    expect(result.success).toBe(true);
  });

  it("mutateSaveSet reports failure — not false success — when the update silently matches nothing", async () => {
    const supabase = createFakeSupabase({ silentNoOp: true });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await mutateSaveSet(SESSION_ID, { setId: SET_ID, reps: 8, completed: true });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/could not be verified/i);
  });

  it("mutateSkipExercise reports failure when the row never actually changes", async () => {
    const supabase = createFakeSupabase({ silentNoOp: true });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await mutateSkipExercise(SESSION_ID, { sessionExerciseId: SESSION_EXERCISE_ID, isSkipped: true });

    expect(result.success).toBe(false);
  });

  it("mutateAdjustSetsReps reports failure when the row never actually changes", async () => {
    const supabase = createFakeSupabase({ silentNoOp: true });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await mutateAdjustSetsReps(SESSION_ID, { sessionExerciseId: SESSION_EXERCISE_ID, targetSets: 3 });

    expect(result.success).toBe(false);
  });

  it("mutateAdjustSetsReps succeeds when the update actually lands", async () => {
    const supabase = createFakeSupabase();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await mutateAdjustSetsReps(SESSION_ID, { sessionExerciseId: SESSION_EXERCISE_ID, targetSets: 3 });

    expect(result.success).toBe(true);
  });
});
