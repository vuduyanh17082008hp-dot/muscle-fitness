import type { MealIntakeFact, VerifierFact, VerifierInput } from "@/lib/dante-core/verifier/types";

// "protein" / "calories" also name targets and g/kg guidelines: only a mention worded as what was eaten states these facts.
const CONSUMED = /\b(?:consumed|logged|eaten|ate|so far|intake (?:today|so far)|you'?ve had|have had)\b/i;
// What is left of today's target is its own fact, so a consumed figure voiced as "remaining" is caught.
const REMAINING = /\b(?:remaining|left|to go)\b/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Shape-only — deliberately not importing route.ts's UserContext type
 * (a Next.js route file should never be imported into lib/). Any object
 * with at least these two unknown-shaped fields (route.ts's UserContext
 * qualifies structurally) can be passed in.
 */
export type KnownFactsContextInput = {
  recovery: unknown;
  todayFoodLog: unknown;
  /** Its dailyTargets are day-level figures a reply may state even when the food log can't be read. */
  currentNutritionPlan?: unknown;
};

/**
 * Deliberately narrow: only the specific numeric dimensions the
 * verifier's invented-athlete-metric patterns check for (recovery
 * score, readiness, sleep hours, calories/protein consumed today —
 * see lib/dante-core/verifier/checks.ts::ATHLETE_METRIC_ASSERTIONS). A
 * dimension not present here (HRV, training load) is correctly left
 * out rather than guessed, so a claim about it is correctly flagged
 * as unbacked rather than silently trusted.
 */
export function buildKnownFactsFromContext(context: KnownFactsContextInput): VerifierFact[] {
  const facts: VerifierFact[] = [];

  if (isRecord(context.recovery)) {
    const today = isRecord(context.recovery.today) ? context.recovery.today : null;
    const todayScore = today ? getNumber(today.score) : null;
    if (todayScore !== null) facts.push({ label: "recovery score", value: todayScore });

    const recent = isRecord(context.recovery.recent7DayAverages)
      ? context.recovery.recent7DayAverages
      : null;

    const sleepHours = recent ? getNumber(recent.sleepHours) : null;
    if (sleepHours !== null) facts.push({ label: "sleep hours", value: sleepHours });

    const readiness = recent ? getNumber(recent.readiness) : null;
    if (readiness !== null) facts.push({ label: "readiness score", value: readiness });
  }

  if (isRecord(context.todayFoodLog) && context.todayFoodLog.available === false) {
    // The log couldn't be read: no number may be stated as eaten today. NaN matches nothing, so any
    // intake-worded figure near "calories"/"protein" is a mismatch (checks.ts::cuedValueMismatch).
    facts.push({ label: "calories", value: Number.NaN, cue: CONSUMED }, { label: "protein", value: Number.NaN, cue: CONSUMED });
  } else if (isRecord(context.todayFoodLog)) {
    const calories = isRecord(context.todayFoodLog.calories)
      ? getNumber(context.todayFoodLog.calories.consumed)
      : null;
    if (calories !== null) facts.push({ label: "calories", value: calories, cue: CONSUMED });

    const protein = isRecord(context.todayFoodLog.protein)
      ? getNumber(context.todayFoodLog.protein.consumed)
      : null;
    if (protein !== null) facts.push({ label: "protein", value: protein, cue: CONSUMED });

    for (const label of ["calories", "protein"] as const) {
      const macro = context.todayFoodLog[label];
      const remaining = isRecord(macro) ? getNumber(macro.remaining) : null;
      // Over target reads as "0 left", never as a negative amount remaining.
      if (remaining !== null) facts.push({ label, value: Math.max(0, remaining), cue: REMAINING });
    }
  }

  return facts;
}

const MACROS = ["calories", "protein", "carbs", "fat"] as const;
const numbersInText = (text: string) => (text.replace(/(\d),(\d{3})/g, "$1$2").match(/\d+(?:\.\d+)?/g) ?? []).map(Number);

/**
 * The meal-level side of todayFoodLog (route.ts::summarizeTodayFoodLog's `meals`): what checkMealLevelClaims lets a
 * sentence naming a meal state. Undefined when there is no food-log summary at all (that path is not checked).
 * `userMessage`: a figure the user stated this turn may be echoed ("eating only 500 calories a day is far too low").
 */
export function buildMealIntakeFromContext(context: KnownFactsContextInput, userMessage = ""): VerifierInput["mealIntake"] {
  const log = context.todayFoodLog;
  if (!isRecord(log)) return undefined;
  const plan = isRecord(context.currentNutritionPlan) && isRecord(context.currentNutritionPlan.dailyTargets) ? context.currentNutritionPlan.dailyTargets : {};
  const givenValues = [...MACROS.map((macro) => getNumber(plan[macro])).filter((value): value is number => value !== null), ...numbersInText(userMessage)];
  if (log.available === false) return { meals: null, dayValues: givenValues };

  const dayValues = givenValues.concat(MACROS.flatMap((macro) => {
    const comparison = log[macro];
    return isRecord(comparison)
      // |remaining|: over target reads as "200 kcal over".
      ? [comparison.consumed, comparison.target, comparison.remaining].map(getNumber).flatMap((value) => (value === null ? [] : [value, Math.abs(value)]))
      : [];
  }));
  const itemCount = getNumber(log.itemsLoggedToday);
  if (itemCount !== null) dayValues.push(itemCount);

  const meals: MealIntakeFact[] = (Array.isArray(log.meals) ? log.meals : []).filter(isRecord).map((meal) => ({
    meal: meal.meal as MealIntakeFact["meal"],
    values: [
      ...MACROS.map((macro) => getNumber(meal[macro])).filter((value): value is number => value !== null),
      // Portions and any number in a food's own name ("Coke 330ml", "2 eggs").
      ...(Array.isArray(meal.foods) ? meal.foods : []).flatMap((food) => (typeof food === "string" ? numbersInText(food) : [])),
    ],
  }));

  return { meals, dayValues };
}

const MEAL_NAME: Record<MealIntakeFact["meal"], { en: string; vi: string }> = {
  breakfast: { en: "breakfast", vi: "bữa sáng" },
  lunch: { en: "lunch", vi: "bữa trưa" },
  dinner: { en: "dinner", vi: "bữa tối" },
  snack: { en: "snack", vi: "bữa phụ" },
  pre_workout: { en: "pre-workout", vi: "trước tập" },
  post_workout: { en: "post-workout", vi: "sau tập" },
};

/**
 * Bounded deterministic answer when the model kept stating intake figures the log doesn't support: today's verified
 * totals (and per-meal totals as logged), or that the log can't be read. Never a number the summary doesn't hold.
 * Null when there is no food-log summary to answer from.
 */
export function verifiedIntakeAnswer(context: KnownFactsContextInput, language: "en" | "vi"): string | null {
  const log = context.todayFoodLog;
  if (!isRecord(log)) return null;
  const vi = language === "vi";
  if (log.available === false) {
    return vi
      ? "Mình không đọc được nhật ký ăn uống của bạn lúc này, nên không thể nói hôm nay bạn đã ăn bao nhiêu. Thử lại sau một lát nhé."
      : "I can't read your food log right now, so I can't tell you what you've eaten today. Try again in a moment.";
  }
  const n = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 1 });
  const macro = (key: (typeof MACROS)[number]) => (isRecord(log[key]) ? (log[key] as Record<string, unknown>) : null);
  const meals = (Array.isArray(log.meals) ? log.meals : []).filter(isRecord);
  if (meals.length === 0) return vi ? "Hôm nay bạn chưa log món nào." : "Nothing is logged in your food log yet today.";

  const calories = macro("calories");
  const protein = macro("protein");
  const lines: string[] = [];
  if (calories && protein && getNumber(calories.consumed) !== null && getNumber(protein.consumed) !== null) {
    lines.push(vi
      ? `Theo nhật ký hôm nay bạn đã log ${n(calories.consumed as number)} kcal và ${n(protein.consumed as number)} g protein.`
      : `Your food log shows ${n(calories.consumed as number)} kcal and ${n(protein.consumed as number)} g protein logged today.`);
    const calLeft = getNumber(calories.remaining);
    const proLeft = getNumber(protein.remaining);
    if (calLeft !== null && proLeft !== null) {
      lines.push(vi
        ? `Mục tiêu là ${n(calories.target as number)} kcal / ${n(protein.target as number)} g protein, còn ${n(Math.max(0, calLeft))} kcal và ${n(Math.max(0, proLeft))} g protein.`
        : `Against your ${n(calories.target as number)} kcal / ${n(protein.target as number)} g protein target, that leaves ${n(Math.max(0, calLeft))} kcal and ${n(Math.max(0, proLeft))} g protein.`);
    }
  }
  const byMeal = meals
    .map((meal) => `${MEAL_NAME[meal.meal as MealIntakeFact["meal"]]?.[language] ?? String(meal.meal)}: ${n(getNumber(meal.calories) ?? 0)} kcal, ${n(getNumber(meal.protein) ?? 0)} g protein`)
    .join("; ");
  lines.push(vi ? `Theo từng bữa — ${byMeal}.` : `By meal — ${byMeal}.`);
  return lines.join(" ");
}
