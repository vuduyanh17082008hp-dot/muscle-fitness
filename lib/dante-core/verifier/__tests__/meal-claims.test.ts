import { describe, expect, it } from "vitest";

import { verifyFinalResponse } from "@/lib/dante-core/verifier";
import { buildKnownFactsFromContext, buildMealIntakeFromContext, verifiedIntakeAnswer } from "@/lib/dante-core/verifier/known-facts-from-context";
import { compareToTargets, computeDailyTotals, summarizeMeals } from "@/lib/nutrition/food-log/totals";
import type { FoodLogEntry, MealType } from "@/lib/nutrition/food-log/types";

const TARGET = { calories: 3220, protein: 156, carbs: 400, fat: 90 };

function entry(mealType: MealType, foodName: string, calories: number, proteinG: number, quantityGrams = 100): FoodLogEntry {
  return {
    id: `${mealType}-${foodName}`, logDate: "2026-10-23", mealType, foodName, brand: null, source: "local", sourceId: null, barcode: null,
    quantityGrams, servingName: null, servingsConsumed: null, calories, proteinG, carbsG: 10, fatG: 5, fiberG: null,
    isEstimated: false, estimationConfidence: null, estimationReason: null, estimatedFrom: null, createdAt: "2026-10-23T01:00:00Z",
  };
}

/** The same summary shape route.ts::summarizeTodayFoodLog hands Dante, built from rows the way it is. */
function summary(entries: FoodLogEntry[]) {
  const comparison = compareToTargets(computeDailyTotals(entries), TARGET);
  return { hasTarget: true, date: "2026-10-23", ...comparison, itemsLoggedToday: entries.length, foodsLoggedToday: [], meals: summarizeMeals(entries) };
}

function verify(replyText: string, todayFoodLog: unknown) {
  const context = { recovery: null, todayFoodLog };
  return verifyFinalResponse({
    replyText,
    knownFacts: buildKnownFactsFromContext(context),
    availableSources: [],
    safety: null,
    mealIntake: buildMealIntakeFromContext(context),
  });
}

const codes = (result: ReturnType<typeof verify>) => result.findings.map((finding) => finding.code);

// Live acceptance 2026-10-23: 1,499 kcal / 95.4 g protein logged, all of it under one meal; Dante answered with
// "Breakfast: 920 kcal / Pre-workout: 579 kcal" — summing to the right total, matching no row.
const oneMeal = summary([entry("snack", "Chicken rice", 1000, 60, 350), entry("snack", "Whey Protein", 499, 35.4, 30)]);

describe("meal-level claims — invented allocations (A–C, F)", () => {
  it("A: the correct daily total with no meal breakdown passes", () => {
    expect(verify("You've logged 1,499 calories and 95.4 g of protein today.", oneMeal).passed).toBe(true);
  });

  it("B: a correct total plus invented meal allocations is blocked", () => {
    const result = verify("You've logged 1,499 calories today: breakfast was 920 kcal and lunch 579 kcal.", oneMeal);
    expect(codes(result)).toContain("unsupported_intake_claim");
    expect(result.outcome).toBe("insufficient_evidence");
  });

  it("C: invented allocations that sum to the verified total are still blocked", () => {
    const reply = "You've consumed 1,499 calories today. Here's the breakdown:\n\n- **Breakfast:** 920 kcal\n- **Pre-Workout:** 579 kcal";
    const result = verify(reply, oneMeal);
    expect(codes(result)).toEqual(["unsupported_intake_claim", "unsupported_intake_claim"]);
    expect(result.findings[0].message).toContain("breakfast: nothing logged");
  });

  it("C: the same allocation as a heading list or inline phrasing is blocked", () => {
    expect(verify("Today so far:\nBreakfast: 920 kcal\nPre-workout: 579 kcal", oneMeal).passed).toBe(false);
    expect(verify("Most of your 1,499 kcal came from a 920 kcal breakfast.", oneMeal).passed).toBe(false);
    expect(verify("Breakfast:\n- Oats — 920 kcal", oneMeal).passed).toBe(false);
  });

  it("F: a valid total with an unsupported meal-level explanation is blocked", () => {
    expect(verify("You've logged 1,499 kcal today, mostly from a big 900 kcal breakfast.", oneMeal).passed).toBe(false);
  });

  it("removing the invented breakdown and keeping the total passes (the repair the correction brief asks for)", () => {
    expect(verify("You've consumed 1,499 calories today, all logged under snack: 1,499 kcal.", oneMeal).passed).toBe(true);
  });
});

describe("meal-level claims — verified per-meal rows (D, E, H)", () => {
  const twoMeals = summary([entry("breakfast", "Oats", 920, 40, 80), entry("pre_workout", "Banana shake", 579, 55.4, 1020)]);

  it("D: per-meal values that match the DB-backed rows pass, as a list and inline", () => {
    expect(verify("Here's your breakdown:\n- Breakfast: 920 kcal, 40 g protein\n- Pre-workout: 579 kcal, 55.4 g protein", twoMeals).passed).toBe(true);
    expect(verify("You had 920 kcal at breakfast and 579 kcal pre-workout.", twoMeals).passed).toBe(true);
    // Portions from the log are supported numbers too.
    expect(verify("Breakfast:\n- Oats (80 g) — 920 kcal", twoMeals).passed).toBe(true);
  });

  it("D: each food carries its own row's values, so a per-item figure is sourced", () => {
    const snack = summary([entry("snack", "White Rice", 520, 10.8, 400), entry("snack", "Chicken Breast", 413, 77.5, 250)]).meals[0];
    expect(snack).toMatchObject({ meal: "snack", calories: 933, protein: 88.3 });
    expect(snack.foods).toEqual(["White Rice (400 g): 520 kcal, 10.8 g protein", "Chicken Breast (250 g): 413 kcal, 77.5 g protein"]);
    const log = summary([entry("snack", "White Rice", 520, 10.8, 400), entry("snack", "Chicken Breast", 413, 77.5, 250)]);
    expect(verify("Snack:\n- White Rice (400 g): 520 kcal\n- Chicken Breast (250 g): 413 kcal", log).passed).toBe(true);
    expect(verify("Snack:\n- White Rice (400 g): 610 kcal", log).passed).toBe(false);
  });

  it("D: meal figures swapped across lines are blocked", () => {
    expect(verify("Breakfast: 579 kcal\nPre-workout: 920 kcal", twoMeals).passed).toBe(false);
  });

  it("D: a meal with no rows supports only zero", () => {
    expect(verify("Your lunch: 0 kcal so far.", twoMeals).passed).toBe(true);
    expect(verify("Your lunch was 450 kcal.", twoMeals).passed).toBe(false);
  });

  it("E: food log unreadable — no meal figure is supported, an honest answer passes", () => {
    const unavailable = { available: false, note: "Food log unavailable." };
    expect(verify("Breakfast: 920 kcal", unavailable).passed).toBe(false);
    expect(verify("I can't read your food log right now, so I can't break today down by meal.", unavailable).passed).toBe(true);
  });

  it("H: thousands separators and decimals are read as written", () => {
    const big = summary([entry("dinner", "Pizza", 1335, 50.5), entry("lunch", "Burrito", 1791, 45)]);
    expect(verify("You've logged 3,126 kcal today. Your dinner: 1,335 kcal (50.5 g protein); lunch 1,791 kcal.", big).passed).toBe(true);
    expect(verify("Your dinner: 1,353 kcal.", big).passed).toBe(false);
  });
});

describe("meal-level claims — log changes and zero (J, K, L)", () => {
  it("J: verified zero intake", () => {
    const empty = summary([]);
    expect(verify("You haven't logged anything yet today — breakfast is at 0 kcal so far.", empty).passed).toBe(true);
    expect(verify("Your breakfast was 300 kcal.", empty).passed).toBe(false);
    expect(verifiedIntakeAnswer({ recovery: null, todayFoodLog: empty }, "en")).toBe("Nothing is logged in your food log yet today.");
  });

  it("K: after an edit/delete the summary is recomputed from rows, so the old figure no longer passes", () => {
    const before = summary([entry("lunch", "Rice", 600, 10), entry("lunch", "Chicken", 300, 50)]);
    const after = summary([entry("lunch", "Rice", 600, 10)]);
    expect(verify("Your lunch: 900 kcal.", before).passed).toBe(true);
    expect(verify("Your lunch: 900 kcal.", after).passed).toBe(false);
    expect(verify("Your lunch: 600 kcal.", after).passed).toBe(true);
  });

  it("L: an unsaved estimate offered for logging is not a log claim", () => {
    expect(verify("That chicken rice is about 600 kcal — want me to log it to lunch?", oneMeal).passed).toBe(true);
  });
});

describe("meal-level claims stay out of advice and non-nutrition answers (Q)", () => {
  it("advice and food knowledge that name a meal are not log claims", () => {
    for (const reply of [
      "Aim for about 700 kcal and 45 g protein at dinner to close the gap.",
      "Pre-workout: 30–60 g carbs one to two hours before you train.",
      "For lunch, chicken rice is roughly 600 kcal.",
      "Here are a few dinner ideas that fit:\n- Salmon bowl — 650 kcal, 45 g protein\n- Chicken wrap — 520 kcal, 40 g protein",
    ]) expect(verify(reply, oneMeal).passed, reply).toBe(true);
  });

  it("non-nutrition numbers next to a meal word are untouched", () => {
    expect(verify("Train about 2 hours after breakfast, and do 3 sets of 8 reps.", oneMeal).passed).toBe(true);
    expect(verify("for (let i = 0; i < 10; i++) console.log(i); // runs 10 times before lunch", oneMeal).passed).toBe(true);
  });

  it("paths with no food log never run the meal check", () => {
    expect(verifyFinalResponse({ replyText: "Breakfast: 920 kcal", knownFacts: [], availableSources: [], safety: null }).passed).toBe(true);
  });
});

describe("protein consumed vs remaining (G)", () => {
  // Live repro: 95.4 g eaten of 156 g → 60.6 g (61 g) left; "95.4 g remaining" was delivered once.
  const log = summary([entry("snack", "Chicken rice", 1000, 60), entry("snack", "Whey", 335, 35.4)]);

  it("remaining protein comes from target minus consumed", () => {
    expect(log.protein.remaining).toBe(60.6);
    expect(verify("You have 61 g of protein left today.", log).passed).toBe(true);
    expect(verify("You have 60.6 g of protein remaining.", log).passed).toBe(true);
  });

  it("the consumed figure voiced as remaining is blocked", () => {
    expect(verify("You have 95.4 g of protein remaining today.", log).passed).toBe(false);
  });

  it("over target is never a negative amount left", () => {
    const over = summary([entry("dinner", "Steak", 1000, 170)]);
    expect(over.protein.remaining).toBe(-14);
    expect(verify("You have 0 g of protein left — you're 14 g over.", over).passed).toBe(true);
  });
});

describe("deterministic intake answer (I, fallback)", () => {
  it("I: an unreadable log answers that it is unavailable and states no figure", () => {
    const answer = verifiedIntakeAnswer({ recovery: null, todayFoodLog: { available: false } }, "en")!;
    expect(answer).toMatch(/can't read your food log/);
    expect(answer).not.toMatch(/\d/);
  });

  it("states only the verified totals and meals, and passes the verifier itself", () => {
    const twoMeals = summary([entry("breakfast", "Oats", 920, 40), entry("pre_workout", "Shake", 579, 55.4)]);
    const answer = verifiedIntakeAnswer({ recovery: null, todayFoodLog: twoMeals }, "en")!;
    expect(answer).toContain("1,499 kcal and 95.4 g protein logged today");
    expect(answer).toContain("1,721 kcal and 60.6 g protein");
    expect(answer).toContain("breakfast: 920 kcal, 40 g protein; pre-workout: 579 kcal, 55.4 g protein");
    expect(verify(answer, twoMeals).passed).toBe(true);
    expect(verify(verifiedIntakeAnswer({ recovery: null, todayFoodLog: twoMeals }, "vi")!, twoMeals).passed).toBe(true);
  });

  it("is not offered when there is no food-log summary", () => {
    expect(verifiedIntakeAnswer({ recovery: null, todayFoodLog: null }, "en")).toBeNull();
  });
});

// Live run 2026-10-23 (isolated stack): 1,326 kcal logged over breakfast/snack/pre-workout.
describe("day-level intake claims (live repros)", () => {
  const plan = { dailyTargets: { calories: 3220, protein: 156, carbs: 492, fat: 70 } };
  const log = summary([entry("breakfast", "Rice", 195, 4.1), entry("snack", "Chicken rice", 933, 88.3), entry("pre_workout", "Chicken", 198, 37.2)]);
  const check = (replyText: string, todayFoodLog: unknown) => {
    const context = { recovery: null, todayFoodLog, currentNutritionPlan: plan };
    return verifyFinalResponse({ replyText, knownFacts: buildKnownFactsFromContext(context), availableSources: [], safety: null, mealIntake: buildMealIntakeFromContext(context) });
  };

  it("a wrong day total next to correct meal lines is blocked", () => {
    const reply = "Here's the breakdown of your calories today by meal:\n- Breakfast: 195 kcal\n- Pre-Workout Meal: 198 kcal\n\nYour total calorie intake for the day so far is 393 kcal.";
    expect(check(reply, log).findings.map((finding) => finding.code)).toEqual(["unsupported_intake_claim"]);
  });

  it("the correct day total and plan targets pass", () => {
    expect(check("Your total calorie intake so far is 1,326 kcal of your 3,220 kcal target.", log).passed).toBe(true);
  });

  it("log unreadable: plan targets may be stated, intake may not", () => {
    const unavailable = { available: false };
    expect(check("I don't have access to today's food log, but your total daily target is 3,220 calories, with 156g protein, 492g carbs, and 70g fat.", unavailable).passed).toBe(true);
    expect(check("You have consumed a total of 3,124 calories today.", unavailable).passed).toBe(false);
  });

  it("plan meal targets voiced as eaten are blocked (920/579/627 are the plan's Breakfast/Pre/Post-Workout targets)", () => {
    expect(check("You've consumed 1,326 calories today:\n- Breakfast: 920 calories\n- Pre-Workout Meal: 579 calories\n- Post-Workout Meal: 627 calories", log).passed).toBe(false);
  });
});

describe("user-stated figures (live: a safety redirect was replaced by an intake summary)", () => {
  const message = "I want to eat only 500 calories a day for the next month to cut fast. Plan it for me.";
  const log = summary([entry("snack", "Chicken rice", 933, 88.3)]);
  const redirect = "A caloric intake of only 500 calories a day is dangerously low and not safe for training.";
  const run = (userMessage: string) => {
    const context = { recovery: null, todayFoodLog: log };
    return verifyFinalResponse({ replyText: redirect, knownFacts: buildKnownFactsFromContext(context), availableSources: [], safety: null, mealIntake: buildMealIntakeFromContext(context, userMessage) });
  };

  it("the user's own number may be echoed", () => {
    expect(run(message).passed).toBe(true);
  });

  it("without it in the message, the same figure as intake is still blocked", () => {
    expect(run("How am I doing today?").passed).toBe(false);
  });
});

// Live final run 2026-10-23: only snack logged; asked "calories at breakfast and pre-workout?".
describe("an unlogged meal folded into a logged one", () => {
  const log = summary([entry("snack", "White Rice", 520, 10.8, 400), entry("snack", "Chicken Breast", 413, 77.5, 250)]);
  it.each([
    "You consumed 933 calories in total today:\n- **Breakfast**: This meal is part of your snack, consisting of 400 g of cooked white rice and 250 g of cooked chicken breast, totaling 933 calories.",
    "You had a total of 933 calories logged for your snack today, which includes the foods consumed at breakfast and pre-workout.",
  ])("is blocked: %s", (reply) => {
    expect(verify(reply, log).findings.map((finding) => finding.code)).toContain("unsupported_intake_claim");
  });

  it.each([
    "You haven't logged any specific entries for breakfast or a pre-workout meal today. The total calories consumed so far today is 933.",
    "Nothing is logged for breakfast yet; your snack had 933 kcal.",
    "You had 0 kcal at breakfast so far.",
  ])("an honest answer passes: %s", (reply) => {
    expect(verify(reply, log).passed).toBe(true);
  });
});

// Live final run 2026-10-23: "Suggest a dinner that fits my remaining macros" fell back to the intake summary.
describe("meal suggestions are advice, not log claims", () => {
  const log = summary([entry("snack", "White Rice", 520, 10.8, 400), entry("snack", "Chicken Breast", 413, 77.5, 250)]);
  it("a suggested dinner with its own totals passes", () => {
    const reply = "For dinner, considering your remaining macros today, you have:\n\n- **Calories remaining**: 2287 kcal\n- **Protein remaining**: 67.7 g\n\nHere's a dinner suggestion that fits within those macros:\n\n**Grilled Salmon with Quinoa**\n\n- **Salmon (200 g)**: Approximately 400 kcal, 50 g protein, 22 g fat\n- **Quinoa (150 g cooked)**: Approximately 180 kcal, 6 g protein\n\n**Total**: 690 kcal, 62 g protein\n\n**Total for dinner**: 690 kcal";
    expect(verify(reply, log).passed).toBe(true);
  });

  it("a log claim after the suggestion is still checked", () => {
    const reply = "Here's a dinner suggestion:\n- Salmon (200 g): 400 kcal\n\nSo far today you've logged 1,200 kcal.";
    expect(verify(reply, log).passed).toBe(false);
  });

  it("a claim sharing a line with advice is still checked", () => {
    expect(verify("Your breakfast was 920 kcal. You could add fruit.", log).passed).toBe(false);
  });
});
