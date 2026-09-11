import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { loadTrainingContext } from "@/lib/training/load-training-context";
import { simulateWhatIf } from "@/lib/training/what-if";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const whatIfSchema = z.object({
  deltas: z
    .array(
      z.object({
        exerciseId: z.string().uuid(),
        setDelta: z.number().int().min(-20).max(20),
      }),
    )
    .min(1)
    .max(20),
});

/**
 * Stateless What-If simulation (spec §24-§26). This route is
 * READ-ONLY against the database — it loads the current week's
 * logged sets, recomputes muscle volumes with hypothetical deltas
 * applied in memory, and returns CURRENT vs SIMULATED. It never
 * writes to exercise_sets/workout_sessions or any plan table.
 */
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
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = whatIfSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid what-if request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const trainingContext = await loadTrainingContext(supabase, user.id, {
      windowDays: 7,
    });

    const result = simulateWhatIf(
      trainingContext.currentWeekSets,
      parsed.data.deltas,
      trainingContext.contributionsByExercise,
    );

    const serializeBreakdown = (map: typeof result.current) =>
      Object.fromEntries(
        Array.from(map.entries()).map(([muscle, breakdown]) => [muscle, breakdown]),
      );

    return NextResponse.json({
      ok: true,
      current: serializeBreakdown(result.current),
      simulated: serializeBreakdown(result.simulated),
      changedMuscles: result.changedMuscles,
      exerciseNames: Object.fromEntries(
        Array.from(trainingContext.exercisesById.entries()).map(([id, exercise]) => [
          id,
          exercise.name,
        ]),
      ),
    });
  } catch (error) {
    console.error("[TRAINING INTELLIGENCE WHAT-IF API]", error);

    return NextResponse.json(
      { ok: false, error: "Unable to run the simulation right now." },
      { status: 500 },
    );
  }
}
