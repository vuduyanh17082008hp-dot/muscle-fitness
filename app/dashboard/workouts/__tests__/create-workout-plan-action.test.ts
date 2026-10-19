import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * WF-03A/WF-03 action boundary. The atomicity/idempotency properties themselves are proven
 * against real Postgres in lib/workouts/__tests__/create-workout-plan.db.test.ts; this covers
 * what the action must (and must not) do: validate first, make exactly ONE rpc call, never
 * write tables itself (no sequential inserts / compensating deletes), never trust a client
 * owner id for the actor, and map DB rejections to a failure result.
 */

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createTypedClient: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createTypedClient } from "@/lib/supabase/server";
import { createWorkoutPlanAction } from "@/app/dashboard/workouts/actions";

const KEY = "33333333-3333-4333-8333-333333333333";
const PLAN_ID = "44444444-4444-4444-8444-444444444444";

function fakeSupabase(rpcResult: { data: unknown; error: { message: string } | null }) {
  const from = vi.fn();
  const rpc = vi.fn(async () => rpcResult);
  vi.mocked(createTypedClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: "actor-1" } }, error: null }) },
    rpc,
    from,
  } as never);
  return { rpc, from };
}

const input = {
  name: "Push Pull",
  idempotencyKey: KEY,
  days: [
    {
      dayNumber: 1,
      name: "Push",
      exercises: [{ exerciseName: "Bench", exerciseOrder: 1, targetSets: 3, repMin: 6, repMax: 10, restSeconds: 90 }],
    },
  ],
};

describe("createWorkoutPlanAction (atomic RPC boundary)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("makes exactly one rpc call and no direct table writes", async () => {
    const { rpc, from } = fakeSupabase({ data: { plan_id: PLAN_ID, replayed: false }, error: null });
    const result = await createWorkoutPlanAction(input);

    expect(result).toMatchObject({ success: true, planId: PLAN_ID });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();
    const [name, args] = rpc.mock.calls[0] as unknown as [string, { p_idempotency_key: string; p_payload: { plan: Record<string, unknown>; days: unknown[] } }];
    expect(name).toBe("create_workout_plan");
    expect(args.p_idempotency_key).toBe(KEY);
    expect(args.p_payload.days).toHaveLength(1);
    expect(args.p_payload.plan).not.toHaveProperty("created_by");
  });

  it("replay returns the same plan id as success", async () => {
    fakeSupabase({ data: { plan_id: PLAN_ID, replayed: true }, error: null });
    expect(await createWorkoutPlanAction(input)).toMatchObject({ success: true, planId: PLAN_ID });
  });

  it("rejects an invalid child before any rpc/db call", async () => {
    const { rpc, from } = fakeSupabase({ data: null, error: null });
    const bad = { ...input, days: [{ dayNumber: 1, name: "Push", exercises: [{ exerciseName: "Bench", repMin: 12, repMax: 5, targetSets: 0 }] }] };
    const result = await createWorkoutPlanAction(bad);
    expect(result.success).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("rejects a malformed idempotency key without calling the database", async () => {
    const { rpc } = fakeSupabase({ data: null, error: null });
    expect((await createWorkoutPlanAction({ ...input, idempotencyKey: "nope" })).success).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("surfaces a DB rejection (e.g. child failure rolled back) as failure with no planId", async () => {
    fakeSupabase({ data: null, error: { message: 'violates check constraint "workout_exercises_rep_range_check"' } });
    const result = await createWorkoutPlanAction(input);
    expect(result.success).toBe(false);
    expect(result.planId).toBeUndefined();
  });

  it("maps IDEMPOTENCY_CONFLICT and ACTION_FORBIDDEN to explicit failures", async () => {
    fakeSupabase({ data: null, error: { message: "IDEMPOTENCY_CONFLICT" } });
    const conflict = await createWorkoutPlanAction(input);
    expect(conflict.success).toBe(false);
    expect(conflict.message).toMatch(/idempotency/i);

    fakeSupabase({ data: null, error: { message: "ACTION_FORBIDDEN" } });
    const forbidden = await createWorkoutPlanAction(input);
    expect(forbidden.success).toBe(false);
    expect(forbidden.message).toMatch(/quyền/);
  });
});
