import { expect, it, vi } from "vitest";
vi.mock("@/lib/nutrition/load-nutrition-context", () => ({ loadNutritionContext: vi.fn().mockResolvedValue({ plan: { target: { calories: 2000, protein: 140, carbs: 200, fat: 70 } } }) }));
vi.mock("@/lib/nutrition/food-log/load-food-log-context", () => ({ loadFoodLogForDate: vi.fn().mockResolvedValue({ unavailable: true, entries: [], totals: { calories: 0, protein: 0, carbs: 0, fat: 0 } }) }));
import { getNutritionStateTool } from "../read/get-nutrition-state";
import type { ToolContext } from "../types";

it("does not tell Dante the user ate zero when the authoritative food log failed", async () => {
  const result = await getNutritionStateTool.execute({ userId: "owner", now: new Date("2026-09-15T12:00:00Z"), supabase: {} as ToolContext["supabase"] }, {});
  expect(result).toEqual({ ok: false, error: "Food log is unavailable. Consumed and remaining nutrients cannot be determined." });
});
