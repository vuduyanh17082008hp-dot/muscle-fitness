import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { loadRadarContext } from "@/lib/health-radar/load-radar-context";
import { buildRecoveryRadar } from "@/lib/health-radar/recovery-radar-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dante/recovery-radar — the Performance/Recovery Radar
 * (spec Part "4."). Deterministic personal-baseline anomaly detection,
 * never a diagnosis. See recovery-radar-engine.ts for the "unusual
 * recovery pattern, not 'you are sick'" language requirement.
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
    const input = await loadRadarContext(supabase, user.id);
    const radar = buildRecoveryRadar(input);

    return NextResponse.json({ ok: true, radar });
  } catch (error) {
    console.error("[RECOVERY RADAR API ERROR]", error);

    return NextResponse.json(
      { ok: false, error: "Could not compute the recovery radar right now." },
      { status: 500 },
    );
  }
}
