import { NextResponse } from "next/server";
import { logSet } from "@/features/workout/store";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Progress endpoint used by saveWorkoutSetAction.
 * Accepts save_set / log_set payloads from the workout player bridge.
 */
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
    };

    const action = body.action ?? body.type ?? "save_set";

    if (action !== "save_set" && action !== "log_set") {
      return NextResponse.json(
        { error: "Unknown progress action", message: "Unknown progress action" },
        { status: 400 },
      );
    }

    const sessionExerciseId =
      body.sessionExerciseId ?? body.session_exercise_id;
    const setId = body.setId ?? body.set_id;

    if (!sessionExerciseId || !setId) {
      return NextResponse.json(
        {
          error: "Missing fields",
          message: "Thiếu sessionExerciseId hoặc setId.",
        },
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
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed",
        message: error instanceof Error ? error.message : "Failed",
      },
      { status: 400 },
    );
  }
}
