import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createFoodLog } from "@/lib/nutrition/food-log/mutations";
import { MEAL_TYPES } from "@/lib/nutrition/food-log/types";
import { HAWKER_DISH_IDS } from "@/lib/hawkerlens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const confirmedComponentSchema = z.object({
  name: z.string().min(1).max(120),
  grams: z.number().min(0.1).max(5000),
  per100g: z.object({
    calories: z.number().min(0),
    protein: z.number().min(0),
    carbs: z.number().min(0),
    fat: z.number().min(0),
  }),
  confidence: z.number().min(0).max(1).nullable().optional(),
});

const requestSchema = z.object({
  scanId: z.string().uuid().nullable().optional(),
  dish: z.enum(HAWKER_DISH_IDS as [string, ...string[]]),
  mealType: z.enum(MEAL_TYPES as [string, ...string[]]),
  components: z.array(confirmedComponentSchema).min(1).max(20),
});

/**
 * POST /api/hawkerlens/confirm — spec Part A §9: the user's edited,
 * final version is what gets saved to food_logs (one row per
 * component, through the SAME createFoodLog() path barcode/search/
 * manual entry use — source: "ai_estimate", already a valid
 * food_logs_source_check value). If a scanId is provided, the
 * ORIGINAL model prediction in hawkerlens_scans is left untouched and
 * `components_confirmed`/`confirmed_at` record what the user actually
 * kept — the diff between the two is exactly what future model
 * evaluation needs.
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { scanId, dish, mealType, components } = parsed.data;

  const savedIds: string[] = [];
  const errors: string[] = [];

  for (const component of components) {
    const result = await createFoodLog(supabase, user.id, {
      mealType: mealType as never,
      foodName: `${component.name} (HawkerLens: ${dish.replace(/_/g, " ")})`,
      source: "ai_estimate",
      per100g: component.per100g,
      quantityGrams: component.grams,
      isEstimated: true,
      estimationConfidence:
        component.confidence !== null && component.confidence !== undefined
          ? component.confidence >= 0.7
            ? "high"
            : component.confidence >= 0.4
              ? "medium"
              : "low"
          : null,
      estimationReason: `HawkerLens photo scan of ${dish.replace(/_/g, " ")}, user-confirmed.`,
    });

    if (result.success) {
      savedIds.push(result.data.id);
    } else {
      errors.push(`${component.name}: ${result.error}`);
    }
  }

  if (scanId) {
    const { error: updateError } = await supabase
      .from("hawkerlens_scans")
      .update({
        components_confirmed: components,
        confirmed_at: new Date().toISOString(),
      })
      .eq("id", scanId)
      .eq("user_id", user.id);

    if (updateError) {
      console.error("[HAWKERLENS CONFIRM API] failed to record confirmation", updateError);
    }
  }

  if (savedIds.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Could not save any component.", details: errors },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, savedIds, errors: errors.length > 0 ? errors : undefined });
}
