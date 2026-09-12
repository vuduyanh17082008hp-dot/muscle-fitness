import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getOrBuildDailyIntelligence } from "@/lib/dante-core/daily-intelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dante/daily — Dante's Daily Intelligence summary (spec
 * Part B §15). Reads today's cached snapshot if one exists
 * (recomputed by lib/events/emit.ts after a meaningful event);
 * builds and caches one on first request of the day otherwise.
 */
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const intelligence = await getOrBuildDailyIntelligence(supabase, user.id);
    return NextResponse.json({ ok: true, intelligence });
  } catch (error) {
    console.error("[DANTE DAILY API ERROR]", error);
    return NextResponse.json(
      { ok: false, error: "Could not build today's summary." },
      { status: 500 },
    );
  }
}
