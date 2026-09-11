import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { buildAthleteState } from "@/lib/athlete-state/build-athlete-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Read-only Training Intelligence summary for the signed-in user.
 * Identity is always derived from the authenticated session — never
 * from client input — so one user can never read another user's
 * computed analytics.
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

  try {
    const athleteState = await buildAthleteState(supabase, user.id, {
      timeZoneOffsetMinutes: Number.isFinite(timeZoneOffsetMinutes) ? timeZoneOffsetMinutes : 0,
    });

    return NextResponse.json({ ok: true, athleteState });
  } catch (error) {
    console.error("[TRAINING INTELLIGENCE API]", error);

    return NextResponse.json(
      { ok: false, error: "Unable to compute training intelligence right now." },
      { status: 500 },
    );
  }
}
