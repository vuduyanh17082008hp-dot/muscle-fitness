import { describe, expect, it, vi } from "vitest"

import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context"
import { getCanonicalNutritionTargets } from "@/lib/nutrition/targets"

type Row = Record<string, unknown> | null

/** Minimal PostgREST stand-in: every query resolves to that table's single row. */
function fakeSupabase(rows: { profiles: Row; fitness_profiles: Row; user_preferences: Row }) {
  return {
    from(table: keyof typeof rows) {
      const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: rows[table], error: null }) }
      return query
    },
  } as unknown as Parameters<typeof loadNutritionContext>[0]
}

const plan = { calories: 2600, protein: 180, carbs: 300, fat: 75 }

describe("PF-03 getCanonicalNutritionTargets", () => {
  it("legacy column only: falls back to calorie_target / carb_target_g", () => {
    const t = getCanonicalNutritionTargets({
      stored: { calorie_target: 2400, protein_target_g: 160, carb_target_g: 250, fat_target_g: 70 },
    })
    expect(t).toMatchObject({ calories: 2400, protein: 160, carbs: 250, fat: 70, source: "STORED" })
    expect(t.diagnostics).toEqual([])
  })

  it("new column only: the reported case (calorie_target null, calories_target 2740)", () => {
    const t = getCanonicalNutritionTargets({
      stored: { calorie_target: null, calories_target: 2740, protein_target_g: 170, carbs_target_g: 320, fat_target_g: 80 },
    })
    expect(t).toMatchObject({ calories: 2740, protein: 170, carbs: 320, fat: 80, source: "STORED" })
    expect(t.complete).toEqual({ calories: 2740, protein: 170, carbs: 320, fat: 80 })
    expect(t.diagnostics).toEqual([])
  })

  it("both present and different: app-written column wins and the conflict is reported", () => {
    const t = getCanonicalNutritionTargets({
      stored: { calories_target: 2740, calorie_target: 2000, carbs_target_g: 320, carb_target_g: 200 },
    })
    expect(t.calories).toBe(2740)
    expect(t.carbs).toBe(320)
    expect(t.diagnostics).toEqual([
      "STORED_COLUMN_CONFLICT:calories calories_target=2740 calorie_target=2000 using=calories_target",
      "STORED_COLUMN_CONFLICT:carbs carbs_target_g=320 carb_target_g=200 using=carbs_target_g",
    ])
  })

  it("both present and equal: no diagnostic", () => {
    const t = getCanonicalNutritionTargets({ stored: { calories_target: 2740, calorie_target: 2740 } })
    expect(t.calories).toBe(2740)
    expect(t.diagnostics).toEqual([])
  })

  it("both null: NONE with every field null, never a default", () => {
    for (const stored of [null, {}, { calories_target: null, calorie_target: null }, { calories_target: 0, calorie_target: "" }]) {
      expect(getCanonicalNutritionTargets({ stored })).toEqual({
        calories: null, protein: null, carbs: null, fat: null, source: "NONE", complete: null, diagnostics: [],
      })
    }
  })

  it("protein/carbs/fat parity: all four fields come from the same source as calories", () => {
    const fromPlan = getCanonicalNutritionTargets({
      planTarget: plan,
      stored: { calories_target: 2740, protein_target_g: 999, carbs_target_g: 999, fat_target_g: 999 },
    })
    expect(fromPlan).toMatchObject({ ...plan, source: "PLAN" })
    expect(fromPlan.complete).toEqual(plan)

    const fromStored = getCanonicalNutritionTargets({
      stored: { calories_target: 2740, protein_target_g: 170, carbs_target_g: 320, fat_target_g: 80 },
    })
    expect(fromStored.complete).toEqual({ calories: 2740, protein: 170, carbs: 320, fat: 80 })
  })

  it("plan beats stored, and the disagreement is not silent", () => {
    const t = getCanonicalNutritionTargets({ planTarget: plan, stored: { calories_target: 2740 } })
    expect(t.calories).toBe(2600)
    expect(t.diagnostics).toEqual(["PLAN_STORED_MISMATCH:calories plan=2600 stored=2740 using=plan"])
  })

  it("a partially stored target is not reported as complete", () => {
    const t = getCanonicalNutritionTargets({ stored: { protein_target_g: "170" } })
    expect(t).toMatchObject({ calories: null, protein: 170, source: "STORED", complete: null })
  })
})

describe("PF-03 loadNutritionContext exposes the one canonical target", () => {
  const stored = { calorie_target: null, calories_target: 2740, protein_target_g: 170, carbs_target_g: 320, fat_target_g: 80 }

  it("with a computable plan: targets ARE the plan target (what Today, Gemma, the optimizer and Athlete State read)", async () => {
    const ctx = await loadNutritionContext(
      fakeSupabase({
        profiles: { gender: "male", date_of_birth: "1996-01-01" },
        fitness_profiles: { height_cm: 178, weight_kg: 80, goal: "muscle_gain", training_days: 4, priority_muscles: [], ...stored },
        user_preferences: null,
      }),
      "u1",
    )
    expect(ctx.plan).not.toBeNull()
    expect(ctx.targets.source).toBe("PLAN")
    expect(ctx.targets.complete).toEqual({
      calories: ctx.plan!.target.calories,
      protein: ctx.plan!.target.protein,
      carbs: ctx.plan!.target.carbs,
      fat: ctx.plan!.target.fat,
    })
  })

  it("without a computable plan: falls back to the stored row and logs nothing for a clean row", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const ctx = await loadNutritionContext(
      fakeSupabase({ profiles: null, fitness_profiles: stored, user_preferences: null }),
      "u1",
    )
    expect(ctx.plan).toBeNull()
    expect(ctx.targets).toMatchObject({ calories: 2740, protein: 170, carbs: 320, fat: 80, source: "STORED" })
    expect(warn.mock.calls.filter((call) => String(call[0]).includes("target conflict"))).toEqual([])
    warn.mockRestore()
  })

  it("conflicting stored columns are logged, not silently resolved", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const ctx = await loadNutritionContext(
      fakeSupabase({ profiles: null, fitness_profiles: { ...stored, calorie_target: 2000 }, user_preferences: null }),
      "u1",
    )
    expect(ctx.targets.calories).toBe(2740)
    expect(warn).toHaveBeenCalledWith("[NUTRITION] target conflict:", expect.stringContaining("STORED_COLUMN_CONFLICT:calories"))
    warn.mockRestore()
  })
})
