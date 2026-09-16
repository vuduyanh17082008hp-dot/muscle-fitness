import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mapProfileToNutritionInput } from "../profile-mapping";
import { calculateMacroTargets, type NutritionInput } from "../plan";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-15T12:00:00Z")); });
afterEach(() => vi.useRealTimers());

describe("nutrition profile input", () => {
  it.each([0, -70, "70kg", "Infinity"])("does not derive targets from invalid weight %s", (weight) => {
    const result = mapProfileToNutritionInput({ profile: { date_of_birth: "1996-01-01" }, fitnessProfile: { height_cm: 175, weight_kg: weight }, preferences: null });
    expect(result.input).toBeNull();
    expect(result.missingRequiredFields).toContain("weight");
  });
  it.each(["2026-02-30", "not-a-date", "2099-01-01"])("does not fabricate an age for %s", (date_of_birth) => {
    expect(mapProfileToNutritionInput({ profile: { date_of_birth }, fitnessProfile: { height_cm: 175, weight_kg: 70 }, preferences: null }).input).toBeNull();
  });
});

it("keeps macro energy within rounding tolerance and adds no extra training calorie bonus", () => {
  const input: NutritionInput = {
    sex: "male", age: 30, heightCm: 175, weightKg: 70, activityLevel: "moderate",
    trainingMode: "strength", goal: "maintenance", trainingDaysPerWeek: 4, mealsPerDay: 4,
    foodPreferences: [], excludedFoods: [], allergies: [],
  };
  const result = calculateMacroTargets(input);
  expect(result.bmr).toBe(1649);
  expect(result.maintenanceCalories).toBe(2556);
  expect(result.target.calories).toBe(2560);
  expect(result.target.protein).toBe(140);
  expect(Math.abs(result.target.protein * 4 + result.target.carbs * 4 + result.target.fat * 9 - result.target.calories)).toBeLessThanOrEqual(2);
  expect(calculateMacroTargets({ ...input, trainingMode: "hiit" }).target.calories).toBe(result.target.calories);
});
