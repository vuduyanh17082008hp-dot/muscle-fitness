import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/nutrition/load-nutrition-context", () => ({ loadNutritionContext: vi.fn() }));
vi.mock("@/lib/nutrition/food-log/load-food-log-context", () => ({ loadFoodLogForDate: vi.fn() }));
vi.mock("@/lib/dante-core/llm-client", () => ({ callDanteLlm: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/dante-core/server/load-readiness-for-user", () => ({
  loadReadinessForUser: vi.fn().mockResolvedValue({
    readiness: { readinessScore: 72 },
    recoveryContext: { todayScoreResult: { status: "ready" } },
  }),
}));

import { buildDailyIntelligence, getOrBuildDailyIntelligence } from "@/lib/dante-core/daily-intelligence";
import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context";
import { loadFoodLogForDate } from "@/lib/nutrition/food-log/load-food-log-context";

const NOW = new Date("2026-10-06T08:00:00.000Z");
const CACHED = {
  summary_date: "2026-10-06",
  readiness_score: 70,
  training_focus: "Upper",
  nutrition_adherence_percent: 80,
  recovery_status: "ready",
  narrative: "Performance conditions are favorable.",
  generated_at: "2026-10-06T01:00:00.000Z",
};

function client(cached: typeof CACHED | null) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    lte: () => chain,
    order: () => chain,
    // Today's open session, matching the cached training_focus (FINAL-F: the cached focus is re-read live).
    limit: async () => ({ data: [{ name: "Upper", session_state: "not_started" }], error: null }),
    maybeSingle: async () => ({ data: cached, error: null }),
    upsert: async () => ({ error: null }),
  };
  return {
    from(table: string) {
      if (table === "profiles") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { timezone: "UTC" }, error: null }) }) }) };
      return chain;
    },
  } as never;
}

const available = (calories: number) => ({ date: "2026-10-06", entries: [], totals: { calories, protein: 0, carbs: 0, fat: 0, fiber: 0 } });
const unavailable = { date: "2026-10-06", entries: [], totals: null, unavailable: true as const };

beforeEach(() => {
  vi.mocked(loadFoodLogForDate).mockReset();
  vi.mocked(loadNutritionContext).mockReset().mockResolvedValue({ targets: { calories: 2000 } } as never);
});

describe("Daily Intelligence nutrition adherence freshness", () => {
  it("valid fresh current intake → current-day percent", async () => {
    vi.mocked(loadFoodLogForDate).mockResolvedValue(available(1000) as never);
    const intel = await getOrBuildDailyIntelligence(client(CACHED), "u1", { now: NOW });
    expect(intel.nutritionAdherencePercent).toBe(50);
  });

  it("current read unavailable → cached 80% is NOT served as today's adherence", async () => {
    vi.mocked(loadFoodLogForDate).mockResolvedValue(unavailable as never);
    const intel = await getOrBuildDailyIntelligence(client(CACHED), "u1", { now: NOW });
    expect(intel.nutritionAdherencePercent).toBeNull();
    // recovery / training signals from the cache stay intact
    expect(intel.readinessScore).toBe(70);
    expect(intel.trainingFocus).toBe("Upper");
    expect(intel.recoveryStatus).toBe("ready");
  });

  it("cached value stale (log edited/deleted since generation) → live value wins", async () => {
    vi.mocked(loadFoodLogForDate).mockResolvedValue(available(400) as never);
    const intel = await getOrBuildDailyIntelligence(client(CACHED), "u1", { now: NOW });
    expect(intel.nutritionAdherencePercent).toBe(20);
  });

  it("nutrition loader throws → only the nutrition field degrades", async () => {
    vi.mocked(loadNutritionContext).mockRejectedValue(new Error("db down"));
    vi.mocked(loadFoodLogForDate).mockResolvedValue(available(1000) as never);
    const intel = await getOrBuildDailyIntelligence(client(CACHED), "u1", { now: NOW });
    expect(intel.nutritionAdherencePercent).toBeNull();
    expect(intel.readinessScore).toBe(70);
  });

  it("recovers once the current food-log read succeeds again", async () => {
    vi.mocked(loadFoodLogForDate).mockResolvedValueOnce(unavailable as never).mockResolvedValueOnce(available(1500) as never);
    expect((await getOrBuildDailyIntelligence(client(CACHED), "u1", { now: NOW })).nutritionAdherencePercent).toBeNull();
    expect((await getOrBuildDailyIntelligence(client(CACHED), "u1", { now: NOW })).nutritionAdherencePercent).toBe(75);
  });

  it("the cached narrative never states an intake percentage (it outlives edits and failed reads)", async () => {
    vi.mocked(loadFoodLogForDate).mockResolvedValue(available(1000) as never);
    const intel = await buildDailyIntelligence(client(null), "u1", { now: NOW });
    expect(intel.nutritionAdherencePercent).toBe(50);
    expect(intel.narrative).not.toMatch(/%|calorie target/i);
  });

  it("a row cached before the fix (narrative states intake) is not served as current after a failed read", async () => {
    vi.mocked(loadFoodLogForDate).mockResolvedValue(unavailable as never);
    for (const legacy of [
      "Performance conditions are favorable. Nutrition is at 80% of today's calorie target so far.",
      "Readiness looks solid — you're about 80% through today's calories, so fuel up after training.",
    ]) {
      const intel = await getOrBuildDailyIntelligence(client({ ...CACHED, narrative: legacy }), "u1", { now: NOW });
      expect(intel.narrative).not.toMatch(/%|calori/i);
      expect(intel.narrative).toBe("Performance conditions are favorable. Proceed with today's planned Upper session.");
    }
  });

  it("a clean cached narrative (training/recovery only) is served unchanged", async () => {
    vi.mocked(loadFoodLogForDate).mockResolvedValue(unavailable as never);
    const intel = await getOrBuildDailyIntelligence(client(CACHED), "u1", { now: NOW });
    expect(intel.narrative).toBe(CACHED.narrative);
  });

  it("unavailable intake never becomes 0%", async () => {
    vi.mocked(loadFoodLogForDate).mockResolvedValue(unavailable as never);
    const intel = await buildDailyIntelligence(client(null), "u1", { now: NOW });
    expect(intel.nutritionAdherencePercent).toBeNull();
    expect(intel.narrative).not.toMatch(/0%/);
  });
});
