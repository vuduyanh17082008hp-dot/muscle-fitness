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
  idempotencyKey: z.string().uuid(),
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

  // One outcome per component, keyed by its idempotency key, so the client can
  // tell COMPLETE / PARTIAL / FAILED apart and retry only what failed.
  const results: Array<
    { idempotencyKey: string; ok: true; entryId: string } | { idempotencyKey: string; ok: false; error: string }
  > = [];

  for (const component of components) {
    const result = await createFoodLog(supabase, user.id, {
      mealType: mealType as never,
      foodName: `${component.name} (HawkerLens: ${dish.replace(/_/g, " ")})`,
      source: "ai_estimate",
      per100g: component.per100g,
      quantityGrams: component.grams,
      idempotencyKey: component.idempotencyKey,
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

    results.push(
      result.success
        ? { idempotencyKey: component.idempotencyKey, ok: true, entryId: result.data.id }
        : { idempotencyKey: component.idempotencyKey, ok: false, error: result.error },
    );
  }

  const savedCount = results.filter((r) => r.ok).length;
  const status = savedCount === results.length ? "complete" : savedCount > 0 ? "partial" : "failed";

  // The first request that saves anything records what the user confirmed; a
  // retry (which carries only the failed components) must not overwrite it.
  if (scanId && status !== "failed") {
    const { error: updateError } = await supabase
      .from("hawkerlens_scans")
      .update({
        components_confirmed: components,
        confirmed_at: new Date().toISOString(),
      })
      .eq("id", scanId)
      .eq("user_id", user.id)
      .is("confirmed_at", null);

    if (updateError) {
      console.error("[HAWKERLENS CONFIRM API] failed to record confirmation", updateError);
    }
  }

  if (status === "failed") {
    return NextResponse.json(
      { ok: false, status, error: "Could not save any component.", results },
      { status: 500 },
    );
  }

  // 207: some rows exist and some don't — never a plain success.
  return NextResponse.json({ ok: status === "complete", status, results }, { status: status === "complete" ? 200 : 207 });
}
