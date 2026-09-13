import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

/**
 * Covers the pending-action lifecycle (Part 8/9, Test Matrix F/G/H/I/J):
 *  F. CONFIRM -> exactly one persisted mutation
 *  G. double CONFIRM -> no duplicate
 *  H. CANCEL -> no mutation
 *  I. expired confirmation -> rejected
 *  J. another user's actionId -> rejected
 *
 * lib/dante-core/tools/registry.ts is mocked so these tests exercise
 * ONLY the atomic claim/execute/cancel logic in pending-actions.ts,
 * against a small in-memory fake of the `dante_tool_actions` table
 * (same style of hand-built Supabase mock as
 * lib/dante-core/actions/__tests__/apply-action.test.ts).
 */

const fakeWriteTool = {
  name: "fake_write",
  description: "fake",
  inputSchema: z.object({ amount: z.number() }).strict(),
  mode: "write" as const,
  risk: "low" as const,
  requiresConfirmation: true,
  summarize: (input: { amount: number }) => `Do the fake write of ${input.amount}`,
  execute: vi.fn(async (_context: unknown, input: { amount: number }) => ({ ok: true as const, data: { received: input.amount } })),
};

vi.mock("@/lib/dante-core/tools/registry", () => ({
  getDanteTool: (name: string) => (name === "fake_write" ? fakeWriteTool : undefined),
}));

import { cancelPendingAction, confirmPendingAction, createPendingAction } from "@/lib/dante-core/tools/pending-actions";

type Row = {
  id: string;
  user_id: string;
  tool_name: string;
  status: string;
  args: unknown;
  summary: string;
  result: unknown;
  created_at: string;
  expires_at: string;
  executed_at: string | null;
};

function matchesFilters(row: Row, filters: Array<[string, "eq" | "gt", unknown]>): boolean {
  return filters.every(([column, op, value]) => {
    const rowValue = (row as unknown as Record<string, unknown>)[column];
    return op === "eq" ? rowValue === value : (rowValue as string) > (value as string);
  });
}

function createFakeSupabase() {
  const rows: Row[] = [];
  let counter = 0;

  function from(table: string) {
    if (table !== "dante_tool_actions") {
      throw new Error(`Unexpected table: ${table}`);
    }

    return {
      insert(values: Partial<Row>) {
        counter += 1;
        const row: Row = {
          id: `action-${counter}`,
          result: null,
          executed_at: null,
          created_at: new Date().toISOString(),
          ...values,
        } as Row;
        rows.push(row);

        return {
          select: () => ({
            single: async () => ({ data: { ...row }, error: null }),
          }),
        };
      },

      update(values: Partial<Row>) {
        const filters: Array<[string, "eq" | "gt", unknown]> = [];

        const builder = {
          eq(column: string, value: unknown) {
            filters.push([column, "eq", value]);
            return builder;
          },
          gt(column: string, value: unknown) {
            filters.push([column, "gt", value]);
            return builder;
          },
          select() {
            return {
              maybeSingle: async () => {
                const target = rows.find((row) => matchesFilters(row, filters));
                if (!target) return { data: null, error: null };
                Object.assign(target, values);
                return { data: { ...target }, error: null };
              },
            };
          },
          then(resolve: (value: { error: null }) => unknown, reject?: (reason: unknown) => unknown) {
            const target = rows.find((row) => matchesFilters(row, filters));
            if (target) Object.assign(target, values);
            return Promise.resolve({ error: null }).then(resolve, reject);
          },
        };

        return builder;
      },

      select(_columns?: string) {
        const filters: Array<[string, "eq" | "gt", unknown]> = [];

        const builder = {
          eq(column: string, value: unknown) {
            filters.push([column, "eq", value]);
            return builder;
          },
          maybeSingle: async () => {
            const target = rows.find((row) => matchesFilters(row, filters));
            return { data: target ? { ...target } : null, error: null };
          },
        };

        return builder;
      },
    };
  }

  return { from, rows };
}

const USER_A = "user-aaaa";
const USER_B = "user-bbbb";

describe("pending Dante tool actions", () => {
  beforeEach(() => {
    fakeWriteTool.execute.mockClear();
  });

  it("CONFIRM runs the underlying tool exactly once (Test F)", async () => {
    const supabase = createFakeSupabase();
    const now = new Date("2026-09-13T10:00:00.000Z");

    const pending = await createPendingAction(supabase as never, USER_A, "fake_write", { amount: 5 }, "Do the fake write of 5", now);

    const outcome = await confirmPendingAction(supabase as never, { supabase: supabase as never, userId: USER_A, now }, pending.actionId);

    expect(outcome.ok).toBe(true);
    expect(fakeWriteTool.execute).toHaveBeenCalledTimes(1);

    const row = supabase.rows.find((r) => r.id === pending.actionId)!;
    expect(row.status).toBe("executed");
  });

  it("a second CONFIRM on the same action is a no-op — no duplicate execution (Test G)", async () => {
    const supabase = createFakeSupabase();
    const now = new Date("2026-09-13T10:00:00.000Z");

    const pending = await createPendingAction(supabase as never, USER_A, "fake_write", { amount: 5 }, "Do the fake write of 5", now);
    const context = { supabase: supabase as never, userId: USER_A, now };

    const first = await confirmPendingAction(supabase as never, context, pending.actionId);
    const second = await confirmPendingAction(supabase as never, context, pending.actionId);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(fakeWriteTool.execute).toHaveBeenCalledTimes(1);
  });

  it("CANCEL leaves the underlying tool never called (Test H)", async () => {
    const supabase = createFakeSupabase();
    const now = new Date("2026-09-13T10:00:00.000Z");

    const pending = await createPendingAction(supabase as never, USER_A, "fake_write", { amount: 5 }, "Do the fake write of 5", now);

    const outcome = await cancelPendingAction(supabase as never, USER_A, pending.actionId);

    expect(outcome.ok).toBe(true);
    expect(fakeWriteTool.execute).not.toHaveBeenCalled();

    // A CONFIRM after CANCEL must also fail — the CAS only ever leaves 'pending'.
    const confirmAfterCancel = await confirmPendingAction(supabase as never, { supabase: supabase as never, userId: USER_A, now }, pending.actionId);
    expect(confirmAfterCancel.ok).toBe(false);
    expect(fakeWriteTool.execute).not.toHaveBeenCalled();
  });

  it("an expired confirmation is rejected and never executes (Test I)", async () => {
    const supabase = createFakeSupabase();
    const createdAt = new Date("2026-09-13T10:00:00.000Z");
    const wayLater = new Date("2026-09-13T10:30:00.000Z"); // past the 10-minute TTL

    const pending = await createPendingAction(supabase as never, USER_A, "fake_write", { amount: 5 }, "Do the fake write of 5", createdAt);

    const outcome = await confirmPendingAction(supabase as never, { supabase: supabase as never, userId: USER_A, now: wayLater }, pending.actionId);

    expect(outcome.ok).toBe(false);
    expect(outcome.status).toBe("expired");
    expect(fakeWriteTool.execute).not.toHaveBeenCalled();
  });

  it("another user's actionId is rejected, never executes, and never confirms/denies existence (Test J)", async () => {
    const supabase = createFakeSupabase();
    const now = new Date("2026-09-13T10:00:00.000Z");

    const pending = await createPendingAction(supabase as never, USER_A, "fake_write", { amount: 5 }, "Do the fake write of 5", now);

    const outcome = await confirmPendingAction(supabase as never, { supabase: supabase as never, userId: USER_B, now }, pending.actionId);

    expect(outcome.ok).toBe(false);
    expect(outcome.status).toBe("not_found");
    expect(fakeWriteTool.execute).not.toHaveBeenCalled();

    const cancelAsOtherUser = await cancelPendingAction(supabase as never, USER_B, pending.actionId);
    expect(cancelAsOtherUser.ok).toBe(false);

    // The real action is untouched and still confirmable by its actual owner.
    const confirmByOwner = await confirmPendingAction(supabase as never, { supabase: supabase as never, userId: USER_A, now }, pending.actionId);
    expect(confirmByOwner.ok).toBe(true);
  });
});
