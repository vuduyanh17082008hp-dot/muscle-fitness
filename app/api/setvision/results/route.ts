import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { SETVISION_EXERCISES } from "@/lib/setvision/types";
import type { SetVisionAnalysis } from "@/lib/setvision/types";
import { emitEvent } from "@/lib/events/emit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const analysisSchema = z.object({
  exercise: z.enum(SETVISION_EXERCISES as [string, ...string[]]),
  exerciseClassification: z.object({
    exercise: z.enum(SETVISION_EXERCISES as [string, ...string[]]).nullable(),
    confidence: z.number().min(0).max(1),
    signals: z.array(z.string()),
  }),
  reps: z.number().int().min(0),
  romConsistency: z.number().min(0).max(1).nullable(),
  averageEccentricTime: z.number().min(0).nullable(),
  averageConcentricTime: z.number().min(0).nullable(),
  velocity: z.object({
    calibrated: z.boolean(),
    unit: z.enum(["m/s", "torso-lengths/s"]),
    perRep: z.array(z.object({ repNumber: z.number(), meanSpeed: z.number() })),
    mean: z.number().nullable(),
    peak: z.number().nullable(),
    final: z.number().nullable(),
    velocityLoss: z.number().min(0).max(1).nullable(),
  }),
  technique: z.object({
    romConsistency: z.number().min(0).max(1).nullable(),
    tempoConsistency: z.number().min(0).max(1).nullable(),
    barPathConsistency: z.number().min(0).max(1).nullable(),
    asymmetryDeg: z.number().nullable(),
  }),
  confidence: z.number().min(0).max(1),
  perRep: z.object({
    rom: z.array(z.object({ repNumber: z.number(), romPercent: z.number() })),
    tempo: z.array(
      z.object({
        repNumber: z.number(),
        eccentricSec: z.number(),
        pauseSec: z.number(),
        concentricSec: z.number(),
      }),
    ),
  }),
  limitations: z.array(z.string()),
});

const requestSchema = z.object({
  analysis: analysisSchema,
  workoutSessionId: z.string().uuid().nullable().optional(),
  sessionExerciseId: z.string().uuid().nullable().optional(),
  videoStoragePath: z.string().max(500).nullable().optional(),
});

/**
 * POST /api/setvision/results — persists a SetVision analysis (spec
 * Part B §26). The video itself is never sent here; only the already
 * client-computed, structured analysis and (optionally) a storage
 * path the video was separately uploaded to. See
 * /api/setvision/upload-url for the upload step.
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

  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { analysis, workoutSessionId, sessionExerciseId, videoStoragePath } = parsed.data;

  const { data, error } = await supabase
    .from("setvision_analyses")
    .insert({
      user_id: user.id,
      workout_session_id: workoutSessionId ?? null,
      session_exercise_id: sessionExerciseId ?? null,
      exercise: analysis.exercise,
      video_storage_path: videoStoragePath ?? null,
      reps: analysis.reps,
      rom_consistency: analysis.technique.romConsistency,
      tempo_consistency: analysis.technique.tempoConsistency,
      bar_path_consistency: analysis.technique.barPathConsistency,
      asymmetry_deg: analysis.technique.asymmetryDeg,
      average_eccentric_time_sec: analysis.averageEccentricTime,
      average_concentric_time_sec: analysis.averageConcentricTime,
      velocity_calibrated: analysis.velocity.calibrated,
      velocity_unit: analysis.velocity.unit,
      velocity_mean: analysis.velocity.mean,
      velocity_peak: analysis.velocity.peak,
      velocity_final: analysis.velocity.final,
      velocity_loss: analysis.velocity.velocityLoss,
      exercise_classification_confidence: analysis.exerciseClassification.confidence,
      confidence: analysis.confidence,
      limitations: analysis.limitations,
      per_rep: analysis.perRep,
    })
    .select("id, analyzed_at")
    .single();

  if (error) {
    console.error("[SETVISION RESULTS API ERROR]", error);
    return NextResponse.json(
      { ok: false, error: "Could not save the analysis." },
      { status: 500 },
    );
  }

  await emitEvent(supabase, {
    type: "SET_ANALYZED",
    userId: user.id,
    payload: {
      exercise: analysis.exercise,
      reps: analysis.reps,
      velocityLoss: analysis.velocity.velocityLoss,
      confidence: analysis.confidence,
    },
  });

  return NextResponse.json({ ok: true, id: data.id, analyzedAt: data.analyzed_at });
}

type SetVisionAnalysisRow = {
  id: string;
  exercise: string;
  reps: number;
  rom_consistency: number | null;
  tempo_consistency: number | null;
  bar_path_consistency: number | null;
  average_eccentric_time_sec: number | null;
  average_concentric_time_sec: number | null;
  velocity_calibrated: boolean;
  velocity_unit: string;
  velocity_mean: number | null;
  velocity_loss: number | null;
  confidence: number;
  analyzed_at: string;
  workout_session_id: string | null;
  session_exercise_id: string | null;
};

/**
 * GET /api/setvision/results?sessionExerciseId=... — history for the
 * current user, optionally scoped to one logged exercise.
 */
export async function GET(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const sessionExerciseId = searchParams.get("sessionExerciseId");

  let query = supabase
    .from("setvision_analyses")
    .select(
      "id, exercise, reps, rom_consistency, tempo_consistency, bar_path_consistency, average_eccentric_time_sec, average_concentric_time_sec, velocity_calibrated, velocity_unit, velocity_mean, velocity_loss, confidence, analyzed_at, workout_session_id, session_exercise_id",
    )
    .eq("user_id", user.id)
    .order("analyzed_at", { ascending: false })
    .limit(50);

  if (sessionExerciseId) {
    query = query.eq("session_exercise_id", sessionExerciseId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[SETVISION RESULTS API ERROR]", error);
    return NextResponse.json(
      { ok: false, error: "Could not load analysis history." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, results: (data ?? []) as SetVisionAnalysisRow[] });
}

export type { SetVisionAnalysis };
