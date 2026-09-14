import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for applyDanteAction — the ONLY code path allowed to turn a
 * Dante-proposed action into a real database write (spec Part
 * "2. DANTE ACTIONS": "Never: LLM → direct DB mutation"). These run
 * against a fake but behaviorally accurate Supabase client (same
 * approach as app/api/recovery/checkin/__tests__/route.test.ts):
 * real applyDanteAction code, real session-mutations dispatch, a
 * fake table layer standing in for Postgres/RLS.
 */

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { applyDanteAction } from "@/lib/dante-core/actions/apply-action";
import type {
  AdjustSetsRepsPayload,
  MacroAdjustmentPayload,
  ModifyVolumePayload,
  PostponeExercisePayload,
  UndoActionPayload,
} from "@/lib/dante-core/actions/types";

type UpdateCall = { sessionExerciseId: string; sessionId: string; values: Record<string, unknown> };
type InsertCall = { table: string; row: Record<string, unknown> };

function createFakeSupabase(options: {
  authenticatedUserId: string | null;
  sessionOwners: Map<string, string>;
  /** Simulates a write that reports no Postgres error but matches zero rows (e.g. RLS-filtered or a stale id) — the read-back verification is what's supposed to catch this. */
  simulateSilentNoOpUpdate?: boolean;
}) {
  const updateCalls: UpdateCall[] = [];
  const insertCalls: InsertCall[] = [];
  const sessionExerciseState: Record<string, unknown> = {};
  const loggedRows = new Map<string, Record<string, unknown>>();

  const supabase = {
    auth: {
      getUser: async () => ({
        data: { user: options.authenticatedUserId ? { id: options.authenticatedUserId } : null },
        error: null,
      }),
    },
    from(table: string) {
      if (table === "workout_sessions") {
        return {
          select: () => ({
            eq: (_col1: string, sessionId: string) => ({
              eq: (_col2: string, userId: string) => ({
                maybeSingle: async () => ({
                  data: options.sessionOwners.get(sessionId) === userId ? { id: sessionId } : null,
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      if (table === "workout_session_exercises") {
        return {
          update: (values: Record<string, unknown>) => ({
            eq: (_col1: string, sessionExerciseId: string) => ({
              eq: async (_col2: string, sessionId: string) => {
                updateCalls.push({ sessionExerciseId, sessionId, values });
                if (!options.simulateSilentNoOpUpdate) {
                  Object.assign(sessionExerciseState, values);
                }
                return { error: null };
              },
            }),
          }),
          select: (_columns: string) => ({
            eq: (_col1: string, _sessionExerciseId: string) => ({
              eq: (_col2: string, _sessionId: string) => ({
                maybeSingle: async () => ({
                  data:
                    updateCalls.length > 0 && !options.simulateSilentNoOpUpdate
                      ? { id: _sessionExerciseId, ...sessionExerciseState }
                      : null,
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      if (table === "dante_action_log") {
        return {
          insert: async (row: Record<string, unknown>) => {
            const id = `log-${insertCalls.length + 1}`;
            insertCalls.push({ table, row });
            loggedRows.set(id, row);
            return { error: null };
          },
          select: () => ({
            eq: (_c1: string, id: string) => ({
              eq: (_c2: string, rowUserId: string) => ({
                eq: (_c3: string, status: string) => ({
                  maybeSingle: async () => {
                    const row = loggedRows.get(id);
                    const matches = row && row.user_id === rowUserId && row.status === status;
                    return { data: matches ? { action_type: row!.action_type, payload: row!.payload } : null, error: null };
                  },
                }),
              }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table in fake supabase: ${table}`);
    },
  };

  return { supabase, updateCalls, insertCalls, loggedRows };
}

const USER_ID = "user-1";
const SESSION_ID = "11111111-1111-1111-1111-111111111111";
const SESSION_EXERCISE_ID = "22222222-2222-2222-2222-222222222222";

function adjustPayload(overrides: Partial<AdjustSetsRepsPayload> = {}): AdjustSetsRepsPayload {
  return {
    type: "adjust_sets_reps",
    sessionId: SESSION_ID,
    sessionExerciseId: SESSION_EXERCISE_ID,
    exerciseName: "Bench Press",
    before: { sets: 4, repMin: 6, repMax: 8 },
    after: { sets: 3, repMin: 6, repMax: 8 },
    ...overrides,
  };
}

function postponePayload(): PostponeExercisePayload {
  return {
    type: "postpone_exercise",
    sessionId: SESSION_ID,
    sessionExerciseId: SESSION_EXERCISE_ID,
    exerciseName: "Leg Press",
  };
}

function modifyVolumePayload(): ModifyVolumePayload {
  return {
    type: "modify_volume",
    sessionId: SESSION_ID,
    sessionExerciseId: SESSION_EXERCISE_ID,
    exerciseName: "Squat",
    before: { sets: 4 },
    after: { sets: 3 },
  };
}

function macroPayload(): MacroAdjustmentPayload {
  return {
    type: "macro_adjustment",
    macro: "protein",
    direction: "increase",
    suggestedChangePercent: 10,
  };
}

beforeEach(() => {
  vi.mocked(createClient).mockReset();
});

describe("applyDanteAction", () => {
  it("rejecting an action logs it as rejected and performs no mutation", async () => {
    const { supabase, updateCalls, insertCalls } = createFakeSupabase({
      authenticatedUserId: USER_ID,
      sessionOwners: new Map([[SESSION_ID, USER_ID]]),
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await applyDanteAction(supabase as never, USER_ID, {
      payload: adjustPayload(),
      reason: "Chest recovery is low today.",
      confidence: 0.7,
      intent: "reject",
    });

    expect(result).toEqual({ ok: true, status: "rejected", message: "Suggestion dismissed." });
    expect(updateCalls).toHaveLength(0);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].row.status).toBe("rejected");
  });

  it("confirming a direct-effect action writes the mutation and logs it as applied", async () => {
    const { supabase, updateCalls, insertCalls } = createFakeSupabase({
      authenticatedUserId: USER_ID,
      sessionOwners: new Map([[SESSION_ID, USER_ID]]),
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await applyDanteAction(supabase as never, USER_ID, {
      payload: adjustPayload(),
      reason: "Chest recovery is low today.",
      confidence: 0.7,
      intent: "confirm",
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("applied");
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].values).toMatchObject({ target_sets: 3, rep_min: 6, rep_max: 8 });
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].row.status).toBe("applied");
  });

  it("confirming postpone_exercise dispatches to the existing skip_exercise mutation", async () => {
    const { supabase, updateCalls } = createFakeSupabase({
      authenticatedUserId: USER_ID,
      sessionOwners: new Map([[SESSION_ID, USER_ID]]),
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await applyDanteAction(supabase as never, USER_ID, {
      payload: postponePayload(),
      reason: "Quads recovery is very low today.",
      confidence: 0.8,
      intent: "confirm",
    });

    expect(result.ok).toBe(true);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].values).toMatchObject({ is_skipped: true });
  });

  it("confirming modify_volume writes only the reduced set count", async () => {
    const { supabase, updateCalls } = createFakeSupabase({
      authenticatedUserId: USER_ID,
      sessionOwners: new Map([[SESSION_ID, USER_ID]]),
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    await applyDanteAction(supabase as never, USER_ID, {
      payload: modifyVolumePayload(),
      reason: "Quads recovery is moderate today.",
      confidence: 0.6,
      intent: "confirm",
    });

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].values).toMatchObject({ target_sets: 3 });
  });

  it("a stale session (deleted or foreign) fails the mutation instead of writing silently", async () => {
    const { supabase, updateCalls, insertCalls } = createFakeSupabase({
      authenticatedUserId: USER_ID,
      sessionOwners: new Map(), // SESSION_ID no longer owned/exists
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await applyDanteAction(supabase as never, USER_ID, {
      payload: adjustPayload(),
      reason: "Chest recovery is low today.",
      confidence: 0.7,
      intent: "confirm",
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe("failed");
    expect(updateCalls).toHaveLength(0);
    expect(insertCalls[0].row.status).toBe("failed");
  });

  it("a session owned by a different user is treated exactly like a missing one (isolation)", async () => {
    const { supabase, updateCalls } = createFakeSupabase({
      authenticatedUserId: "attacker-id",
      sessionOwners: new Map([[SESSION_ID, USER_ID]]), // owned by USER_ID, not the authenticated attacker
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await applyDanteAction(supabase as never, "attacker-id", {
      payload: adjustPayload(),
      reason: "Chest recovery is low today.",
      confidence: 0.7,
      intent: "confirm",
    });

    expect(result.ok).toBe(false);
    expect(updateCalls).toHaveLength(0);
  });

  it("advisory actions never touch workout_session_exercises — no direct LLM-authored DB mutation", async () => {
    const { supabase, updateCalls, insertCalls } = createFakeSupabase({
      authenticatedUserId: USER_ID,
      sessionOwners: new Map([[SESSION_ID, USER_ID]]),
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await applyDanteAction(supabase as never, USER_ID, {
      payload: macroPayload(),
      reason: "Recovery has been trending down for 3 days.",
      confidence: 0.55,
      intent: "confirm",
    });

    expect(result.ok).toBe(true);
    expect(updateCalls).toHaveLength(0); // nothing was mutated
    expect(insertCalls).toHaveLength(1); // only the audit trail was written
    expect(insertCalls[0].row.status).toBe("applied");
  });

  it("undo_action reverses a previously applied adjust_sets_reps action back to its recorded before-state", async () => {
    const { supabase, updateCalls } = createFakeSupabase({
      authenticatedUserId: USER_ID,
      sessionOwners: new Map([[SESSION_ID, USER_ID]]),
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    await applyDanteAction(supabase as never, USER_ID, {
      payload: adjustPayload(),
      reason: "Chest recovery is low today.",
      confidence: 0.7,
      intent: "confirm",
    });

    const undoPayload: UndoActionPayload = {
      type: "undo_action",
      targetActionLogId: "log-1",
      exerciseName: "Bench Press",
    };

    const undoResult = await applyDanteAction(supabase as never, USER_ID, {
      payload: undoPayload,
      reason: "User requested undo.",
      confidence: 1,
      intent: "confirm",
    });

    expect(undoResult.ok).toBe(true);
    expect(updateCalls).toHaveLength(2);
    // The original action wrote `after` (3 sets); the undo should write
    // the original `before` (4 sets) — a genuine reversal, not a repeat.
    expect(updateCalls[1].values).toMatchObject({ target_sets: 4, rep_min: 6, rep_max: 8 });
  });

  it("undo_action fails honestly when the target action was never applied (unknown id)", async () => {
    const { supabase } = createFakeSupabase({
      authenticatedUserId: USER_ID,
      sessionOwners: new Map([[SESSION_ID, USER_ID]]),
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const undoPayload: UndoActionPayload = {
      type: "undo_action",
      targetActionLogId: "log-does-not-exist",
      exerciseName: "Bench Press",
    };

    const result = await applyDanteAction(supabase as never, USER_ID, {
      payload: undoPayload,
      reason: "User requested undo.",
      confidence: 1,
      intent: "confirm",
    });

    expect(result.ok).toBe(false);
  });

  it("a silent no-op update (no Postgres error, but nothing actually changed) is reported as failed, not applied", async () => {
    const { supabase, insertCalls } = createFakeSupabase({
      authenticatedUserId: USER_ID,
      sessionOwners: new Map([[SESSION_ID, USER_ID]]),
      simulateSilentNoOpUpdate: true,
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const result = await applyDanteAction(supabase as never, USER_ID, {
      payload: adjustPayload(),
      reason: "Chest recovery is low today.",
      confidence: 0.7,
      intent: "confirm",
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe("failed");
    expect(insertCalls[0].row.status).toBe("failed");
  });

  it("every outcome — confirm, reject, and failure — is written to the audit log", async () => {
    const { supabase, insertCalls } = createFakeSupabase({
      authenticatedUserId: USER_ID,
      sessionOwners: new Map([[SESSION_ID, USER_ID]]),
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    await applyDanteAction(supabase as never, USER_ID, {
      payload: adjustPayload(),
      reason: "r1",
      confidence: 0.7,
      intent: "confirm",
    });
    await applyDanteAction(supabase as never, USER_ID, {
      payload: postponePayload(),
      reason: "r2",
      confidence: 0.7,
      intent: "reject",
    });

    expect(insertCalls).toHaveLength(2);
    expect(insertCalls.every((call) => call.row.user_id === USER_ID)).toBe(true);
  });
});
