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
      action: "log_set" | "skip_exercise" | "replace_exercise" | "complete";
      sessionExerciseId?: string;
      setId?: string;
      weightKg?: number;
      reps?: number;
      rir?: number;
      newExerciseId?: string;
    };

    if (body.action === "log_set") {
      if (!body.sessionExerciseId || !body.setId) {
        return NextResponse.json({ error: "Missing fields" }, { status: 400 });
      }
      const session = await logSet({
        sessionId: id,
        sessionExerciseId: body.sessionExerciseId,
        setId: body.setId,
        weightKg: Number(body.weightKg ?? 0),
        reps: Number(body.reps ?? 0),
        rir:
          typeof body.rir === "number" && !Number.isNaN(body.rir)
            ? body.rir
            : undefined,
      });
      return NextResponse.json({ session });
    }

    if (body.action === "skip_exercise") {
      if (!body.sessionExerciseId) {
        return NextResponse.json({ error: "Missing exercise" }, { status: 400 });
      }
      const session = await skipExercise({
        sessionId: id,
        sessionExerciseId: body.sessionExerciseId,
      });
      return NextResponse.json({ session });
    }

    if (body.action === "replace_exercise") {
      if (!body.sessionExerciseId || !body.newExerciseId) {
        return NextResponse.json({ error: "Missing fields" }, { status: 400 });
      }
      const session = await replaceExercise({
        sessionId: id,
        sessionExerciseId: body.sessionExerciseId,
        newExerciseId: body.newExerciseId,
      });
      return NextResponse.json({ session });
    }

    if (body.action === "complete") {
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
      return NextResponse.json({ session, recommendation });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
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
