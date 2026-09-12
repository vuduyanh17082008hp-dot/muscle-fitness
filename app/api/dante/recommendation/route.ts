import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { loadReadinessForUser } from "@/lib/dante-core/server/load-readiness-for-user";
import { evaluateTrend } from "@/lib/dante-core/trend-engine";
import { generateRecommendation } from "@/lib/dante-core/autoregulation-engine";
import { buildAutoregulationTraceableDecision } from "@/lib/dante-core/decision-object";
import { attachKnowledgeSources, explainRecommendation } from "@/lib/dante-core/explain";
import { CANONICAL_MUSCLES } from "@/lib/training/muscle-taxonomy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const setVisionSchema = z
  .object({
    velocityLoss: z.number().min(0).max(1).nullable(),
    velocityCalibrated: z.boolean(),
    romConsistency: z.number().min(0).max(1).nullable(),
    confidence: z.number().min(0).max(1).nullable(),
  })
  .nullable()
  .optional();

const recommendationSchema = z.object({
  exerciseId: z.string().uuid().nullable().optional(),
  exerciseName: z.string().min(1).max(120),
  relevantMuscles: z.array(z.enum(CANONICAL_MUSCLES as [string, ...string[]])).min(1),
  planned: z.object({
    targetSets: z.number().int().min(1).max(20),
    targetRepMin: z.number().int().min(1).max(100),
    targetRepMax: z.number().int().min(1).max(100),
    targetLoadKg: z.number().min(0).max(1000).nullable(),
    targetRir: z.number().min(0).max(10).nullable(),
  }),
  setVision: setVisionSchema,
  explain: z.boolean().optional().default(false),
});

/**
 * POST /api/dante/recommendation — Dante Core's autoregulation engine
 * (spec Part A §4), wired to the current user's own real readiness +
 * performance-trend data. This is `dante.generateRecommendation()` /
 * `dante.evaluateSet()` (spec §27), plus optional traceability +
 * explanation assembly (spec §6, §9).
 *
 * Numbers are always computed deterministically BEFORE the optional
 * LLM explanation step — the LLM is never allowed to change them.
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
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = recommendationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const input = parsed.data;

  try {
    const { readiness, recoveryContext, trainingContext } = await loadReadinessForUser(
      supabase,
      user.id,
    );

    const e1rmHistory = input.exerciseId
      ? (trainingContext.e1RmHistoryByExercise.get(input.exerciseId) ?? [])
      : [];

    const trend = e1rmHistory.length > 0 ? evaluateTrend(e1rmHistory) : null;

    const recentPainFlag = recoveryContext.today?.pain_illness === "yes";

    const decision = generateRecommendation({
      exerciseName: input.exerciseName,
      planned: input.planned,
      readiness,
      relevantMuscles: input.relevantMuscles as (typeof CANONICAL_MUSCLES)[number][],
      trend,
      setVision: input.setVision ?? null,
      recentPainFlag,
    });

    let traceable = buildAutoregulationTraceableDecision(decision, readiness);
    traceable = attachKnowledgeSources(
      traceable,
      `${input.exerciseName} ${decision.reasons.join(" ")}`,
    );

    if (!input.explain) {
      return NextResponse.json({ ok: true, decision: traceable });
    }

    const explained = await explainRecommendation(traceable);

    return NextResponse.json({
      ok: true,
      decision: traceable,
      explanation: explained.explanation,
      explanationSource: explained.explanationSource,
    });
  } catch (error) {
    console.error("[DANTE RECOMMENDATION API ERROR]", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          process.env.NODE_ENV === "development"
            ? error instanceof Error
              ? error.message
              : "Unknown error."
            : "Could not compute a recommendation.",
      },
      { status: 500 },
    );
  }
}
