import { describe, expect, it, vi } from "vitest";

import { forgetTechniquePattern, loadSurfaceableTechniquePatterns } from "@/lib/dante-core/memory-hierarchy/load-technique-patterns";
import { MIN_SAMPLES_FOR_TECHNIQUE_PATTERN, TECHNIQUE_PATTERN_SURFACE_CONFIDENCE } from "@/lib/dante-core/memory-hierarchy/technique-pattern-types";

type Row = {
  id: string;
  user_id: string;
  exercise: string;
  signal_type: string;
  direction: string;
  status: string;
  sample_count: number;
  notable_count: number;
  confidence: number;
  summary: string;
  first_observed_at: string;
  last_reinforced_at: string;
};

const NOW = new Date("2026-09-14T12:00:00.000Z");

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: "pattern-1",
    user_id: "user-1",
    exercise: "squat",
    signal_type: "rom_consistency",
    direction: "below_baseline",
    status: "active",
    sample_count: 5,
    notable_count: 4,
    confidence: 0.8,
    summary: "test summary",
    first_observed_at: NOW.toISOString(),
    last_reinforced_at: NOW.toISOString(),
    ...overrides,
  };
}

function createFakeSupabase(rows: Row[], error: { message: string } | null = null) {
  const seenUserIds: string[] = [];

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "dante_technique_patterns") {
        return {
          select: () => ({
            eq: (col1: string, v1: string) => {
              if (col1 === "user_id") seenUserIds.push(v1);
              return {
                eq: () => ({
                  order: () => ({
                    limit: async () => ({ data: error ? null : rows, error }),
                  }),
                }),
              };
            },
          }),
          delete: () => ({
            eq: (_c1: string, patternId: string) => ({
              eq: (_c2: string, userId: string) => {
                seenUserIds.push(userId);
                const found = rows.find((r) => r.id === patternId && r.user_id === userId);
                return Promise.resolve({ error: found ? null : { message: "not found" } });
              },
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  return { supabase, seenUserIds };
}

describe("loadSurfaceableTechniquePatterns", () => {
  it("returns an empty array (never throws) on a query error", async () => {
    const { supabase } = createFakeSupabase([], { message: "relation does not exist" });
    const patterns = await loadSurfaceableTechniquePatterns(supabase, "user-1", NOW);
    expect(patterns).toEqual([]);
  });

  it("surfaces a pattern that clears the evidence bar (test 8: retrieval includes legitimate technique info)", async () => {
    const { supabase } = createFakeSupabase([row({ confidence: 0.8, sample_count: 5, notable_count: 4 })]);
    const patterns = await loadSurfaceableTechniquePatterns(supabase, "user-1", NOW);

    expect(patterns).toHaveLength(1);
    expect(patterns[0]).toMatchObject({ exercise: "squat", signalType: "rom_consistency", direction: "below_baseline" });
  });

  it("never surfaces a pattern below the confidence bar, even if it exists in the table", async () => {
    const { supabase } = createFakeSupabase([row({ confidence: TECHNIQUE_PATTERN_SURFACE_CONFIDENCE - 0.05 })]);
    const patterns = await loadSurfaceableTechniquePatterns(supabase, "user-1", NOW);
    expect(patterns).toEqual([]);
  });

  it("never surfaces a pattern with fewer than the minimum sample count", async () => {
    const { supabase } = createFakeSupabase([
      row({ confidence: 0.9, sample_count: MIN_SAMPLES_FOR_TECHNIQUE_PATTERN - 1, notable_count: MIN_SAMPLES_FOR_TECHNIQUE_PATTERN - 1 }),
    ]);
    const patterns = await loadSurfaceableTechniquePatterns(supabase, "user-1", NOW);
    expect(patterns).toEqual([]);
  });

  it("applies time-based decay before filtering, so a stale-but-unreinforced pattern can drop below the bar", async () => {
    const staleDate = new Date(NOW.getTime() - 100 * 24 * 60 * 60 * 1000).toISOString(); // 100 days ago, past full decay
    const { supabase } = createFakeSupabase([
      row({ confidence: 0.6, last_reinforced_at: staleDate }),
    ]);
    const patterns = await loadSurfaceableTechniquePatterns(supabase, "user-1", NOW);
    expect(patterns).toEqual([]);
  });

  it("bounds the number of patterns returned even if more rows clear the bar", async () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      row({ id: `pattern-${i}`, exercise: "bench_press", signal_type: "tempo_consistency", direction: i % 2 === 0 ? "below_baseline" : "above_baseline", confidence: 0.9 }),
    );
    const { supabase } = createFakeSupabase(rows);
    const patterns = await loadSurfaceableTechniquePatterns(supabase, "user-1", NOW);
    expect(patterns.length).toBeLessThanOrEqual(3);
  });

  it("scopes the query to the calling user (test 9: no cross-user data)", async () => {
    const { supabase, seenUserIds } = createFakeSupabase([row()]);
    await loadSurfaceableTechniquePatterns(supabase, "user-42", NOW);
    expect(seenUserIds).toContain("user-42");
  });
});

describe("forgetTechniquePattern", () => {
  it("deletes a pattern scoped to the owning user", async () => {
    const { supabase } = createFakeSupabase([row({ id: "pattern-1", user_id: "user-1" })]);
    const result = await forgetTechniquePattern(supabase, "user-1", "pattern-1");
    expect(result).toEqual({ ok: true });
  });

  it("cannot delete another user's pattern (test 3: write isolation)", async () => {
    const { supabase } = createFakeSupabase([row({ id: "pattern-1", user_id: "victim-user" })]);
    const result = await forgetTechniquePattern(supabase, "attacker-user", "pattern-1");
    expect(result.ok).toBe(false);
  });
});
