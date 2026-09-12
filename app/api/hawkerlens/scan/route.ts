import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { analyzeHawkerLensPhoto } from "@/lib/hawkerlens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE_LENGTH = 8_000_000;

const requestSchema = z.object({
  image: z
    .string()
    .min(1)
    .max(MAX_IMAGE_LENGTH)
    .refine((value) => value.startsWith("data:image/"), {
      message: "Image must be a data URL (data:image/...).",
    }),
});

/**
 * POST /api/hawkerlens/scan — runs the full HawkerLens pipeline (spec
 * Part A §3) and records the ORIGINAL prediction in
 * hawkerlens_scans, separate from whatever the user later confirms
 * (see /api/hawkerlens/confirm). Never saves anything to food_logs
 * itself — that only happens on confirm.
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
      { ok: false, error: "Invalid image payload.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await analyzeHawkerLensPhoto(parsed.data.image);

  const { data: scanRow, error: insertError } = await supabase
    .from("hawkerlens_scans")
    .insert({
      user_id: user.id,
      dish: result.dish,
      dish_confidence: result.dishClassification.confidence,
      image_quality: result.imageQuality,
      components_predicted: result.components,
      nutrition_predicted: result.nutrition,
      overall_confidence: result.overallConfidence,
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("[HAWKERLENS SCAN API] failed to record scan", insertError);
  }

  return NextResponse.json({
    ok: true,
    result,
    scanId: scanRow?.id ?? null,
  });
}
