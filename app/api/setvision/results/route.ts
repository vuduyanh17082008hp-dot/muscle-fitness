import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import {
  EMPTY_REVIEW,
  resolveIdentity,
  restoreSavedAnalysis,
  SAVED_ANALYSIS_COLUMNS,
  saveRequestSchema,
  type SavedAnalysisRow,
} from "@/lib/setvision/saved-analysis";
import { MANUAL_REVIEW_EXERCISE, type SetVisionAnalysis } from "@/lib/setvision/types";
import { emitEvent } from "@/lib/events/emit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * A linked workout row must be the caller's OWN. RLS alone would also let a
 * coach see a client's session, and an FK only proves the id exists.
 */
async function linkedRowsAreOwn(
  supabase: ServerClient,
  userId: string,
  workoutSessionId: string | null,
  sessionExerciseId: string | null,
): Promise<boolean> {
  let sessionId = workoutSessionId;

  if (sessionExerciseId) {
    const { data } = await supabase
      .from("workout_session_exercises")
      .select("workout_session_id")
      .eq("id", sessionExerciseId)
      .maybeSingle();
    if (!data) return false;
    if (sessionId && data.workout_session_id !== sessionId) return false;
    sessionId = data.workout_session_id;
  }

  if (!sessionId) return true;

  const { data } = await supabase
    .from("workout_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

/**
 * POST /api/setvision/results — persists a SetVision analysis (spec
 * Part B §26). The video itself is never sent here; only the already
 * client-computed, structured analysis and (optionally) a storage
 * path the video was separately uploaded to. See
 * /api/setvision/upload-url for the upload step.
 *
 * The rep timeline (phase timestamps) is validated for order, internal
 * consistency and the video's duration, and stored intact — an analysis
 * whose timeline can't be stored truthfully is rejected, not trimmed.
 *
 * `analysis: null` saves a MANUAL REVIEW (custom exercise, or one without an
 * engine): exercise 'manual_review', no automated metrics (NULL, never 0),
 * only the user's own marked reps and notes. A custom name is validated and
 * kept on this row only — it is never added to the exercise catalogue.
 * Nothing here writes to workout sets or performance history.
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

  const parsed = saveRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { analysis, workoutSessionId, sessionExerciseId, videoStoragePath, videoDurationMs } = parsed.data;
  const review = parsed.data.review ?? EMPTY_REVIEW;

  if (videoStoragePath && !videoStoragePath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ ok: false, error: "Invalid video path." }, { status: 400 });
  }

  if (!(await linkedRowsAreOwn(supabase, user.id, workoutSessionId ?? null, sessionExerciseId ?? null))) {
    return NextResponse.json({ ok: false, error: "Workout not found." }, { status: 404 });
  }

  const identity = resolveIdentity(parsed.data);

  const { data, error } = await supabase
    .from("setvision_analyses")
    .insert({
      user_id: user.id,
      workout_session_id: workoutSessionId ?? null,
      session_exercise_id: sessionExerciseId ?? null,
      exercise: analysis?.exercise ?? MANUAL_REVIEW_EXERCISE,
      video_storage_path: videoStoragePath ?? null,
      reps: analysis ? analysis.reps : null,
      rom_consistency: analysis?.technique.romConsistency ?? null,
      tempo_consistency: analysis?.technique.tempoConsistency ?? null,
      bar_path_consistency: analysis?.technique.barPathConsistency ?? null,
      asymmetry_deg: analysis?.technique.asymmetryDeg ?? null,
      average_eccentric_time_sec: analysis?.averageEccentricTime ?? null,
      average_concentric_time_sec: analysis?.averageConcentricTime ?? null,
      velocity_calibrated: analysis?.velocity.calibrated ?? false,
      velocity_unit: analysis?.velocity.unit ?? "torso-lengths/s",
      velocity_mean: analysis?.velocity.mean ?? null,
      velocity_peak: analysis?.velocity.peak ?? null,
      velocity_final: analysis?.velocity.final ?? null,
      velocity_loss: analysis?.velocity.velocityLoss ?? null,
      exercise_classification_confidence: analysis?.exerciseClassification.confidence ?? null,
      confidence: analysis ? analysis.confidence : null,
      limitations: analysis?.limitations ?? [],
      per_rep: {
        ...(analysis ? analysis.perRep : {}),
        events: analysis?.events ?? [],
        abstainReason: analysis?.abstainReason ?? null,
        measuredSide: analysis?.measuredSide ?? null,
        videoDurationMs,
        identity,
        review,
      },
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

  // Only an engine run is a SET_ANALYZED event; a manual review measured nothing.
  if (analysis) {
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
  }

  return NextResponse.json({ ok: true, id: data.id, analyzedAt: data.analyzed_at });
}

const LIST_COLUMNS =
  "id, exercise, reps, rom_consistency, tempo_consistency, bar_path_consistency, average_eccentric_time_sec, average_concentric_time_sec, velocity_calibrated, velocity_unit, velocity_mean, velocity_loss, confidence, analyzed_at, workout_session_id, session_exercise_id, per_rep->identity, per_rep->review";

/**
 * GET /api/setvision/results?sessionExerciseId=... — history for the
 * current user, optionally scoped to one logged exercise.
 * GET /api/setvision/results?id=... — one of the caller's analyses, restored
 * in full (per-rep timeline included). Another user's id is a 404.
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
  const id = searchParams.get("id");

  if (id !== null) {
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ ok: false, error: "Invalid id." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("setvision_analyses")
      .select(SAVED_ANALYSIS_COLUMNS)
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("[SETVISION RESULTS API ERROR]", error);
      return NextResponse.json({ ok: false, error: "Could not load the analysis." }, { status: 500 });
    }

    const restored = data ? restoreSavedAnalysis(data as unknown as SavedAnalysisRow) : null;

    if (!restored) {
      return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, result: restored });
  }

  const sessionExerciseId = searchParams.get("sessionExerciseId");

  let query = supabase
    .from("setvision_analyses")
    .select(LIST_COLUMNS)
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

  return NextResponse.json({ ok: true, results: data ?? [] });
}

export type { SetVisionAnalysis };
