import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadFoodLogForDate,
  mapFoodLogRow,
  resolveLocalToday,
  type FoodLogRow,
} from "@/lib/nutrition/food-log/load-food-log-context";

/**
 * Test 9 (schema-drift repair): the nutrition repository must query
 * the CANONICAL table (`food_logs`, matching
 * supabase/migrations/20260914090000_food_logs.sql, now applied) and
 * must never crash the caller if that table is ever unavailable
 * again — it should degrade to an empty log, not throw.
 */

function fakeSupabase(tableName: string, result: { data: unknown; error: { message: string } | null }) {
  const fromSpy = vi.fn((table: string) => {
    if (table !== tableName) {
      // Simulates exactly the original bug: querying a table that
      // doesn't exist / isn't the one this fake is configured to
      // serve.
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () =>
                Promise.resolve({
                  data: null,
                  error: { message: `Could not find the table 'public.${table}' in the schema cache` },
                }),
            }),
          }),
        }),
      };
    }

    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => Promise.resolve(result),
          }),
        }),
      }),
    };
  });

  return { from: fromSpy } as unknown as Parameters<typeof loadFoodLogForDate>[0];
}

describe("loadFoodLogForDate — queries the correct canonical table", () => {
  it("queries 'food_logs', not an obsolete/wrong table name", async () => {
    const supabase = fakeSupabase("food_logs", { data: [], error: null });
    await loadFoodLogForDate(supabase, "user-1", "2026-01-01");

    expect((supabase.from as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("food_logs");
  });

  it("maps real food_logs rows into FoodLogEntry correctly", async () => {
    const row: FoodLogRow = {
      id: "row-1",
      log_date: "2026-01-01",
      meal_type: "lunch",
      food_name: "Chicken Rice",
      brand: null,
      source: "ai_estimate",
      source_id: null,
      barcode: null,
      quantity_grams: 350,
      serving_name: null,
      servings_consumed: null,
      calories: 680,
      protein_g: 42,
      carbs_g: 76,
      fat_g: 25,
      fiber_g: null,
      is_estimated: true,
      estimation_confidence: "medium",
      estimation_reason: "HawkerLens scan",
      estimated_from: null,
      created_at: "2026-01-01T12:00:00Z",
    };

    const supabase = fakeSupabase("food_logs", { data: [row], error: null });
    const context = await loadFoodLogForDate(supabase, "user-1", "2026-01-01");

    expect(context.entries).toHaveLength(1);
    expect(context.entries[0].foodName).toBe("Chicken Rice");
    expect(context.totals.calories).toBe(680);
  });
});

describe("loadFoodLogForDate — graceful degradation (never crashes the caller)", () => {
  it("returns an empty, valid context instead of throwing if the table is unavailable", async () => {
    const supabase = fakeSupabase("food_logs", {
      data: null,
      error: { message: "Could not find the table 'public.food_logs' in the schema cache" },
    });

    const context = await loadFoodLogForDate(supabase, "user-1", "2026-01-01");

    expect(context.entries).toEqual([]);
    expect(context.totals.calories).toBe(0);
  });

  it("never throws even under the exact original bug condition (missing table error)", async () => {
    const supabase = fakeSupabase("nutrition_logs", { data: [], error: null }); // wrong table configured -> simulates drift

    await expect(loadFoodLogForDate(supabase, "user-1", "2026-01-01")).resolves.not.toThrow();
  });
});

function fakeSupabaseWithProfile(timezone: string | null) {
  const fromSpy = vi.fn((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: timezone === null ? null : { timezone }, error: null }),
          }),
        }),
      };
    }

    if (table === "food_logs") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        }),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return { from: fromSpy } as unknown as Parameters<typeof loadFoodLogForDate>[0];
}

describe("resolveLocalToday — local-day resolution via the persisted profile timezone", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves Sep 14 local for Asia/Singapore even though UTC is still Sep 13 (Test G)", async () => {
    vi.setSystemTime(new Date("2026-09-13T17:00:00.000Z"));
    const supabase = fakeSupabaseWithProfile("Asia/Singapore");

    await expect(resolveLocalToday(supabase, "user-1")).resolves.toBe("2026-09-14");
  });

  it("falls back to UTC when the profile has no timezone set", async () => {
    vi.setSystemTime(new Date("2026-09-13T17:00:00.000Z"));
    const supabase = fakeSupabaseWithProfile(null);

    await expect(resolveLocalToday(supabase, "user-1")).resolves.toBe("2026-09-13");
  });
});

describe("loadFoodLogForDate — auto-resolves the local day when no date is given", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("queries the user's LOCAL today, not UTC today, when the caller omits the date (Test H)", async () => {
    vi.setSystemTime(new Date("2026-09-13T17:00:00.000Z"));
    const supabase = fakeSupabaseWithProfile("Asia/Singapore");

    const context = await loadFoodLogForDate(supabase, "user-1");

    expect(context.date).toBe("2026-09-14");
  });
});

describe("mapFoodLogRow", () => {
  it("never fabricates a numeric value — nulls stay null", () => {
    const row: FoodLogRow = {
      id: "row-2",
      log_date: "2026-01-01",
      meal_type: "snack",
      food_name: "Apple",
      brand: null,
      source: "usda",
      source_id: null,
      barcode: null,
      quantity_grams: 150,
      serving_name: null,
      servings_consumed: null,
      calories: 78,
      protein_g: 0.4,
      carbs_g: 21,
      fat_g: 0.3,
      fiber_g: null,
      is_estimated: false,
      estimation_confidence: null,
      estimation_reason: null,
      estimated_from: null,
      created_at: "2026-01-01T08:00:00Z",
    };

    const entry = mapFoodLogRow(row);
    expect(entry.fiberG).toBeNull();
    expect(entry.estimationConfidence).toBeNull();
  });
});
