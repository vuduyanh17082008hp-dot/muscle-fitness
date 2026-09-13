import { describe, expect, it, vi } from "vitest";

import { loadSetVisionContext, type SetVisionAnalysisRow } from "../load-setvision-context";

type FakeSupabaseOptions = {
  rows?: SetVisionAnalysisRow[];
  error?: { message: string } | null;
};

function createFakeSupabase({ rows = [], error = null }: FakeSupabaseOptions) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          gte: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(async () => ({ data: error ? null : rows, error })),
            })),
          })),
        })),
      })),
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const NOW = new Date("2026-09-13T12:00:00.000Z");

function row(overrides: Partial<SetVisionAnalysisRow> = {}): SetVisionAnalysisRow {
  return {
    id: "row-1",
    exercise: "bench_press",
    reps: 8,
    rom_consistency: 0.9,
    tempo_consistency: 0.85,
    velocity_loss: 0.1,
    confidence: 0.8,
    analyzed_at: NOW.toISOString(),
    ...overrides,
  };
}

describe("loadSetVisionContext", () => {
  it("reports unavailable for a new user with zero analyses", async () => {
    const supabase = createFakeSupabase({ rows: [] });
    const context = await loadSetVisionContext(supabase, "user-1", { now: NOW });

    expect(context.available).toBe(false);
    expect(context.latest).toBeNull();
    expect(context.romConsistencyDeviation).toBeNull();
    expect(context.tempoConsistencyDeviation).toBeNull();
  });

  it("degrades gracefully (never throws) when the table/query errors", async () => {
    const supabase = createFakeSupabase({ error: { message: "relation does not exist" } });
    const context = await loadSetVisionContext(supabase, "user-1", { now: NOW });

    expect(context.available).toBe(false);
    expect(context.latest).toBeNull();
  });

  it("surfaces the most recent analysis and a real baseline deviation once enough history exists", async () => {
    const history = Array.from({ length: 6 }, (_, i) =>
      row({
        id: `history-${i}`,
        rom_consistency: 0.8,
        tempo_consistency: 0.8,
        analyzed_at: new Date(NOW.getTime() - (i + 1) * 24 * 60 * 60 * 1000).toISOString(),
      }),
    );
    const latest = row({ id: "latest", rom_consistency: 0.95, tempo_consistency: 0.6 });

    const supabase = createFakeSupabase({ rows: [latest, ...history] });
    const context = await loadSetVisionContext(supabase, "user-1", { now: NOW });

    expect(context.available).toBe(true);
    expect(context.latest?.id).toBe("latest");
    expect(context.analysesLast30Days).toBe(7);
    expect(context.romConsistencyDeviation?.baseline).toBe(0.8);
    expect(context.romConsistencyDeviation?.delta).toBeCloseTo(0.15, 5);
    expect(context.tempoConsistencyDeviation?.delta).toBeCloseTo(-0.2, 5);
  });

  it("does not compute a baseline deviation from a different exercise's history", async () => {
    const squatHistory = Array.from({ length: 6 }, (_, i) =>
      row({ id: `squat-${i}`, exercise: "squat", rom_consistency: 0.5 }),
    );
    const latest = row({ id: "latest", exercise: "bench_press", rom_consistency: 0.9 });

    const supabase = createFakeSupabase({ rows: [latest, ...squatHistory] });
    const context = await loadSetVisionContext(supabase, "user-1", { now: NOW });

    // Only 0 same-exercise (bench_press) history points exist, so no baseline should be formed.
    expect(context.romConsistencyDeviation?.baseline).toBeNull();
    expect(context.romConsistencyDeviation?.sampleCount).toBe(0);
  });
});
