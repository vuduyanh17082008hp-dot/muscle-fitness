import { NextResponse } from "next/server";
import {
  completeSession,
  getSession,
  listExercises,
  listSessions,
  logSet,
  replaceExercise,
  skipExercise,
} from "@/features/workout/store";
import { buildNextSessionRecommendation } from "@/features/workout/calculations";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      action?: string;
      type?: string;
      sessionExerciseId?: string;
      session_exercise_id?: string;
      setId?: string;
      set_id?: string;
      weightKg?: number;
      weight_kg?: number;
      reps?: number;
      rir?: number;
      newExerciseId?: string;
      new_exercise_id?: string;
    };

    const action = body.action ?? body.type ?? "";
    const sessionExerciseId =
      body.sessionExerciseId ?? body.session_exercise_id;
    const setId = body.setId ?? body.set_id;
    const newExerciseId = body.newExerciseId ?? body.new_exercise_id;

    if (action === "log_set" || action === "save_set") {
      if (!sessionExerciseId || !setId) {
        return NextResponse.json(
          { error: "Missing fields", message: "Missing fields" },
          { status: 400 },
        );
      }
      const session = await logSet({
        sessionId: id,
        sessionExerciseId,
        setId,
        weightKg: Number(body.weightKg ?? body.weight_kg ?? 0),
        reps: Number(body.reps ?? 0),
        rir:
          typeof body.rir === "number" && !Number.isNaN(body.rir)
            ? body.rir
            : undefined,
      });
      return NextResponse.json({
        session,
        message: "Set đã được lưu.",
      });
    }

    if (action === "skip_exercise") {
      if (!sessionExerciseId) {
        return NextResponse.json(
          { error: "Missing exercise", message: "Missing exercise" },
          { status: 400 },
        );
      }
      const session = await skipExercise({
        sessionId: id,
        sessionExerciseId,
      });
      return NextResponse.json({
        session,
        message: "Đã bỏ qua bài tập.",
      });
    }

    if (action === "replace_exercise") {
      if (!sessionExerciseId || !newExerciseId) {
        return NextResponse.json(
          { error: "Missing fields", message: "Missing fields" },
          { status: 400 },
        );
      }
      const session = await replaceExercise({
        sessionId: id,
        sessionExerciseId,
        newExerciseId,
      });
      return NextResponse.json({
        session,
        message: "Đã thay bài tập.",
      });
    }

    if (action === "complete" || action === "finish_workout") {
      const session = await completeSession(id);
      const [sessions, exercises] = await Promise.all([
        listSessions(),
        listExercises(),
      ]);
      const recommendation = buildNextSessionRecommendation(
        session,
        sessions,
        exercises,
      );
      return NextResponse.json({
        session,
        recommendation,
        message: "Workout đã hoàn thành.",
      });
    }

    return NextResponse.json(
      { error: "Unknown action", message: "Unknown action" },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 },
    );
  }
}

export async function GET(_request: Request, context: Ctx) {
  const { id } = await context.params;
  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ session });
}
