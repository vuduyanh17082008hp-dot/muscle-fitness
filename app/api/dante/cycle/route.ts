import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { runDanteCycleForUser } from "@/lib/dante-core/orchestrator/run-cycle-for-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dante/cycle — the Fresh-Context Loop entry point (mission
 * Part 10.D): loads current canonical state, runs the deterministic
 * Orchestrator (Analyst -> Specialist/Planner -> Checker -> Safety),
 * auto-applies whatever the autonomy gate and action budgets allow,
 * and returns the result. Nothing here calls an LLM — this answers
 * "what changed / what should happen next / why / how confident /
 * may you handle it automatically" entirely from deterministic code
 * (mission's Success Test, questions 2-6). Question 7/8 ("what
 * happened after" / "what did you learn") are answered by a later
 * reflection call — see lib/dante-core/memory-hierarchy/record-observation.ts —
 * once a real outcome exists to learn from.
 */
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDanteCycleForUser(supabase, user.id);

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[DANTE CYCLE API ERROR]", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          process.env.NODE_ENV === "development"
            ? error instanceof Error
              ? error.message
              : "Unknown error."
            : "Dante could not run this cycle right now.",
      },
      { status: 500 },
    );
  }
}
