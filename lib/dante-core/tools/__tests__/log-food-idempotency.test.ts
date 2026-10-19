import { beforeEach, describe, expect, it, vi } from "vitest";

const { createFoodLog } = vi.hoisted(() => ({ createFoodLog: vi.fn() }));

vi.mock("@/lib/nutrition/food-log/mutations", () => ({ createFoodLog }));

import { logFoodTool } from "@/lib/dante-core/tools/write/log-food";

const ACTION_A = "11111111-1111-4111-8111-111111111111";
const ACTION_B = "22222222-2222-4222-8222-222222222222";
const input = {
  mealType: "lunch" as const,
  foodName: "Chicken rice",
  quantityGrams: 300,
  per100g: { calories: 200, protein: 12, carbs: 25, fat: 6 },
  source: "ai_estimate" as const,
};

describe("Dante log_food idempotency", () => {
  beforeEach(() => {
    createFoodLog.mockReset();
    createFoodLog.mockResolvedValue({
      success: true,
      data: { id: "food-1", calories: 600, proteinG: 36 },
    });
  });

  it("uses the stable confirmed action UUID on every retry", async () => {
    const context = {
      supabase: {} as never,
      userId: "user-1",
      now: new Date(),
      actionId: ACTION_A,
    };

    await logFoodTool.execute(context, input);
    await logFoodTool.execute(context, input);

    expect(createFoodLog).toHaveBeenCalledTimes(2);
    expect(createFoodLog.mock.calls.map((call) => call[2].idempotencyKey)).toEqual([
      ACTION_A,
      ACTION_A,
    ]);
  });

  it("uses different keys for different confirmed actions for the same food", async () => {
    const base = { supabase: {} as never, userId: "user-1", now: new Date() };

    await logFoodTool.execute({ ...base, actionId: ACTION_A }, input);
    await logFoodTool.execute({ ...base, actionId: ACTION_B }, input);

    expect(createFoodLog.mock.calls.map((call) => call[2].idempotencyKey)).toEqual([
      ACTION_A,
      ACTION_B,
    ]);
  });

  it("keeps the same action key independently scoped by authenticated user", async () => {
    const base = { supabase: {} as never, now: new Date(), actionId: ACTION_A };

    await logFoodTool.execute({ ...base, userId: "user-1" }, input);
    await logFoodTool.execute({ ...base, userId: "user-2" }, input);

    expect(createFoodLog.mock.calls.map((call) => call[1])).toEqual(["user-1", "user-2"]);
  });

  it("cannot execute without a persisted confirmed action", async () => {
    const result = await logFoodTool.execute(
      { supabase: {} as never, userId: "user-1", now: new Date() },
      input,
    );

    expect(result.ok).toBe(false);
    expect(createFoodLog).not.toHaveBeenCalled();
  });
});
