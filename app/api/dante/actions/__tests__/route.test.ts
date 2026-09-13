import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route-handler tests for POST /api/dante/actions — the only HTTP
 * entry point that can turn a Dante-proposed action into a database
 * write. Covers auth, the zod-validated typed action schema (an
 * invalid/freeform payload must be blocked before it ever reaches
 * applyDanteAction), and the confirm/reject dispatch.
 */

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";

const USER_ID = "user-1";
const SESSION_ID = "11111111-1111-1111-1111-111111111111";
const SESSION_EXERCISE_ID = "22222222-2222-2222-2222-222222222222";

function createFakeSupabase() {
  const updateCalls: unknown[] = [];
  const insertCalls: Record<string, unknown>[] = [];

  const client = {
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

      if (table === "workout_session_exercises") {
        return {
          update: (values: Record<string, unknown>) => ({
            eq: () => ({
              eq: async () => {
                updateCalls.push(values);
                return { error: null };
              },
            }),
          }),
        };
      }

      if (table === "dante_action_log") {
        return {
          insert: async (row: Record<string, unknown>) => {
            insertCalls.push(row);
            return { error: null };
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { client, updateCalls, insertCalls };
}

function postJson(body: unknown) {
  return new Request("http://localhost/api/dante/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(createClient).mockReset();
  vi.resetModules();
});

describe("POST /api/dante/actions", () => {
  it("rejects unauthenticated requests", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    } as never);

    const { POST } = await import("../route");
    const response = await POST(postJson({}));

    expect(response.status).toBe(401);
  });

  it("blocks an invalid/freeform action payload before it ever reaches the database", async () => {
    const { client, updateCalls, insertCalls } = createFakeSupabase();
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { POST } = await import("../route");
    const response = await POST(
      postJson({
        payload: { type: "delete_all_workouts", sessionId: SESSION_ID },
        reason: "n/a",
        confidence: 0.9,
        intent: "confirm",
      }),
    );

    expect(response.status).toBe(400);
    expect(updateCalls).toHaveLength(0);
    expect(insertCalls).toHaveLength(0);
  });

  it("blocks a well-typed action type with an out-of-range field", async () => {
    const { client, updateCalls } = createFakeSupabase();
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { POST } = await import("../route");
    const response = await POST(
      postJson({
        payload: {
          type: "modify_volume",
          sessionId: SESSION_ID,
          sessionExerciseId: SESSION_EXERCISE_ID,
          exerciseName: "Squat",
          before: { sets: 4 },
          after: { sets: 999 }, // out of the 1-20 allowed range
        },
        reason: "n/a",
        confidence: 0.9,
        intent: "confirm",
      }),
    );

    expect(response.status).toBe(400);
    expect(updateCalls).toHaveLength(0);
  });

  it("confirms a valid postpone_exercise action and writes the mutation", async () => {
    const { client, updateCalls, insertCalls } = createFakeSupabase();
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { POST } = await import("../route");
    const response = await POST(
      postJson({
        payload: {
          type: "postpone_exercise",
          sessionId: SESSION_ID,
          sessionExerciseId: SESSION_EXERCISE_ID,
          exerciseName: "Leg Press",
        },
        reason: "Quad recovery is very low today.",
        confidence: 0.8,
        intent: "confirm",
      }),
    );

    const body = (await response.json()) as { ok: boolean; status: string };
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.status).toBe("applied");
    expect(updateCalls).toHaveLength(1);
    expect(insertCalls).toHaveLength(1);
  });

  it("rejects an action without writing any mutation", async () => {
    const { client, updateCalls, insertCalls } = createFakeSupabase();
    vi.mocked(createClient).mockResolvedValue(client as never);

    const { POST } = await import("../route");
    const response = await POST(
      postJson({
        payload: {
          type: "postpone_exercise",
          sessionId: SESSION_ID,
          sessionExerciseId: SESSION_EXERCISE_ID,
          exerciseName: "Leg Press",
        },
        reason: "Quad recovery is very low today.",
        confidence: 0.8,
        intent: "reject",
      }),
    );

    const body = (await response.json()) as { ok: boolean; status: string };
    expect(response.status).toBe(200);
    expect(body.status).toBe("rejected");
    expect(updateCalls).toHaveLength(0);
    expect(insertCalls).toHaveLength(1);
  });
});
