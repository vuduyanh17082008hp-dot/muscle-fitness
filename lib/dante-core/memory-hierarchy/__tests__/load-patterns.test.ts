import { describe, expect, it } from "vitest";

import {
  forgetLearnedPattern,
  loadLearnedPatterns,
  setPatternRequiresConfirmation,
} from "@/lib/dante-core/memory-hierarchy/load-patterns";

/**
 * Cross-user isolation (mission Part 18) for the memory hierarchy's
 * only read/write paths. A fake table layer stands in for
 * Postgres/RLS, exactly like lib/dante-core/actions/__tests__/apply-action.test.ts —
 * these tests prove the CODE scopes every query by user_id, which is
 * the second, defense-in-depth layer on top of RLS itself.
 */

function createFakePatternsTable(rows: Array<{ id: string; user_id: string; status: string }>) {
  const deleteCalls: Array<{ id: string; userId: string }> = [];
  const updateCalls: Array<{ id: string; userId: string; values: Record<string, unknown> }> = [];
  const selectCalls: Array<{ id: string; userId: string }> = [];

  const supabase = {
    from(table: string) {
      if (table !== "dante_learned_patterns") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        select: () => ({
          eq: (col1: string, value1: string) => {
            // loadLearnedPatterns: .eq("user_id", userId).neq(...).order(...)
            if (col1 === "user_id") {
              return {
                neq: () => ({
                  order: async () => ({
                    data: rows
                      .filter((row) => row.user_id === value1 && row.status !== "forgotten")
                      .map((row) => ({
                        id: row.id,
                        user_id: row.user_id,
                        context_key: "poor_sleep",
                        intervention_type: "reduce_volume",
                        tier: "policy",
                        status: row.status,
                        sample_count: 8,
                        positive_count: 7,
                        confidence: 0.85,
                        summary: "summary",
                        first_observed_at: "2026-01-01T00:00:00.000Z",
                        last_reinforced_at: "2026-01-01T00:00:00.000Z",
                        requires_confirmation: false,
                      })),
                    error: null,
                  }),
                }),
              };
            }

            // forgetLearnedPattern ownership check:
            // .select("id").eq("id", patternId).eq("user_id", userId).maybeSingle()
            return {
              eq: (_col2: string, userId: string) => {
                selectCalls.push({ id: value1, userId });
                const owned = rows.find((row) => row.id === value1 && row.user_id === userId);
                return {
                  maybeSingle: async () => ({
                    data: owned ? { id: owned.id } : null,
                    error: null,
                  }),
                };
              },
            };
          },
        }),

        delete: () => ({
          eq: (_col1: string, id: string) => ({
            eq: (_col2: string, userId: string) => {
              const existed = rows.some((row) => row.id === id && row.user_id === userId);
              deleteCalls.push({ id, userId });
              return Promise.resolve({ error: existed ? null : null });
            },
          }),
        }),

        update: (values: Record<string, unknown>) => ({
          eq: (_col1: string, id: string) => ({
            eq: (_col2: string, userId: string) => {
              updateCalls.push({ id, userId, values });
              return Promise.resolve({ error: null });
            },
          }),
        }),
      };
    },
  };

  return { supabase, deleteCalls, updateCalls, selectCalls };
}

describe("loadLearnedPatterns — cross-user isolation", () => {
  it("only returns rows belonging to the requesting user", async () => {
    const { supabase } = createFakePatternsTable([
      { id: "p1", user_id: "user-a", status: "active" },
      { id: "p2", user_id: "user-b", status: "active" },
    ]);

    const patterns = await loadLearnedPatterns(supabase as never, "user-a");

    expect(patterns).toHaveLength(1);
    expect(patterns[0].id).toBe("p1");
  });

  it("excludes forgotten patterns even for the owning user", async () => {
    const { supabase } = createFakePatternsTable([{ id: "p1", user_id: "user-a", status: "forgotten" }]);

    const patterns = await loadLearnedPatterns(supabase as never, "user-a");
    expect(patterns).toHaveLength(0);
  });
});

describe("forgetLearnedPattern / setPatternRequiresConfirmation — cross-user isolation", () => {
  it("verifies ownership before delete and scopes both queries by user id", async () => {
    const { supabase, deleteCalls, selectCalls } = createFakePatternsTable([
      { id: "p1", user_id: "user-a", status: "active" },
    ]);

    const miss = await forgetLearnedPattern(supabase as never, "attacker", "p1");
    expect(miss).toEqual({ ok: false, error: "Pattern not found." });
    expect(selectCalls).toEqual([{ id: "p1", userId: "attacker" }]);
    expect(deleteCalls).toEqual([]);

    const hit = await forgetLearnedPattern(supabase as never, "user-a", "p1");
    expect(hit).toEqual({ ok: true });
    expect(deleteCalls).toEqual([{ id: "p1", userId: "user-a" }]);
  });

  it("scopes the update (ASK FIRST / KEEP) query by both pattern id and the requesting user id", async () => {
    const { supabase, updateCalls } = createFakePatternsTable([{ id: "p1", user_id: "user-a", status: "active" }]);

    await setPatternRequiresConfirmation(supabase as never, "user-a", "p1", true);

    expect(updateCalls).toEqual([
      { id: "p1", userId: "user-a", values: { requires_confirmation: true } },
    ]);
  });
});
