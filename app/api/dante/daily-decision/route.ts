import { after, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { buildAthleteState } from "@/lib/athlete-state/build-athlete-state";
import { loadTrainingContext } from "@/lib/training/load-training-context";
import { loadTodaySession } from "@/lib/training/load-today-session";
import { buildDailyDecision } from "@/lib/dante-core/daily-decision-engine";
import { buildAdaptiveProgram } from "@/lib/dante-core/adaptive-program-engine";
import { logProgramAdaptations } from "@/lib/dante-core/program-adaptation-log";
import { buildPerformanceForecast } from "@/lib/dante-core/performance-forecast";
import { observeDailyDecisionInShadow } from "@/lib/dante-core/shadow/shadow-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dante/daily-decision — the "what should I do today?"
 * endpoint (mission success criterion). Assembles, in one response,
 * everything the compact Dante UI needs: the Daily Decision (+ any
 * one-click proposed actions), the next-session Adaptive Program
 * adaptations, and a cautious Performance Forecast — all computed
 * deterministically from the same AthleteState/TrainingContext read,
 * never from a second, independent source of truth.
 */
export async function GET(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const offsetParam = url.searchParams.get("timeZoneOffsetMinutes");
  const timeZoneOffsetMinutes = offsetParam !== null ? Number(offsetParam) : 0;
  const normalizedOffset = Number.isFinite(timeZoneOffsetMinutes) ? timeZoneOffsetMinutes : 0;

  try {
    const [athleteState, trainingContext, todaySession] = await Promise.all([
      buildAthleteState(supabase, user.id, { timeZoneOffsetMinutes: normalizedOffset }),
      loadTrainingContext(supabase, user.id, { timeZoneOffsetMinutes: normalizedOffset }),
      loadTodaySession(supabase, user.id),
    ]);

    const { decision, proposedActions } = buildDailyDecision(
      athleteState,
      trainingContext,
      todaySession,
    );

    const programAdaptations = buildAdaptiveProgram(athleteState, trainingContext);
    const forecast = buildPerformanceForecast(athleteState);

    // Audit-log adaptations now that they've been computed — best-effort, never blocks the response.
    logProgramAdaptations(supabase, user.id, programAdaptations).catch((error: unknown) => {
      console.warn("[DAILY DECISION API] Unable to log program adaptations:", error);
    });

    // Phase 3 is observational only. Production decision construction is
    // already complete, and this result is never read back into the response.
    try {
      after(async () => {
        try {
          await observeDailyDecisionInShadow({
            supabase,
            userId: user.id,
            athleteState,
            productionDecision: decision,
            productionActions: proposedActions,
          });
        } catch (error) {
          console.warn("[DANTE PHASE3] Shadow observation failed without affecting production", error);
        }
      });
    } catch (error) {
      console.warn("[DANTE PHASE3] Shadow observation could not be scheduled", error);
    }

    return NextResponse.json({
      ok: true,
      decision,
      proposedActions,
      programAdaptations,
      forecast,
    });
  } catch (error) {
    console.error("[DAILY DECISION API ERROR]", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          process.env.NODE_ENV === "development"
            ? error instanceof Error
              ? error.message
              : "Unknown error."
            : "Could not compute today's decision right now.",
      },
      { status: 500 },
    );
  }
}
