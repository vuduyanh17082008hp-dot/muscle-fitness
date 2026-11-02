import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { evaluateCalorieCalibration, type CalibrationInput, type WeightReading } from "../calibration"
import { addDaysIso } from "../date-utils"
import {
  activityConsistencyNote,
  buildNutritionPlan,
  calculateMacroTargets,
  type ActivityLevel,
  type NutritionGoal,
  type NutritionInput,
  type TrainingMode,
} from "../plan"
import { mapProfileToNutritionInput } from "../profile-mapping"

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-02T04:00:00Z")) })
afterEach(() => vi.useRealTimers())

const REPORTED: NutritionInput = {
  sex: "male", age: 18, heightCm: 180, weightKg: 80, activityLevel: "super_active",
  trainingMode: "strength", goal: "lean_bulk", trainingDaysPerWeek: 4, mealsPerDay: 4,
  foodPreferences: [], excludedFoods: [], allergies: [],
}
const MODES: TrainingMode[] = ["general", "strength", "running", "hybrid", "hiit", "team_sport"]
const LEVELS: ActivityLevel[] = ["sedentary", "light", "moderate", "very_active", "super_active"]
const GOALS: NutritionGoal[] = ["fat_loss", "maintenance", "lean_bulk"]
const macroKcal = (t: { protein: number; carbs: number; fat: number }) => t.protein * 4 + t.carbs * 4 + t.fat * 9

describe("energy model — the reported 3,760 kcal plan", () => {
  it("1–2: is exactly Strength / Super Active (×1.9) / Lean Bulk (+7.5%), not Running / Very Active / Maintenance", () => {
    const plan = buildNutritionPlan(REPORTED)
    expect([plan.bmr, plan.pal, plan.maintenanceCalories]).toEqual([1840, 1.9, 3496])
    expect(plan.target).toMatchObject({ calories: 3760, protein: 160, carbs: 618, fat: 72 })
    // The "+8%" label was 7.5% rounded: 3496 × 0.075 = 262 kcal; 3758.2 rounds to 3760.
    expect(plan.goalAdjustmentPercent).toBe(0.075)
    expect(plan.goalAdjustmentKcal).toBe(262)

    // What the (stale) dropdowns showed gives a different, consistent plan.
    const shown = buildNutritionPlan({ ...REPORTED, trainingMode: "running", activityLevel: "very_active", goal: "maintenance" })
    expect([shown.pal, shown.maintenanceCalories, shown.target.calories, shown.goalAdjustmentKcal]).toEqual([1.725, 3174, 3170, 0])
  })

  it("3: maintenance never adds a surplus — target is maintenance rounded to 10 kcal", () => {
    for (const activityLevel of LEVELS) for (const trainingMode of MODES) {
      const plan = buildNutritionPlan({ ...REPORTED, activityLevel, trainingMode, goal: "maintenance" })
      expect(plan.goalAdjustmentPercent).toBe(0)
      expect(Math.abs(plan.target.calories - plan.maintenanceCalories)).toBeLessThanOrEqual(5)
    }
  })

  it("4: a legitimately high-activity user is not capped", () => {
    const big = calculateMacroTargets({ ...REPORTED, weightKg: 110, heightCm: 195, age: 24, goal: "maintenance" })
    expect(big.target.calories).toBe(Math.round(Math.round(Math.round(10 * 110 + 6.25 * 195 - 5 * 24 + 5) * 1.9) / 10) * 10)
    expect(big.target.calories).toBeGreaterThan(4000)
  })

  it("6–7: training style and training-day count never change calories (exercise counted once, in PAL)", () => {
    const base = calculateMacroTargets(REPORTED).target.calories
    for (const trainingMode of MODES) expect(calculateMacroTargets({ ...REPORTED, trainingMode }).target.calories).toBe(base)
    for (const trainingDaysPerWeek of [1, 3, 7]) expect(calculateMacroTargets({ ...REPORTED, trainingDaysPerWeek }).target.calories).toBe(base)
  })

  it("8: cut / maintenance / gain apply distinct, explicit adjustments", () => {
    const at = (goal: NutritionGoal) => buildNutritionPlan({ ...REPORTED, goal })
    expect(at("fat_loss").target.calories).toBe(Math.round(3496 * 0.85 / 10) * 10)
    expect(at("maintenance").target.calories).toBe(3500)
    expect(at("lean_bulk").target.calories).toBe(3760)
    expect(at("fat_loss").goalAdjustmentKcal).toBeLessThan(0)
    expect(at("lean_bulk").goalAdjustmentKcal).toBeGreaterThan(0)
  })

  it("9: macros add back up to the target (±2 kcal rounding), including an infeasible heavy-user budget", () => {
    for (const goal of GOALS) for (const trainingMode of MODES) for (const weightKg of [50, 80, 120]) {
      const { target } = calculateMacroTargets({ ...REPORTED, goal, trainingMode, weightKg, activityLevel: "sedentary" })
      expect(target.carbs).toBeGreaterThanOrEqual(0)
      expect(Math.abs(macroKcal(target) - target.calories)).toBeLessThanOrEqual(2)
    }
    // 120 kg, strength, sedentary cut: 240 g protein + 108 g fat (1932 kcal) used to exceed the 1610 target with carbs clamped to 0.
    const tight = calculateMacroTargets({ ...REPORTED, weightKg: 120, heightCm: 150, age: 80, sex: "female", activityLevel: "sedentary", goal: "fat_loss" })
    expect(tight.target.calories).toBe(1610)
    expect(tight.target.protein).toBe(240)
    expect(tight.target.fat).toBeGreaterThanOrEqual(60)
    expect(Math.abs(macroKcal(tight.target) - 1610)).toBeLessThanOrEqual(2)
  })

  it("10: no accepted calibration = exactly the previous formula (existing targets unchanged)", () => {
    for (const goal of GOALS) for (const activityLevel of LEVELS) {
      const input = { ...REPORTED, goal, activityLevel }
      expect(calculateMacroTargets(input).target).toEqual(calculateMacroTargets({ ...input, calorieAdjustmentKcal: 0 }).target)
    }
    // Pre-existing fixture from profile-targets.test.ts stays 2560 kcal / 140 g.
    const legacy = calculateMacroTargets({ ...REPORTED, age: 30, heightCm: 175, weightKg: 70, activityLevel: "moderate", goal: "maintenance" })
    expect([legacy.target.calories, legacy.target.protein]).toEqual([2560, 140])
  })

  it("an accepted calibration moves calories, keeps protein/fat, refills carbs, and is bounded", () => {
    const base = calculateMacroTargets(REPORTED)
    const minus = calculateMacroTargets({ ...REPORTED, calorieAdjustmentKcal: -250 })
    expect(minus.target.calories).toBe(3510)
    expect(minus.estimatedTargetCalories).toBe(3760)
    expect([minus.target.protein, minus.target.fat]).toEqual([base.target.protein, base.target.fat])
    expect(Math.abs(macroKcal(minus.target) - 3510)).toBeLessThanOrEqual(2)
    expect(calculateMacroTargets({ ...REPORTED, calorieAdjustmentKcal: 5000 }).calorieAdjustmentKcal).toBe(1000)
  })
})

describe("training style vs activity level", () => {
  it("5: Running + Lightly Active is accepted as chosen, with no warning for a light week", () => {
    const mapped = mapProfileToNutritionInput({
      profile: { gender: "male", date_of_birth: "2008-08-17" },
      fitnessProfile: { height_cm: 180, weight_kg: 80, training_days: 3, session_duration_minutes: 30 },
      preferences: { activity_level_override: "light", training_mode_override: "running" },
    })
    expect(mapped.input?.activityLevel).toBe("light")
    expect(buildNutritionPlan(mapped.input!).pal).toBe(1.375)
    expect(activityConsistencyNote("light", mapped.trainingVolume)).toBeNull()
  })

  it("flags (never blocks) a level that doesn't fit the stored volume", () => {
    expect(activityConsistencyNote("super_active", { daysPerWeek: 4, sessionMinutes: 60 })).toMatch(/Super Active/)
    expect(activityConsistencyNote("very_active", { daysPerWeek: 3, sessionMinutes: 45 })).toMatch(/Very Active/)
    expect(activityConsistencyNote("sedentary", { daysPerWeek: 5, sessionMinutes: 60 })).toMatch(/Sedentary/)
    expect(activityConsistencyNote("very_active", { daysPerWeek: 6, sessionMinutes: 75 })).toBeNull()
    // No stored volume → no guess.
    expect(activityConsistencyNote("super_active", { daysPerWeek: null, sessionMinutes: null })).toBeNull()
  })

  it("11: saved overrides stay authoritative and the accepted calibration is read from preferences", () => {
    const mapped = mapProfileToNutritionInput({
      profile: { gender: "male", date_of_birth: "2008-08-17" },
      fitnessProfile: { height_cm: 180, weight_kg: 80, goal: "muscle_gain", training_days: 4 },
      preferences: { activity_level_override: "very", training_mode_override: "running", nutrition_goal_override: "maintenance", calorie_adjustment_kcal: -250 },
    })
    expect(mapped.input).toMatchObject({ activityLevel: "very_active", trainingMode: "running", goal: "maintenance", calorieAdjustmentKcal: -250 })
    expect(mapped.onboardingGoal).toBe("lean_bulk")
    expect(mapProfileToNutritionInput({
      profile: { date_of_birth: "2008-08-17" }, fitnessProfile: { height_cm: 180, weight_kg: 80 }, preferences: null,
    }).input?.calorieAdjustmentKcal).toBe(0)
  })
})

/* ------------------------- calibration ------------------------- */

const TODAY = "2026-11-02"
function weeks(previous: number[], recent: number[]): WeightReading[] {
  return [
    ...previous.map((weightKg, i) => ({ date: addDaysIso(TODAY, -13 + i), weightKg })),
    ...recent.map((weightKg, i) => ({ date: addDaysIso(TODAY, -6 + i), weightKg })),
  ]
}
const intakeDays = (n: number, calories: number) => Array.from({ length: n }, (_, i) => ({ date: addDaysIso(TODAY, -i), calories }))
const review = (over: Partial<CalibrationInput>) =>
  evaluateCalorieCalibration({
    goal: "maintenance", today: TODAY, currentTargetCalories: 3000, currentAdjustmentKcal: 0, bmr: 1840,
    weights: [], intake: [], reviewedOn: null, ...over,
  })
const flat = (kg: number, n = 5) => Array(n).fill(kg)

describe("weight-trend calibration", () => {
  it("12: a stable trend → maintain", () => {
    const r = review({ weights: weeks([80, 80.2, 79.9, 80.1, 80], [80.1, 79.9, 80.2, 80, 80.1]) })
    expect(r.status).toBe("maintain")
  })

  it("13: consistent gain on maintenance → a 250 kcal reduction proposal", () => {
    const r = review({ weights: weeks(flat(80), flat(80.6)) })
    expect(r).toMatchObject({ status: "propose", deltaKcal: -250, proposedTargetCalories: 2750, currentTargetCalories: 3000 })
  })

  it("14: consistent loss on maintenance → a 250 kcal increase proposal", () => {
    expect(review({ weights: weeks(flat(80), flat(79.4)) })).toMatchObject({ status: "propose", deltaKcal: 250 })
  })

  it("500 kcal only for a large sustained deviation", () => {
    expect(review({ weights: weeks(flat(80), flat(81)) })).toMatchObject({ status: "propose", deltaKcal: -500 })
  })

  it("15: fat loss follows its own logic", () => {
    const fl = (recent: number, intake = intakeDays(0, 0)) => review({ goal: "fat_loss", currentTargetCalories: 2500, weights: weeks(flat(80), flat(recent)), intake })
    expect(fl(79.4).status).toBe("maintain") // −0.75 %/wk: on plan
    expect(fl(78.9)).toMatchObject({ status: "propose", deltaKcal: 250 }) // −1.4 %/wk: too fast
    expect(fl(78.4)).toMatchObject({ status: "propose", deltaKcal: 500 }) // −2 %/wk: much too fast
    // Not losing, intake not logged → ask for intake, don't cut.
    expect(fl(80).status).toBe("insufficient_data")
    // Not losing despite logging at target → modest cut; never 500 even when gaining.
    expect(fl(80, intakeDays(10, 2500))).toMatchObject({ status: "propose", deltaKcal: -250, uncertainty: null })
    expect(fl(81, intakeDays(10, 2500))).toMatchObject({ status: "propose", deltaKcal: -250 })
  })

  it("15: lean bulk follows its own logic", () => {
    const lb = (recent: number) => review({ goal: "lean_bulk", weights: weeks(flat(80), flat(recent)) })
    expect(lb(80.25).status).toBe("maintain") // +0.3 %/wk
    expect(lb(80.65)).toMatchObject({ status: "propose", deltaKcal: -250 }) // +0.8 %/wk
    expect(lb(80)).toMatchObject({ status: "propose", deltaKcal: 250 }) // stalled
  })

  it("16: insufficient weigh-ins → no recommendation", () => {
    const r = review({ weights: weeks(flat(80), [82, 82, 82]) })
    expect(r.status).toBe("insufficient_data")
    expect("deltaKcal" in r).toBe(false)
    expect(review({ weights: [] }).status).toBe("insufficient_data")
  })

  it("17: one odd weigh-in does not trigger a change", () => {
    const r = review({ weights: weeks(flat(80), [80, 80, 83, 80, 80]) })
    expect(r.status).toBe("maintain")
  })

  it("logged intake that explains the trend blocks the proposal", () => {
    const r = review({ weights: weeks(flat(80), flat(80.6)), intake: intakeDays(10, 3500) })
    expect(r.status).toBe("intake_mismatch")
  })

  it("without enough intake logs a proposal carries its uncertainty", () => {
    const r = review({ weights: weeks(flat(80), flat(80.6)), intake: intakeDays(3, 3000) })
    expect(r.status === "propose" && r.uncertainty).toMatch(/3 of 14 days/)
  })

  it("safety: never below BMR, never past ±1000 kcal total", () => {
    expect(review({ currentTargetCalories: 1900, bmr: 1840, weights: weeks(flat(80), flat(80.6)) }).status).toBe("limit")
    expect(review({ currentTargetCalories: 2100, bmr: 1840, weights: weeks(flat(80), flat(80.6)) })).toMatchObject({ status: "propose", proposedTargetCalories: 1850 })
    expect(review({ currentAdjustmentKcal: 900, weights: weeks(flat(80), flat(79.4)) })).toMatchObject({ status: "propose", deltaKcal: 100 })
    expect(review({ currentAdjustmentKcal: 1000, weights: weeks(flat(80), flat(79.4)) }).status).toBe("limit")
  })

  it("weigh-ins on or before the last review are ignored (no immediate re-proposal)", () => {
    const r = review({ weights: weeks(flat(80), flat(80.6)), reviewedOn: addDaysIso(TODAY, -3) })
    expect(r.status).toBe("insufficient_data")
  })
})
