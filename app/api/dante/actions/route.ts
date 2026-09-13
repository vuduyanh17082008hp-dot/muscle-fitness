import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { applyDanteAction } from "@/lib/dante-core/actions/apply-action";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/dante/actions — the ONLY HTTP entry point that can turn a
 * Dante-proposed action into a real database write (spec Part
 * "2. DANTE ACTIONS"). The request body is validated against the
 * exact same typed union the decision engines produce — there is no
 * freeform payload shape an LLM (or a compromised client) could smuggle
 * a different mutation through. `applyDanteAction` re-derives ownership
 * independently before writing anything.
 */

const beforeAfterSchema = z.object({
  sets: z.number().int().min(1).max(20).nullable(),
  repMin: z.number().int().min(1).max(100).nullable(),
  repMax: z.number().int().min(1).max(100).nullable(),
});

const payloadSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("adjust_sets_reps"),
    sessionId: z.string().uuid(),
    sessionExerciseId: z.string().uuid(),
    exerciseName: z.string().min(1).max(120),
    before: beforeAfterSchema,
    after: beforeAfterSchema,
  }),
  z.object({
    type: z.literal("postpone_exercise"),
    sessionId: z.string().uuid(),
    sessionExerciseId: z.string().uuid(),
    exerciseName: z.string().min(1).max(120),
  }),
  z.object({
    type: z.literal("modify_volume"),
    sessionId: z.string().uuid(),
    sessionExerciseId: z.string().uuid(),
    exerciseName: z.string().min(1).max(120),
    before: z.object({ sets: z.number().int().min(1).max(20) }),
    after: z.object({ sets: z.number().int().min(1).max(20) }),
  }),
  z.object({
    type: z.literal("recovery_action"),
    suggestion: z.string().min(1).max(500),
  }),
  z.object({
    type: z.literal("macro_adjustment"),
    macro: z.enum(["calories", "protein", "carbs", "fat"]),
    direction: z.enum(["increase", "decrease"]),
    suggestedChangePercent: z.number().min(0).max(100),
  }),
  z.object({
    type: z.literal("meal_suggestion"),
    mealDescription: z.string().min(1).max(300),
    estimatedCalories: z.number().min(0).max(5000).nullable(),
    estimatedProteinG: z.number().min(0).max(500).nullable(),
  }),
]);

const requestSchema = z.object({
  payload: payloadSchema,
  reason: z.string().min(1).max(500),
  confidence: z.number().min(0).max(1),
  intent: z.enum(["confirm", "reject"]),
});

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid action request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await applyDanteAction(supabase, user.id, parsed.data);

    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch (error) {
    console.error("[DANTE ACTIONS API ERROR]", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          process.env.NODE_ENV === "development"
            ? error instanceof Error
              ? error.message
              : "Unknown error."
            : "Could not process this action right now.",
      },
      { status: 500 },
    );
  }
}
