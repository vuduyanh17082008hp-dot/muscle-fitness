import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Covers the root cause of "No session scheduled today": no code path
 * anywhere in the app ever called the existing `start_workout` SQL RPC
 * (project_09_workout_system migration), so `workout_sessions` never
 * received a row for a user's create/schedule-today action in the first
 * place — it wasn't a persistence bug so much as a missing writer. These
 * tests run against a fake but behaviorally accurate Supabase client
 * (same approach as lib/dante-core/actions/__tests__/apply-action.test.ts),
 * verifying the new startWorkoutAction:
 *  - derives the user from server auth context, never a client-supplied id
 *  - only "succeeds" (redirects to the persisted session) once start_workout
 *    itself reports success
 *  - throws a clear error and never redirects when the write fails (Test G)
 */

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { startWorkoutAction } from "@/app/dashboard/workouts/actions";

const USER_ID = "user-1";
const DAY_ID = "11111111-1111-1111-1111-111111111111";
const PLAN_ID = "22222222-2222-2222-2222-222222222222";

function createFakeSupabase(options: {
  clientId: string;
  startWorkoutResult: { data: string | null; error: { message: string } | null };
}) {
  return {
    auth: {
      getUser: async () => ({
        data: { user: { id: USER_ID } },
        error: null,
      }),
    },

    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === "can_manage_workout_client") {
        return { data: args.target_client_id === options.clientId, error: null };
      }

      if (fn === "start_workout") {
        expect(args.p_workout_day_id).toBe(DAY_ID);
        return options.startWorkoutResult;
      }

      throw new Error(`Unexpected rpc: ${fn}`);
    },

    from: (table: string) => {
      if (table === "workout_days") {
        return {
          select: () => ({
            eq: (_col: string, id: string) => ({
              single: async () => ({
                data: id === DAY_ID ? { workout_plan_id: PLAN_ID } : null,
                error: id === DAY_ID ? null : { message: "Workout day not found" },
              }),
            }),
          }),
        };
      }

      if (table === "workout_plans") {
        return {
          select: () => ({
            eq: (_col: string, id: string) => ({
              single: async () => ({
                data: id === PLAN_ID ? { client_id: options.clientId } : null,
                error: id === PLAN_ID ? null : { message: "Workout plan not found" },
              }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

function formDataFor(dayId: string): FormData {
  const formData = new FormData();
  formData.set("workout_day_id", dayId);
  return formData;
}

describe("startWorkoutAction", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it("redirects to the persisted session only after start_workout succeeds", async () => {
    const sessionId = "33333333-3333-3333-3333-333333333333";

    vi.mocked(createClient).mockResolvedValue(
      createFakeSupabase({
        clientId: USER_ID,
        startWorkoutResult: { data: sessionId, error: null },
      }) as never,
    );

    await expect(startWorkoutAction(formDataFor(DAY_ID))).rejects.toThrow(
      `REDIRECT:/dashboard/workouts/session/${sessionId}`,
    );
  });

  it("throws a clear error and never redirects when start_workout fails (Test G)", async () => {
    vi.mocked(createClient).mockResolvedValue(
      createFakeSupabase({
        clientId: USER_ID,
        startWorkoutResult: { data: null, error: { message: "Active workout day not found" } },
      }) as never,
    );

    await expect(startWorkoutAction(formDataFor(DAY_ID))).rejects.toThrow(
      /Active workout day not found/,
    );
  });

  it("rejects an invalid workout day id before ever touching the database", async () => {
    vi.mocked(createClient).mockResolvedValue(
      createFakeSupabase({
        clientId: USER_ID,
        startWorkoutResult: { data: "should-not-be-used", error: null },
      }) as never,
    );

    await expect(startWorkoutAction(formDataFor("not-a-uuid"))).rejects.toThrow(
      /không hợp lệ/,
    );
  });
});
