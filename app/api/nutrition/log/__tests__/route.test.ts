import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/nutrition/food-log/load-food-log-context", () => ({
  loadFoodLogForDate: vi.fn().mockResolvedValue({ entries: [], totals: {} }),
  resolveLocalToday: vi.fn().mockResolvedValue("2026-09-15"),
}));
vi.mock("@/lib/nutrition/food-log/mutations", () => ({ createFoodLog: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { loadFoodLogForDate } from "@/lib/nutrition/food-log/load-food-log-context";
import { createFoodLog } from "@/lib/nutrition/food-log/mutations";
import { GET, POST } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClient).mockResolvedValue({ auth: {
    getUser: async () => ({ data: { user: { id: "owner" } } }),
  } } as unknown as Awaited<ReturnType<typeof createClient>>);
});

describe("food log calendar validation", () => {
  it("returns 503 when authoritative totals cannot be loaded", async () => {
    vi.mocked(loadFoodLogForDate).mockResolvedValueOnce({ date: "2026-09-15", entries: [], totals: { calories: 0, protein: 0, carbs: 0, fat: 0 }, unavailable: true });
    const response = await GET(new Request("http://localhost/api/nutrition/log"));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false });
  });
  it.each(["2026-02-30", "2026-13-01", "not-a-date", ""])("rejects GET date %s without querying food logs", async (date) => {
    const response = await GET(new Request(`http://localhost/api/nutrition/log?date=${date}`));
    expect(response.status).toBe(400);
    expect(loadFoodLogForDate).not.toHaveBeenCalled();
  });

  it("accepts leap day and scopes reads to the authenticated user", async () => {
    expect((await GET(new Request("http://localhost/api/nutrition/log?date=2024-02-29"))).status).toBe(200);
    expect(loadFoodLogForDate).toHaveBeenCalledWith(expect.anything(), "owner", "2024-02-29");
  });

  it("rejects impossible POST dates before persisting", async () => {
    const response = await POST(new Request("http://localhost/api/nutrition/log", { method: "POST", body: JSON.stringify({
      mealType: "lunch", foodName: "Manual food", source: "user_provided",
      per100g: { calories: 100, protein: 10, carbs: 10, fat: 2 }, quantityGrams: 100,
      logDate: "2026-02-29",
    }) }));
    expect(response.status).toBe(400);
    expect(createFoodLog).not.toHaveBeenCalled();
  });
});
