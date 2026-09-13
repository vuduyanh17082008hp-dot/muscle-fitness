import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { loadFoodLogForDate } from "@/lib/nutrition/food-log/load-food-log-context";
import { loadNutritionContext } from "@/lib/nutrition/load-nutrition-context";
import { loadFrequentFoods, loadRecentFoods } from "@/lib/nutrition/food-log/history";
import { compareToTargets } from "@/lib/nutrition/food-log/totals";
import { buildNextMealOptions } from "@/lib/nutrition/next-action-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/nutrition/next-action — spec Part "5. NUTRITION NEXT-ACTION
 * ENGINE". Reuses today's real food log + the existing nutrition plan
 * target (never recomputed here) to derive remaining macros via the
 * SAME compareToTargets() the tracker UI already uses, then ranks
 * candidates from the user's own history + HawkerLens dish reference
 * data. No LLM call — this is the deterministic layer Dante would
 * explain, not Dante itself.
 */
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [foodLog, nutritionContext, recentFoods, frequentFoods] = await Promise.all([
      loadFoodLogForDate(supabase, user.id),
      loadNutritionContext(supabase, user.id),
      loadRecentFoods(supabase, user.id),
      loadFrequentFoods(supabase, user.id),
    ]);

    if (!nutritionContext.plan) {
      return NextResponse.json({
        ok: true,
        result: {
          hasRemainingBudget: false,
          remaining: { calories: 0, protein: 0, carbs: 0, fat: 0 },
          options: [],
          message: "Complete your nutrition profile to get next-meal suggestions.",
        },
      });
    }

    const comparison = compareToTargets(foodLog.totals, nutritionContext.plan.target);

    const excludedTerms = [
      ...nutritionContext.plan.input.allergies,
      ...nutritionContext.plan.input.excludedFoods,
    ];

    const result = buildNextMealOptions({
      remaining: {
        calories: comparison.calories.remaining,
        protein: comparison.protein.remaining,
        carbs: comparison.carbs.remaining,
        fat: comparison.fat.remaining,
      },
      excludedTerms,
      recentFoods,
      frequentFoods,
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("[NEXT ACTION API ERROR]", error);

    return NextResponse.json(
      { ok: false, error: "Could not compute a next-meal suggestion right now." },
      { status: 500 },
    );
  }
}
