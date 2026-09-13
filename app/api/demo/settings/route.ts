import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { loadDemoSettings, saveDemoSettings } from "@/lib/demo/settings";
import { DEMO_SCENARIOS, type DemoScenarioId } from "@/lib/demo/scenarios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCENARIO_IDS = DEMO_SCENARIOS.map((s) => s.id) as [DemoScenarioId, ...DemoScenarioId[]];

const putSchema = z.object({
  enabled: z.boolean(),
  scenario: z.enum(SCENARIO_IDS).nullable(),
});

/** GET /api/demo/settings — this user's own demo-mode toggle (never anyone else's). */
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const settings = await loadDemoSettings(supabase, user.id);

  return NextResponse.json({ ok: true, settings, scenarios: DEMO_SCENARIOS });
}

/** PUT /api/demo/settings — enable/disable demo mode + pick a scenario, scoped to the signed-in user only. */
export async function PUT(request: Request) {
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

  const parsed = putSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await saveDemoSettings(supabase, user.id, parsed.data);

  if (!result.success) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
